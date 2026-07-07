# 3D化ルート & MMD変換ルート（Phase 3 調査まとめ）

設計書 §2-3 / §4-2 の「3D化の手順確立」「MMD変換ルート調査」に対する結論。

## 結論（推奨ルート）

```
ミアの三面図・設定資料
  ↓ ①【推奨】VRoid Studio で手作業モデリング（品質安定・表情/リグ込みでVRM出力）
  ↓ ②（実験）画像→3D AI でメッシュ下書き → Blenderで仕上げ
VRM（本命フォーマット）
  ├─ そのまま: VTube Studio / VSeeFace / VRChat / 本プロジェクトのviewer
  ├─ GLB: viewer のエクスポート機能で書き出し（汎用3D・Web表示用）
  └─ MMD(.pmx): 外部変換ツール経由（下記）
```

## ① VRoid Studio ルート（推奨）

- 無料。髪・顔・体・服をGUIで作成し、**表情モーフ・ボーン・揺れもの込みのVRM**を出力できる
- 三面図を下絵として参照しながら作るのが実用的
- 品質・互換性ともに最も安定。**まずこのルートで1体作るのが完了条件への最短距離**
- 注意: VRoidの利用規約上、モデルの権利設定はエクスポート時に確認すること

## ② 画像→3D AI ルート（実験的）

2026年時点の主要モデル（Phase 3事前調査より）:

| モデル | 特徴 | 制約 |
|--------|------|------|
| [Hunyuan3D](https://hy-3d.net/) | 高品質テクスチャ。形状/テクスチャ分離の2段階生成 | リグなし・要GPU |
| [TripoSR](https://www.triposrai.com/) | 1秒未満の高速生成、MIT | 解像度低め・リグなし |
| [CharacterGen](https://charactergen.github.io/) | アニメキャラ特化・ポーズ正規化 | 前処理が重い・要高品質入力 |

**共通の限界**: 出力は「静的メッシュ」であり、リグ（骨）・表情モーフ・マテリアル調整は
Blender等での後工程が必須。アニメ調キャラでは品質が不安定なため、
**下書き用途と割り切る**のが現実ライン。

## ③ VRM → MMD(.pmx) 変換ルート

VRMからPMXへ**直接書き出せる標準ライブラリは存在しない**。現行の実用ルート:

### ルートA: VRoid2Pmx（推奨・ワンクリック系）
- VRoid Studio製モデルのVRMをPMXへ一括変換する専用ツール
- Blender側は [VRMアドオン](https://vrm-addon-for-blender.info/) のみでよく、mmd_tools不要
- **注意**: VRMは **VRM 0.0 でエクスポート**すること（VRM 1.0は「出力ソフト情報なし」エラーになる）

### ルートB: ブラウザ変換ツール
- [vrm2pmx-md](https://nicodan-mmd.github.io/vrm2pmx-md/)（v1.6.1 / 2026年5月時点）: ブラウザ上でプレビューしながら変換できる

### ルートC: Blender経由（自由度最高・手間大）
- Blender + VRMアドオン + [mmd_tools](https://github.com/UuuNyaa/blender_mmd_tools) でインポート→調整→PMXエクスポート
- ボーン構造・物理（剛体/ジョイント）・表情モーフの互換調整が手作業になる

### 共通の注意点
- MMD互換のボーン名（日本語名）・物理・モーフは**変換後に手作業補正が入る前提**
- テクスチャ未設定のマテリアルがあると変換エラー（`KeyError: '_MainTex'` 等）や真っ黒表示になりやすい

## 本プロジェクトのエクスポート機能との対応

| 形式 | 対応 | 方法 |
|------|------|------|
| VRM | ✅ | viewer / MCP `export_model(format: "vrm")` — 読み込んだVRMをそのまま書き出し |
| GLB | ✅ | viewer / MCP `export_model(format: "glb")` — three.js GLTFExporter（**VRM拡張・表情は含まれない汎用3D**） |
| Live2D一式(zip) | ✅ | viewer / MCP `export_model(format: "live2d_zip")` — model3.json参照ファイルを全収集 |
| FBX | ❌ | Blender経由（GLBをインポート→FBXエクスポート） |
| PMX | ❌ | 上記③の変換ルートを使用 |

**Sources:**
- [vrm2pmx-md](https://nicodan-mmd.github.io/vrm2pmx-md/)
- [VRoid→Blender→MMD 変換手順（note）](https://note.com/senna_room/n/nd871e4abbc1c)
- [Convert VRoid Studio to MMD (LearnMMD)](https://learnmmd.com/http:/learnmmd.com/convert-vroid-studio-to-mmd-with-one-click/)
- [Hunyuan3D](https://hy-3d.net/) / [TripoSR](https://www.triposrai.com/) / [CharacterGen](https://charactergen.github.io/)
