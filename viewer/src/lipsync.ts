import type { ModelAdapter } from './core/types'
import { setMouth } from './bridge/commands'

/**
 * マイク入力の音量で口パクさせる（音声連動リップシンク）。
 * VOICEPEAK等の音声はVB-CABLE経由で仮想マイクに流し込む想定
 * （docs/obs-setup.md 参照）。
 *
 * URLパラメータ:
 *   ?lipsync=1        自動開始（OBSモードと併用推奨）
 *   ?mic=<部分一致>    使用する入力デバイス名（省略時は既定デバイス）
 *   ?lipsync_gain=6   感度（既定 6.0）
 */
export interface LipSync {
  stop(): void
}

const SMOOTH_ATTACK = 0.5 // 口を開く速さ（0-1、大きいほど速い）
const SMOOTH_RELEASE = 0.15 // 口を閉じる速さ
const NOISE_FLOOR = 0.01

export async function startLipSync(
  getAdapter: () => ModelAdapter | null,
  options: { deviceHint?: string; gain?: number } = {},
): Promise<LipSync> {
  const gain = options.gain ?? 6.0

  let deviceId: string | undefined
  if (options.deviceHint) {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const hint = options.deviceHint.toLowerCase()
    deviceId = devices.find(
      (d) => d.kind === 'audioinput' && d.label.toLowerCase().includes(hint),
    )?.deviceId
    if (!deviceId) {
      console.warn(`[lipsync] mic "${options.deviceHint}" not found; using default device`)
    }
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  })

  const ctx = new AudioContext()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)
  const buffer = new Float32Array(analyser.fftSize)

  let mouth = 0
  let running = true

  const tick = () => {
    if (!running) return
    requestAnimationFrame(tick)
    analyser.getFloatTimeDomainData(buffer)
    let sum = 0
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
    const rms = Math.sqrt(sum / buffer.length)
    const target = Math.min(1, Math.max(0, (rms - NOISE_FLOOR) * gain))
    // 開くときは素早く、閉じるときはゆっくり追従させると自然に見える
    const k = target > mouth ? SMOOTH_ATTACK : SMOOTH_RELEASE
    mouth += (target - mouth) * k
    const adapter = getAdapter()
    if (adapter) setMouth(adapter, mouth < 0.02 ? 0 : mouth)
  }
  tick()

  console.info('[lipsync] started')
  return {
    stop() {
      running = false
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
      const adapter = getAdapter()
      if (adapter) setMouth(adapter, 0)
      console.info('[lipsync] stopped')
    },
  }
}
