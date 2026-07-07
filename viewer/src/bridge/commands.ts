import type { ModelAdapter } from '../core/types'

/**
 * MCPサーバーから届く高レベルコマンド（正規化値）を、
 * モデル種別ごとの実パラメータへ変換して適用する層。
 * 設計書4章「Live2D/VRMの内部差を吸収する」の実体。
 */

/**
 * 正規化値(-1..1 / 0..1)を、パラメータの実レンジへスケールして設定する。
 * 例: ParamAngleX（default 0, max 30）に norm=1.0 → 30
 */
function setNormalized(adapter: ModelAdapter, id: string, norm: number): boolean {
  const param = adapter.listParameters().find((p) => p.id === id)
  if (!param) return false
  const base = param.defaultValue
  const value =
    norm >= 0 ? base + norm * (param.max - base) : base + norm * (base - param.min)
  adapter.setParameter(id, value)
  return true
}

function applyAll(adapter: ModelAdapter, entries: Array<[string, number]>): string[] {
  const applied: string[] = []
  for (const [id, norm] of entries) {
    if (setNormalized(adapter, id, norm)) applied.push(id)
  }
  return applied
}

export function lookAt(adapter: ModelAdapter, x: number, y: number): string[] {
  if (adapter.kind === 'vrm') {
    // 目線に加えて顔も半分だけ同じ方向へ向けると自然になる
    return applyAll(adapter, [
      ['lookAt.x', x],
      ['lookAt.y', y],
      ['head.yaw', x * 0.5],
      ['head.pitch', -y * 0.5], // rotation.x正=下向きのため符号反転
    ])
  }
  return applyAll(adapter, [
    ['param.ParamEyeBallX', x],
    ['param.ParamEyeBallY', y],
    ['param.ParamAngleX', x],
    ['param.ParamAngleY', y],
  ])
}

export function setBodyAngle(adapter: ModelAdapter, x: number, y: number, z: number): string[] {
  if (adapter.kind === 'vrm') {
    return applyAll(adapter, [
      ['body.yaw', x],
      ['body.pitch', y],
      ['body.roll', z],
    ])
  }
  return applyAll(adapter, [
    ['param.ParamBodyAngleX', x],
    ['param.ParamBodyAngleY', y],
    ['param.ParamBodyAngleZ', z],
  ])
}

export function setMouth(adapter: ModelAdapter, open: number): string[] {
  if (adapter.kind === 'vrm') {
    // VRM1標準の口形状Expression「aa」を口パクに流用する
    return applyAll(adapter, [['expression.aa', open]])
  }
  return applyAll(adapter, [['param.ParamMouthOpenY', open]])
}

export function describeModel(adapter: ModelAdapter) {
  return {
    kind: adapter.kind,
    modelName: adapter.modelName,
    parameters: adapter.listParameters().map((p) => ({
      ...p,
      value: adapter.getParameter(p.id),
    })),
    expressions: adapter.listExpressions(),
    motions: adapter.listMotions(),
  }
}

export function summarizeModel(adapter: ModelAdapter) {
  return {
    viewerConnected: true,
    kind: adapter.kind,
    modelName: adapter.modelName,
    parameterCount: adapter.listParameters().length,
    expressions: adapter.listExpressions(),
    motions: adapter.listMotions(),
  }
}
