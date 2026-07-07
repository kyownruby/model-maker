# pipeline（Phase 3: パーツ分割の半自動化）

1枚絵（正面向きの立ち絵）から、Live2D Cubism Editor にそのままインポートできる
**レイヤー分割PSD** を半自動生成するツール。

```
入力: character.png（1枚絵）
  ↓ ① キャラクター切り抜き        … ISNet (skytnt/anime-seg)
  ↓ ② 顔パーツ分類（2パス解析）    … UNet (siyeong0/Anime-Face-Segmentation)
  ↓ ③ 誤検出の後処理・塗り足し
出力: 前髪 / 右目 / 左目 / 口 / 顔 / 体 のレイヤーPSD ＋ 個別PNG ＋ プレビュー
```

## セットアップ

```sh
cd pipeline
pip install -r requirements.txt
# torchはCPU版で十分（サイズ削減）:
#   pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# PSD書き出しに使うpytoshopはビルドの都合で2段階（requirements.txt参照）
pip install "setuptools==68.2.2"
pip install pytoshop --no-build-isolation
# pytoshop実行時に "No module named 'six'" が出たら:
pip install six
```

モデル（合計 約180MB）は初回実行時に Hugging Face から自動ダウンロードされ、
`~/.cache/model-maker/` に保存される。

## 使い方

```sh
python3 split_parts.py character.png -o out/
```

| 出力 | 内容 |
|------|------|
| `out/<name>.psd` | レイヤー分割PSD（上から: 前髪→右目→左目→口→顔→体） |
| `out/parts/*.png` | 各レイヤーの個別PNG（フルキャンバスRGBA） |
| `out/preview.png` | 元画像・セグメンテーション・各レイヤーのモンタージュ |
| `out/report.json` | レイヤーごとの被覆率、空レイヤー警告、注意事項 |

オプション:
- `--no-bg-removal` — 透過済み素材向け
- `--expressions <dir>` — 表情差分ディレクトリを取り込む（下記）

## 表情差分の取り込み

`face_<表情名>.png` の命名規則（例: `face_smile.png`, `face_angry.png`）で差分を置いたディレクトリを渡すと、
基準画像と比較して**変化のあったパーツ（右目・左目・口）だけ**を抽出し、
PSDの非表示グループ **「表情差分」** に `右目_smile` のような名前で追加する。

```sh
python3 split_parts.py character.png -o out/ --expressions diffs/
```

- 目を閉じた差分など、差分側でパーツ検出が消える場合は基準側のパーツ位置から切り出す
- Cubism Editorでは、これらのレイヤーを表情モーフ（まばたき・口変形）の目標形状として使う
- 抽出品質はパーツ検出の品質に依存する。小さすぎる顔・特殊な絵柄では手動切り出しが必要

## 自動化される処理

- 背景除去（すでに透過済みの入力は自動スキップ）
- 顔パーツの検出と分離（**2パス解析**: 全体→頭部クロップ再解析で、全身絵でも目・口を取れる）
- 目の左右分離（連結成分の重心で振り分け）
- 誤検出の後処理（頭部範囲外の顔クラス除去、髪に巻き込まれた服の色ベース分離）
- 顔レイヤーの塗り足し（目・口・前髪の裏を推定肌色で下地化）

## 手作業が必要な部分（半自動の「半」）

これらは Cubism Editor / ペイントツールでの仕上げを前提とする:

1. **前髪/後髪の分離** — 髪は1レイヤーで出力される。Editorで複製してマスク分割する
2. **眉** — 現行モデルに眉クラスがなく、髪または顔に含まれる。手動で切り出す
3. **塗り足しの品質** — 推定肌色による単色塗り。グラデーションや影は手修正
4. **細部の掃除** — 服と髪の境界などに小さな誤割当が残ることがある
5. **口が検出できない絵柄** — 口が線一本の絵柄では空レイヤーになる（report.jsonに警告が出る）

## 表情差分イラストの命名規則（提案・Phase 3後半で使用）

表情差分を取り込む際は以下の命名で保存しておくこと:

```
face_neutral.png   # 通常
face_smile.png     # 笑顔
face_angry.png     # 怒り
face_sad.png       # 悲しみ
face_surprised.png # 驚き
face_blink.png     # 閉眼
face_mouth_open.png# 口開け（あ）
```

## 使用モデルとライセンス

| モデル | 用途 | 入手元 |
|--------|------|--------|
| isnetis.onnx (176MB) | キャラ切り抜き | [skytnt/anime-seg](https://huggingface.co/skytnt/anime-seg) |
| UNet.pth (6.4MB) | 顔パーツ7クラス分類 | [bdsqlsz/qinglong_controlnet-lllite](https://huggingface.co/bdsqlsz/qinglong_controlnet-lllite)（[siyeong0/Anime-Face-Segmentation](https://github.com/siyeong0/Anime-Face-Segmentation) 由来） |

ネットワーク定義は comfyui_controlnet_aux（Apache-2.0）の再配布版を元に調整したもの。
