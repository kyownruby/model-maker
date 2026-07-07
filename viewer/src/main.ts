import type { ModelAdapter, ModelKind } from './core/types'
import { createVrmAdapter } from './vrm/vrmAdapter'
import { createLive2dAdapter } from './live2d/live2dAdapter'
import { buildSliderPanel, syncSliderValues } from './ui/sliders'

/**
 * デフォルトのサンプルモデル。
 * URLクエリ ?vrm=<url> / ?live2d=<url> で差し替え可能。
 * - VRM: `npm run setup:assets` でダウンロードされるローカルファイル
 * - Live2D: pixi-live2d-display のテストアセット（CDN経由・開発用）
 */
const DEFAULT_VRM_URL = './models/vrm/sample.vrm'
const DEFAULT_LIVE2D_URL =
  'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json'

const CUBISM_CORE_CDN = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js'

const stage = document.getElementById('stage')!
const slidersRoot = document.getElementById('sliders')!
const statusEl = document.getElementById('status')!
const tabs = document.querySelectorAll<HTMLButtonElement>('.tab')
const resetButton = document.getElementById('reset-all')!

const query = new URLSearchParams(location.search)
const vrmUrl = query.get('vrm') ?? DEFAULT_VRM_URL
const live2dUrl = query.get('live2d') ?? DEFAULT_LIVE2D_URL

let currentAdapter: ModelAdapter | null = null
let loading = false

/** vendor に Cubism Core が無い環境では公式CDNからのフォールバックを試す */
async function ensureCubismCore(): Promise<void> {
  if ((window as { Live2DCubismCore?: unknown }).Live2DCubismCore) return
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CUBISM_CORE_CDN
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Cubism Core の読み込みに失敗しました'))
    document.head.appendChild(script)
  })
}

async function switchMode(mode: ModelKind): Promise<void> {
  if (loading) return
  loading = true
  statusEl.textContent = `loading ${mode} model...`

  currentAdapter?.dispose()
  currentAdapter = null
  stage.innerHTML = ''
  slidersRoot.innerHTML = ''

  try {
    if (mode === 'vrm') {
      currentAdapter = await createVrmAdapter(stage, vrmUrl)
    } else {
      await ensureCubismCore()
      currentAdapter = await createLive2dAdapter(stage, live2dUrl)
    }
    buildSliderPanel(slidersRoot, currentAdapter)
    const count = currentAdapter.listParameters().length
    statusEl.textContent = `${currentAdapter.modelName} — ${count} parameters`
  } catch (error) {
    console.error(error)
    statusEl.textContent = `error: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    loading = false
  }
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.classList.contains('active')) return
    tabs.forEach((t) => t.classList.remove('active'))
    tab.classList.add('active')
    void switchMode(tab.dataset.mode as ModelKind)
  })
})

resetButton.addEventListener('click', () => {
  if (!currentAdapter) return
  currentAdapter.resetAll()
  syncSliderValues(slidersRoot, currentAdapter)
})

void switchMode('vrm')
