import { WebSocket, WebSocketServer } from 'ws'
import type { CommandMessage, ViewerAction, ViewerMessage } from './protocol.js'

const RESPONSE_TIMEOUT_MS = 8000

/**
 * ビューアとの WebSocket 接続を管理し、コマンドの送信と
 * レスポンスの突き合わせ（request/response相関）を行う。
 * MCPサーバーはstdioをプロトコルに使うため、ログはすべてstderrへ出す。
 */
export class ViewerBridge {
  private wss: WebSocketServer
  private viewer: WebSocket | null = null
  private viewerInfo: { modelKind: string; modelName: string } | null = null
  private nextId = 1
  private pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >()

  constructor(port: number) {
    this.wss = new WebSocketServer({ port, host: '127.0.0.1' })
    this.wss.on('connection', (socket) => this.onConnection(socket))
    this.wss.on('error', (err) => console.error('[viewer-bridge] WS server error:', err.message))
    console.error(`[viewer-bridge] WebSocket server listening on ws://127.0.0.1:${port}`)
  }

  get connected(): boolean {
    return this.viewer !== null && this.viewer.readyState === WebSocket.OPEN
  }

  get info(): { modelKind: string; modelName: string } | null {
    return this.viewerInfo
  }

  private onConnection(socket: WebSocket): void {
    // 複数タブが繋がった場合は最後の接続を正とする
    if (this.viewer && this.viewer.readyState === WebSocket.OPEN) {
      console.error('[viewer-bridge] new viewer connected, replacing previous one')
      this.viewer.close(1000, 'replaced by a newer viewer connection')
    }
    this.viewer = socket
    this.viewerInfo = null
    console.error('[viewer-bridge] viewer connected')

    socket.on('message', (data) => {
      let message: ViewerMessage
      try {
        message = JSON.parse(String(data)) as ViewerMessage
      } catch {
        console.error('[viewer-bridge] invalid JSON from viewer')
        return
      }
      if (message.type === 'hello') {
        this.viewerInfo = { modelKind: message.modelKind, modelName: message.modelName }
        console.error(
          `[viewer-bridge] viewer hello: ${message.modelKind} / ${message.modelName}`,
        )
        return
      }
      if (message.type === 'response') {
        const entry = this.pending.get(message.id)
        if (!entry) return
        this.pending.delete(message.id)
        if (message.ok) {
          entry.resolve(message.result)
        } else {
          entry.reject(new Error(message.error ?? 'viewer returned an error'))
        }
      }
    })

    socket.on('close', () => {
      if (this.viewer === socket) {
        this.viewer = null
        this.viewerInfo = null
        console.error('[viewer-bridge] viewer disconnected')
      }
    })
    socket.on('error', (err) => console.error('[viewer-bridge] socket error:', err.message))
  }

  /** コマンドを送り、ビューアからの応答（またはタイムアウト）を待つ */
  async send(action: ViewerAction, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.connected || !this.viewer) {
      throw new Error(
        'ビューアが接続されていません。ブラウザで viewer を開いてください（npm run dev → http://localhost:5173）。',
      )
    }
    const id = String(this.nextId++)
    const command: CommandMessage = { type: 'command', id, action, args }
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`viewer response timed out (${RESPONSE_TIMEOUT_MS}ms)`))
        }
      }, RESPONSE_TIMEOUT_MS)
    })
    this.viewer.send(JSON.stringify(command))
    return promise
  }

  close(): void {
    this.wss.close()
  }
}
