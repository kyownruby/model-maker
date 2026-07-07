import type { ModelAdapter } from '../core/types'
import type { CommandMessage, HelloMessage, ResponseMessage } from './protocol'
import { DEFAULT_WS_PORT } from './protocol'
import * as commands from './commands'

const RECONNECT_DELAY_MS = 3000

/** Blob → base64（大きなファイルでもスタックを溢れさせないようFileReaderを使う） */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** ビューア本体（main.ts）がブリッジへ提供するフック */
export interface BridgeHost {
  getAdapter(): ModelAdapter | null
  /** load_model コマンドの実体。URLからモデル種別を判定して読み込む */
  loadModel(url: string): Promise<void>
  /** リモート操作でパラメータが変わった後に呼ばれる（スライダー再同期用） */
  onRemoteChange(): void
  onStatusChange(connected: boolean): void
}

export interface Bridge {
  /** モデルの読み込み・切替後に呼ぶと、サーバーへhelloを送り直す */
  notifyModelChanged(): void
}

/**
 * MCPサーバーへのWebSocket接続を維持するクライアント。
 * 切断時は自動再接続する（MCPサーバーが後から起動してもOK）。
 */
export function startBridge(host: BridgeHost, wsUrl?: string): Bridge {
  const url =
    wsUrl ??
    new URLSearchParams(location.search).get('ws') ??
    `ws://localhost:${DEFAULT_WS_PORT}`

  let socket: WebSocket | null = null

  const sendHello = () => {
    if (socket?.readyState !== WebSocket.OPEN) return
    const adapter = host.getAdapter()
    const hello: HelloMessage = {
      type: 'hello',
      modelKind: adapter?.kind ?? 'none',
      modelName: adapter?.modelName ?? '(no model)',
    }
    socket.send(JSON.stringify(hello))
  }

  const respond = (id: string, ok: boolean, result?: unknown, error?: string) => {
    if (socket?.readyState !== WebSocket.OPEN) return
    const message: ResponseMessage = { type: 'response', id, ok, result, error }
    socket.send(JSON.stringify(message))
  }

  const handleCommand = async (command: CommandMessage) => {
    const adapter = host.getAdapter()
    try {
      if (command.action === 'loadModel') {
        await host.loadModel(String(command.args.url))
        const loaded = host.getAdapter()
        respond(command.id, true, loaded ? commands.summarizeModel(loaded) : { loaded: false })
        sendHello()
        return
      }
      if (!adapter) {
        respond(command.id, false, undefined, 'モデルの読み込みが完了していません')
        return
      }
      switch (command.action) {
        case 'listParameters':
          respond(command.id, true, commands.describeModel(adapter))
          return
        case 'getStatus':
          respond(command.id, true, commands.summarizeModel(adapter))
          return
        case 'setParameter': {
          const id = String(command.args.id)
          const value = Number(command.args.value)
          const param = adapter.listParameters().find((p) => p.id === id)
          if (!param) {
            respond(command.id, false, undefined, `パラメータが見つかりません: ${id}`)
            return
          }
          const clamped = Math.min(param.max, Math.max(param.min, value))
          adapter.setParameter(id, clamped)
          host.onRemoteChange()
          respond(command.id, true, { id, value: clamped })
          return
        }
        case 'setExpression': {
          const name = String(command.args.name)
          const weight = Number(command.args.weight ?? 1)
          const ok = await adapter.setExpression(name, weight)
          if (!ok) {
            respond(
              command.id,
              false,
              undefined,
              `表情が見つかりません: "${name}"。利用可能: ${adapter.listExpressions().join(', ') || '(なし)'}`,
            )
            return
          }
          host.onRemoteChange()
          respond(command.id, true, { expression: name, weight })
          return
        }
        case 'lookAt': {
          const applied = commands.lookAt(adapter, Number(command.args.x), Number(command.args.y))
          host.onRemoteChange()
          respond(command.id, true, { applied })
          return
        }
        case 'setBodyAngle': {
          const applied = commands.setBodyAngle(
            adapter,
            Number(command.args.x ?? 0),
            Number(command.args.y ?? 0),
            Number(command.args.z ?? 0),
          )
          host.onRemoteChange()
          respond(command.id, true, { applied })
          return
        }
        case 'setMouth': {
          const applied = commands.setMouth(adapter, Number(command.args.open))
          host.onRemoteChange()
          respond(command.id, true, { applied })
          return
        }
        case 'listExportFormats': {
          respond(command.id, true, { formats: adapter.listExportFormats() })
          return
        }
        case 'exportModel': {
          const format = String(command.args.format)
          const exported = await adapter.exportModel(format)
          if (!exported) {
            respond(
              command.id,
              false,
              undefined,
              `この形式では書き出せません: "${format}"。利用可能: ${adapter.listExportFormats().join(', ')}`,
            )
            return
          }
          const dataBase64 = await blobToBase64(exported.blob)
          respond(command.id, true, {
            filename: exported.filename,
            size: exported.blob.size,
            dataBase64,
          })
          return
        }
        case 'playMotion': {
          const name = String(command.args.name)
          const ok = await adapter.playMotion(name)
          if (!ok) {
            respond(
              command.id,
              false,
              undefined,
              `モーションを再生できません: "${name}"。利用可能: ${adapter.listMotions().join(', ') || '(このモデルは非対応)'}`,
            )
            return
          }
          respond(command.id, true, { motion: name })
          return
        }
        default:
          respond(command.id, false, undefined, `未知のコマンド: ${command.action}`)
      }
    } catch (error) {
      respond(
        command.id,
        false,
        undefined,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const connect = () => {
    socket = new WebSocket(url)
    socket.onopen = () => {
      host.onStatusChange(true)
      sendHello()
    }
    socket.onmessage = (event) => {
      let message: CommandMessage
      try {
        message = JSON.parse(String(event.data)) as CommandMessage
      } catch {
        return
      }
      if (message.type === 'command') void handleCommand(message)
    }
    socket.onclose = () => {
      host.onStatusChange(false)
      setTimeout(connect, RECONNECT_DELAY_MS)
    }
    socket.onerror = () => {
      socket?.close()
    }
  }
  connect()

  return { notifyModelChanged: sendHello }
}
