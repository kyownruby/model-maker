import type { ModelAdapter, ModelKind } from './core/types'
import { createVrmAdapter } from './vrm/vrmAdapter'
import { createLive2dAdapter } from './live2d/live2dAdapter'
import { buildSliderPanel, syncSliderValues } from './ui/sliders'
import { startBridge } from './bridge/wsBridge'

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
const wsStatusEl = document.getElementById('ws-status')!
const exportButtonsEl = document.getElementById('export-buttons')!
const tabs = document.querySelectorAll<HTMLButtonElement>('.tab')
const resetButton = document.getElementById('reset-all')!

const query = new URLSearchParams(location.search)
const modelUrls: Record<ModelKind, string> = {
  vrm: query.get('vrm') ?? DEFAULT_VRM_URL,
  live2d: query.get('live2d') ?? DEFAULT_LIVE2D_URL,
}

let currentAdapter: ModelAdapter | null = null
let loading: Promise<void> | null = null

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

function setActiveTab(mode: ModelKind): void {
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === mode))
}

async function switchMode(mode: ModelKind): Promise<void> {
  if (loading) await loading.catch(() => {})
  const task = (async () => {
    statusEl.textContent = `loading ${mode} model...`
    setActiveTab(mode)

    currentAdapter?.dispose()
    currentAdapter = null
    stage.innerHTML = ''
    slidersRoot.innerHTML = ''

    if (mode === 'vrm') {
      currentAdapter = await createVrmAdapter(stage, modelUrls.vrm)
    } else {
      await ensureCubismCore()
      currentAdapter = await createLive2dAdapter(stage, modelUrls.live2d)
    }
    buildSliderPanel(slidersRoot, currentAdapter)
    buildExportButtons(currentAdapter)
    const count = currentAdapter.listParameters().length
    statusEl.textContent = `${currentAdapter.modelName} — ${count} parameters`
  })()
  loading = task
  try {
    await task
    bridge.notifyModelChanged()
  } catch (error) {
    console.error(error)
    statusEl.textContent = `error: ${error instanceof Error ? error.message : String(error)}`
    throw error
  } finally {
    loading = null
  }
}

function buildExportButtons(adapter: ModelAdapter): void {
  exportButtonsEl.innerHTML = ''
  for (const format of adapter.listExportFormats()) {
    const button = document.createElement('button')
    button.textContent = `⬇ ${format}`
    button.addEventListener('click', async () => {
      button.disabled = true
      try {
        const exported = await adapter.exportModel(format)
        if (!exported) return
        const url = URL.createObjectURL(exported.blob)
        const a = document.createElement('a')
        a.href = url
        a.download = exported.filename
        a.click()
        URL.revokeObjectURL(url)
      } catch (error) {
        console.error(error)
        statusEl.textContent = `export error: ${error instanceof Error ? error.message : error}`
      } finally {
        button.disabled = false
      }
    })
    exportButtonsEl.appendChild(button)
  }
}

// MCPサーバーとの接続（サーバー未起動でも自動再接続で待ち続ける）
const bridge = startBridge({
  getAdapter: () => currentAdapter,

  loadModel: async (url: string) => {
    const kind: ModelKind = url.toLowerCase().endsWith('.vrm') ? 'vrm' : 'live2d'
    modelUrls[kind] = url
    await switchMode(kind)
  },

  onRemoteChange: () => {
    if (currentAdapter) syncSliderValues(slidersRoot, currentAdapter)
  },

  onStatusChange: (connected) => {
    wsStatusEl.textContent = connected ? 'MCP: connected' : 'MCP: offline'
    wsStatusEl.classList.toggle('connected', connected)
  },
})

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.classList.contains('active')) return
    void switchMode(tab.dataset.mode as ModelKind).catch(() => {})
  })
})

resetButton.addEventListener('click', () => {
  if (!currentAdapter) return
  currentAdapter.resetAll()
  syncSliderValues(slidersRoot, currentAdapter)
})

void switchMode('vrm').catch(() => {})
