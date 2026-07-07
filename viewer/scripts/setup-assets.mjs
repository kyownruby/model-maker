/**
 * 開発用アセットのダウンロードスクリプト。
 * ライセンス上リポジトリにコミットできない/したくないバイナリを取得する。
 *   - Live2D Cubism Core: Live2D社の再配布可能コード（公式配布元から取得）
 *   - サンプルVRM: pixiv/three-vrm リポジトリの公式サンプルモデル
 */
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const ASSETS = [
  {
    url: 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
    dest: 'public/vendor/live2dcubismcore.min.js',
    label: 'Live2D Cubism Core',
  },
  {
    url: 'https://raw.githubusercontent.com/pixiv/three-vrm/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
    dest: 'public/models/vrm/sample.vrm',
    label: 'Sample VRM (three-vrm official sample)',
  },
]

for (const asset of ASSETS) {
  const destPath = join(root, asset.dest)
  try {
    await access(destPath)
    console.log(`skip (exists): ${asset.dest}`)
    continue
  } catch {
    // not downloaded yet
  }
  console.log(`downloading: ${asset.label} ...`)
  const res = await fetch(asset.url)
  if (!res.ok) {
    console.error(`  failed: ${res.status} ${res.statusText} — ${asset.url}`)
    process.exitCode = 1
    continue
  }
  await mkdir(dirname(destPath), { recursive: true })
  await writeFile(destPath, Buffer.from(await res.arrayBuffer()))
  console.log(`  saved: ${asset.dest}`)
}
