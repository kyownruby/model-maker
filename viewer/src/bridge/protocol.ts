/**
 * MCPサーバー ⇔ ビューア間の WebSocket プロトコル定義。
 * mcp-server/src/protocol.ts と同一内容を保つこと（ビルド構成を単純にするため
 * ワークスペース共有はせず、両側にコピーを置く方針）。
 */

/** ビューアに依頼できる操作。MCPツールとほぼ1:1で対応する */
export type ViewerAction =
  | 'listParameters'
  | 'setParameter'
  | 'setExpression'
  | 'lookAt'
  | 'setBodyAngle'
  | 'setMouth'
  | 'playMotion'
  | 'loadModel'
  | 'exportModel'
  | 'listExportFormats'
  | 'getStatus'

export interface CommandMessage {
  type: 'command'
  id: string
  action: ViewerAction
  args: Record<string, unknown>
}

export interface ResponseMessage {
  type: 'response'
  id: string
  ok: boolean
  result?: unknown
  error?: string
}

/** ビューアが接続直後に送る自己紹介 */
export interface HelloMessage {
  type: 'hello'
  modelKind: string
  modelName: string
}

export type ViewerMessage = ResponseMessage | HelloMessage

export const DEFAULT_WS_PORT = 8765
