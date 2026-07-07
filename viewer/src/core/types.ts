/**
 * ビューア全体で共有する「正規化パラメータ」の契約。
 * Phase 2 で MCP サーバーから届く操作コマンドも、この型をそのまま使う想定。
 * （設計書 4章「引数は正規化された値で統一し、内部差はサーバー側で吸収する」に対応）
 */

export type ModelKind = 'vrm' | 'live2d'

export interface ParameterInfo {
  /** 一意なパラメータID（例: "expression.happy", "lookAt.x", "param.ParamAngleX"） */
  id: string
  /** UI表示用ラベル */
  label: string
  /** UI上のグルーピング（expression / lookAt / head / body / core など） */
  group: string
  min: number
  max: number
  defaultValue: number
}

/**
 * VRM / Live2D の差を吸収する共通インターフェース。
 * MCP の list_parameters / set_* ツールはこのアダプタ経由でモデルを操作する。
 */
export interface ModelAdapter {
  readonly kind: ModelKind
  readonly modelName: string
  /** 操作可能なパラメータの一覧（MCPツール list_parameters の実体） */
  listParameters(): ParameterInfo[]
  getParameter(id: string): number | undefined
  setParameter(id: string, value: number): void
  /** モデルが持つ表情名の一覧（VRM: Expression名 / Live2D: exp3の名前） */
  listExpressions(): string[]
  /** 表情を設定する。名前が見つからなければ false を返す */
  setExpression(name: string, weight: number): boolean | Promise<boolean>
  /** モデルが持つモーショングループ名の一覧（VRMは現状空） */
  listMotions(): string[]
  /** モーションを再生する。未対応・名前不明なら false を返す */
  playMotion(name: string): boolean | Promise<boolean>
  /** このモデルで書き出せる形式（例: vrm / glb / live2d_zip） */
  listExportFormats(): string[]
  /** モデルを書き出す。未対応形式なら null を返す */
  exportModel(format: string): Promise<{ filename: string; blob: Blob } | null>
  /** すべてのパラメータをデフォルト値へ戻す */
  resetAll(): void
  /** シーン・WebGLリソースを破棄する（タブ切替時に呼ぶ） */
  dispose(): void
}
