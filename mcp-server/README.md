# mcp-server（Phase 2 予定地）

Claude Code からモデルビューアを遠隔操作するための MCP サーバー。

- **技術**: Node.js (TypeScript) + @modelcontextprotocol/sdk（安定版 v1 系）
- **接続**: Claude Code とは stdio、ビューアとは WebSocket (localhost)
- **提供ツール**（設計書 4章）: `set_expression` / `set_pose` / `look_at` / `set_body_angle` / `play_motion` / `set_mouth` / `list_parameters` / `load_model` ほか

ビューア側の正規化パラメータ契約（`viewer/src/core/types.ts` の `ModelAdapter` / `ParameterInfo`）を
そのまま WebSocket コマンドの型として共有する予定。
