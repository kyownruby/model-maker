# mcp-server（Phase 2）

Claude Code からモデルビューアを遠隔操作するための MCP サーバー（司令塔）。

```
Claude Code ──(MCP/stdio)──> mcp-server ──(WebSocket localhost:8765)──> viewer(ブラウザ)
```

## セットアップ

```sh
cd mcp-server
npm install
npm run build
```

## Claude Code への登録

プロジェクトルートに `.mcp.json` を置く（またはユーザー設定に追加）:

```json
{
  "mcpServers": {
    "character-model": {
      "command": "node",
      "args": ["<このリポジトリの絶対パス>/mcp-server/dist/server.js"]
    }
  }
}
```

CLIなら:

```sh
claude mcp add character-model -- node <絶対パス>/mcp-server/dist/server.js
```

登録後、**ビューアをブラウザで開いておく**（`cd viewer && npm run dev` → http://localhost:5173 ）。
ツールバーの表示が「MCP: connected」になれば接続完了。ビューアは自動再接続するので、
MCPサーバーとビューアの起動順は問わない。

## 提供ツール

| ツール | 引数 | 説明 |
|--------|------|------|
| `list_parameters` | — | モデルのパラメータ・表情・モーション一覧（**最初に呼ぶこと**） |
| `set_expression` | `name`, `weight`(0-1) | 表情設定。VRMは `smile→happy` 等のエイリアス解決あり。大文字小文字は無視 |
| `look_at` | `x`, `y`(-1〜1) | 目線＋顔の向き |
| `set_body_angle` | `x`, `y`, `z`(-1〜1) | 体の向き・傾き |
| `set_mouth` | `open`(0-1) | 口の開き（口パク用） |
| `play_motion` | `name` | モーション再生（現状Live2Dのみ。割り込み再生） |
| `set_parameter` | `id`, `value` | 任意パラメータへの直接設定（範囲は自動クランプ） |
| `load_model` | `url` | モデル切替（`.vrm`→VRM / それ以外→Live2D） |
| `list_export_formats` | — | 書き出せる形式一覧（vrm / glb / live2d_zip） |
| `export_model` | `format`, `path`? | モデルをファイルへ書き出し（省略時 `./exports/`）。PMXは[変換ルート](../docs/3d-and-mmd-route.md)参照 |
| `get_status` | — | ビューア接続状態とモデル情報 |

引数は正規化値（0〜1 / -1〜1）で統一し、Live2D の実レンジ（例: `ParamAngleX` ±30）への
変換はビューア側のアダプタ層が吸収する（`viewer/src/bridge/commands.ts`）。

## 環境変数

| 変数 | 既定値 | 説明 |
|------|--------|------|
| `MODEL_MAKER_WS_PORT` | `8765` | ビューアとのWebSocketポート。ビューア側は `?ws=ws://localhost:<port>` で合わせる |

## 実装メモ

- stdio がMCPのプロトコルチャネルのため、ログはすべて **stderr** に出す（`console.log` 禁止）
- `mcp-server/src/protocol.ts` と `viewer/src/bridge/protocol.ts` は同一内容を保つこと
- ビューア未接続時、各ツールは案内メッセージ付きのエラーを返す
