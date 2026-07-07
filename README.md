# model-maker

キャラクターモデル制作 & Claude Code 操作システム。
1枚絵・三面図から Live2D / 3D(VRM) モデルを作り、Claude Code（MCP）から表情・ポーズを遠隔操作することを目指すプロジェクト。

設計の全体像は [docs/character_model_mcp_design.md](docs/character_model_mcp_design.md) を参照。

## 構成

```
model-maker/
├── viewer/      # モデルビューア（Phase 1）: VRM / Live2D をブラウザ表示し、スライダーで操作
├── mcp-server/  # MCPサーバー（Phase 2）: Claude Code からビューアを遠隔操作する司令塔
├── pipeline/    # 制作パイプライン（Phase 3）: 1枚絵からLive2D用パーツ分割PSDを半自動生成
└── docs/        # 設計書
```

## viewer の使い方

```sh
cd viewer
npm install
npm run setup:assets   # Cubism Core とサンプルVRMをダウンロード（初回のみ）
npm run dev            # http://localhost:5173
```

- **VRM (3D)** タブ: three.js + @pixiv/three-vrm。表情（Expression）・視線・首/体の向きをスライダーで操作
- **Live2D (2D)** タブ: PixiJS v8 + @jannchie/pixi-live2d-display。モデルの全パラメータを動的に列挙してスライダー化
- URLクエリで任意のモデルに差し替え可能: `?vrm=<url>` / `?live2d=<model3.jsonのurl>`
- OBS配信用: `?obs=1`（透過・UIなし）、`?lipsync=1`（音声連動口パク）→ [docs/obs-setup.md](docs/obs-setup.md)

### サンプルモデルについて

| 種別 | モデル | 入手元 |
|------|--------|--------|
| VRM | VRM1 Constraint Twist Sample | [pixiv/three-vrm](https://github.com/pixiv/three-vrm) 公式サンプル（`setup:assets` でDL） |
| Live2D | Haru | pixi-live2d-display のテストアセット（CDN読み込み・開発用） |

Live2D Cubism Core は[ライセンス](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)により npm 配布されないため、`setup:assets` が公式配布元から取得して `viewer/public/vendor/` に配置する（Gitには含めない）。

## MCP連携（Claude Codeからの操作）

```sh
cd mcp-server
npm install
npm run build
```

Claude Code に登録してビューアを開くと、チャットから「笑って」「右を向いて」等で
モデルを操作できる。登録方法・ツール一覧は [mcp-server/README.md](mcp-server/README.md) を参照。

## ロードマップ

- [x] **Phase 1**: ビューア基盤（VRM/Live2D表示 + 手動スライダー操作）
- [x] **Phase 2**: MCPサーバー & Claude Code からの遠隔操作
- [x] **Phase 3**: モデル制作パイプライン
  - [x] 1枚絵→Live2D用パーツ分割PSDの半自動生成（[pipeline/](pipeline/README.md)）
  - [x] 表情差分イラストの取り込み（`--expressions`、PSDの表情差分グループへ）
  - [x] 3D化ルート・MMD変換ルートの手順確立（[docs/3d-and-mmd-route.md](docs/3d-and-mmd-route.md)）
  - [x] エクスポート機能（VRM / GLB / Live2D zip — viewerのボタン＆MCP `export_model`）
- [x] **Phase 4**: OBS配信対応（[docs/obs-setup.md](docs/obs-setup.md)）
  - [x] OBSモード `?obs=1`（UI非表示・完全透過背景）
  - [x] 音声連動リップシンク `?lipsync=1&mic=cable`（VB-CABLE/VOICEPEAK対応）
  - [x] OBSに乗せたままMCP操作可能
