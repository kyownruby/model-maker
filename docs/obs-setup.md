# OBS 配信セットアップ（Phase 4）

ビューアのモデルを透過背景でOBSに乗せ、Claude Code から操作しながら
VOICEPEAK音声で口パクさせるまでの手順。

## 1. ビューアをOBSモードで起動する

```sh
cd viewer && npm run dev   # http://localhost:5173
```

OBS用URL（UIなし・完全透過・モデルのみ）:

```
http://localhost:5173/?obs=1
```

### URLパラメータ一覧

| パラメータ | 例 | 説明 |
|-----------|-----|------|
| `obs=1` | | UIを隠し背景を完全透過にする |
| `lipsync=1` | | 音声連動口パクを自動開始 |
| `mic=cable` | `?mic=cable` | 口パクに使う入力デバイス名（部分一致）。VB-CABLEなら `cable` |
| `lipsync_gain=6` | | 口パク感度（大きいほど開きやすい） |
| `vrm=<url>` / `live2d=<url>` | | 表示モデルの差し替え |
| `ws=<url>` | | MCPサーバーのWebSocket URL（既定 `ws://localhost:8765`） |

組み合わせ例（OBS＋口パク＋VB-CABLE入力）:

```
http://localhost:5173/?obs=1&lipsync=1&mic=cable
```

## 2. OBSにブラウザソースを追加する

1. ソース → **＋ → ブラウザ**
2. URL に上記のOBSモードURLを入力
3. 幅・高さは配信解像度に合わせる（例: 1920×1080。モデルはステージ内に自動フィット）
4. 背景は自動で透過になる（ブラウザソースはページのアルファをそのまま扱う）
5. 口パクを使う場合: ブラウザソースの **「ページの権限」を「すべての権限」** にする
   （マイクアクセス許可のため）

> うまく透過しない場合: ソースを右クリック → 「対話」でページが表示されているか確認。
> WebGLエラーが出る環境ではOBS設定 → 詳細設定 → 「ブラウザソースのハードウェア
> アクセラレーションを有効にする」をONにする。

## 3. Claude Code から操作する

MCPサーバーを登録済みなら（[mcp-server/README.md](../mcp-server/README.md)）、
OBSに映っている状態のまま「笑って」「右を向いて」等で操作できる。
ビューアのWebSocketは自動再接続なので、OBS→MCPサーバーの起動順は問わない。

## 4. VOICEPEAK音声で口パクさせる

音声の流れ:

```
VOICEPEAK ──(再生デバイス: VB-CABLE Input)──> VB-CABLE ──> ブラウザのマイク入力(?mic=cable)
                                                └──> OBSの音声ソースにも同じVB-CABLEを追加
```

1. [VB-CABLE](https://vb-audio.com/Cable/) をインストール
2. VOICEPEAKの再生デバイスを **CABLE Input** にする
3. ビューアURLに `&lipsync=1&mic=cable` を付ける
4. OBS側の音声はデスクトップ音声 or 「音声入力キャプチャ（CABLE Output）」で拾う

音声が小さくて口が開かない場合は `&lipsync_gain=10` など感度を上げる。

## 完了条件の確認（設計書 Phase 4）

- [x] ビューアの背景を透過にする（`?obs=1`、四隅アルファ=0をテスト済み）
- [x] OBSのブラウザソースで取り込める構成（本ドキュメント）
- [x] 音声連動で口パク（マイク音量→口パラメータ。VRM=expression.aa / Live2D=ParamMouthOpenY）
- [x] OBSに乗せたままClaude Codeから操作できる（OBSモードでのMCP操作をE2E済み）
