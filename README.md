# model-maker

キャラクターモデル制作 & Claude Code 操作システム。
1枚絵・三面図から Live2D / 3D(VRM) モデルを作り、Claude Code（MCP）から表情・ポーズを遠隔操作することを目指すプロジェクト。

設計の全体像は [docs/character_model_mcp_design.md](docs/character_model_mcp_design.md) を参照。

## 構成

```
model-maker/
├── viewer/      # モデルビューア（Phase 1）: VRM / Live2D をブラウザ表示し、スライダーで操作
├── mcp-server/  # MCPサーバー（Phase 2 予定）: Claude Code からビューアを遠隔操作する司令塔
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

### サンプルモデルについて

| 種別 | モデル | 入手元 |
|------|--------|--------|
| VRM | VRM1 Constraint Twist Sample | [pixiv/three-vrm](https://github.com/pixiv/three-vrm) 公式サンプル（`setup:assets` でDL） |
| Live2D | Haru | pixi-live2d-display のテストアセット（CDN読み込み・開発用） |

Live2D Cubism Core は[ライセンス](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)により npm 配布されないため、`setup:assets` が公式配布元から取得して `viewer/public/vendor/` に配置する（Gitには含めない）。

## ロードマップ

- [x] **Phase 1**: ビューア基盤（VRM/Live2D表示 + 手動スライダー操作）
- [ ] **Phase 2**: MCPサーバー & Claude Code からの遠隔操作
- [ ] **Phase 3**: モデル制作パイプライン（パーツ分割の半自動化ほか）
- [ ] **Phase 4**: OBS配信対応（透過背景・口パク連携）
