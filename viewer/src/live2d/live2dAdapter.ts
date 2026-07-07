import { Application, Ticker } from 'pixi.js'
import { Live2DModel, MotionPriority } from '@jannchie/pixi-live2d-display/cubism4'
import type { ModelAdapter, ParameterInfo } from '../core/types'

/**
 * Live2D Cubism Core が持つ生パラメータテーブルの型（必要な部分のみ）。
 * coreModel.getModel() で取得できる。
 */
interface CubismCoreParameters {
  count: number
  ids: string[]
  minimumValues: Float32Array
  maximumValues: Float32Array
  defaultValues: Float32Array
  values: Float32Array
}

export async function createLive2dAdapter(
  container: HTMLElement,
  modelUrl: string,
): Promise<ModelAdapter> {
  if (!(window as { Live2DCubismCore?: unknown }).Live2DCubismCore) {
    throw new Error(
      'Live2D Cubism Core が読み込まれていません。`npm run setup:assets` を実行してください。',
    )
  }

  const canvas = document.createElement('canvas')
  container.appendChild(canvas)

  const app = new Application()
  await app.init({
    canvas,
    resizeTo: container,
    backgroundAlpha: 0, // OBS取り込みを見据えて透過
    antialias: true,
    // Cubism CoreはWebGL専用。pixi v8がWebGPUを自動選択すると描画されないため固定する
    preference: 'webgl',
  })

  const model = await Live2DModel.from(modelUrl, {
    ticker: Ticker.shared,
    autoHitTest: false,
    autoFocus: false, // マウス追従で目線パラメータが上書きされるのを防ぐ
    idleMotionGroup: 'none-disabled', // 存在しないグループ名を指定してアイドルモーションを止める
  })
  // このフォークはレンダラを `model.renderer` か `window.app` から解決する。
  // グローバル汚染を避け、rendererを直接渡す（無いと描画が黙ってスキップされる）
  ;(model as unknown as { renderer?: unknown }).renderer = app.renderer
  app.stage.addChild(model)

  const internalModel = model.internalModel
  if (!internalModel) {
    throw new Error('Live2Dモデルの内部モデルを取得できませんでした')
  }
  // 自動まばたき・呼吸はスライダー操作を毎フレーム上書きするため無効化する
  internalModel.eyeBlinkEnabled = false
  ;(internalModel as unknown as { breath?: unknown }).breath = undefined

  const coreModel = internalModel.coreModel as unknown as {
    getModel(): { parameters: CubismCoreParameters }
    setParameterValueById(id: string, value: number, weight?: number): void
    getParameterValueById(id: string): number
  }
  const params = coreModel.getModel().parameters

  // ユーザーが触った値を保持し、モーション更新後（beforeModelUpdate）に
  // 毎フレーム適用する。これでモーションのloadParameters/saveParametersに
  // 上書きされない。
  const overrides = new Map<string, number>()
  internalModel.on('beforeModelUpdate', () => {
    for (const [id, value] of overrides) {
      coreModel.setParameterValueById(id, value)
    }
  })

  // モデルをステージ中央にフィットさせる
  const fit = () => {
    const scale = Math.min(
      app.screen.width / internalModel.originalWidth,
      app.screen.height / internalModel.originalHeight,
    )
    model.scale.set(scale)
    model.position.set(
      (app.screen.width - internalModel.originalWidth * scale) / 2,
      (app.screen.height - internalModel.originalHeight * scale) / 2,
    )
  }
  fit()
  const onResize = () => fit()
  window.addEventListener('resize', onResize)

  const parameters: ParameterInfo[] = params.ids.map((id, i) => ({
    id: `param.${id}`,
    label: id,
    group: guessGroup(id),
    min: params.minimumValues[i],
    max: params.maximumValues[i],
    defaultValue: params.defaultValues[i],
  }))

  const rawId = (id: string) => id.slice('param.'.length)

  // exp3.json 由来の表情名と、motion3.json のグループ名を設定ファイルから列挙する
  const settings = internalModel.settings as unknown as {
    expressions?: Array<{ Name: string }>
    motions?: Record<string, unknown[]>
  }
  const expressionNames = settings.expressions?.map((e) => e.Name) ?? []
  const motionGroups = Object.keys(settings.motions ?? {})

  return {
    kind: 'live2d',
    modelName: modelUrl.split('/').pop() ?? 'Live2D',

    listParameters: () => parameters,

    listExpressions: () => expressionNames,

    setExpression: async (name, weight) => {
      const resolved = expressionNames.find((n) => n.toLowerCase() === name.toLowerCase())
      if (!resolved) return false
      // Live2Dの表情はon/off切替のみ（重み指定は非対応）。weight=0で解除する
      if (weight <= 0) {
        internalModel.motionManager.expressionManager?.resetExpression()
        return true
      }
      return model.expression(resolved)
    },

    listMotions: () => motionGroups,

    playMotion: async (name) => {
      const resolved = motionGroups.find((g) => g.toLowerCase() === name.toLowerCase())
      if (!resolved) return false
      // MCP経由の指示は「今すぐ再生」が期待値なので、再生中モーションに割り込む
      return model.motion(resolved, undefined, MotionPriority.FORCE)
    },

    getParameter: (id) => {
      if (!id.startsWith('param.')) return undefined
      return overrides.get(rawId(id)) ?? coreModel.getParameterValueById(rawId(id))
    },

    setParameter: (id, value) => {
      if (!id.startsWith('param.')) return
      overrides.set(rawId(id), value)
    },

    resetAll: () => {
      overrides.clear()
      for (let i = 0; i < params.count; i++) {
        coreModel.setParameterValueById(params.ids[i], params.defaultValues[i])
      }
    },

    dispose: () => {
      window.removeEventListener('resize', onResize)
      model.destroy()
      app.destroy(true, { children: true })
      canvas.remove()
    },
  }
}

/** Live2D標準の命名慣習からUI用のグループ名を推測する */
function guessGroup(id: string): string {
  const lower = id.toLowerCase()
  if (lower.includes('eye') || lower.includes('brow')) return 'face'
  if (lower.includes('mouth')) return 'mouth'
  if (lower.includes('angle')) return 'angle'
  if (lower.includes('body') || lower.includes('breath')) return 'body'
  if (lower.includes('hair')) return 'hair'
  return 'other'
}
