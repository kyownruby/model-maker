#!/usr/bin/env python3
"""1枚絵から Live2D 用パーツ分割PSDを半自動生成するCLI。

使い方:
    python3 split_parts.py input.png -o out/

出力:
    out/<name>.psd    レイヤー分割PSD（Cubism Editorへそのままインポート可）
    out/parts/*.png   各レイヤーの個別PNG（フルキャンバスRGBA）
    out/preview.png   元画像・セグメンテーション・各レイヤーのモンタージュ
    out/report.json   クラスごとの被覆率などのレポート
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from modelmaker_pipeline.layers import build_layers
from modelmaker_pipeline.network import PALETTE
from modelmaker_pipeline.psd_writer import write_preview, write_psd
from modelmaker_pipeline.segment import cutout_character, load_face_parser, parse_face


def main() -> int:
    parser = argparse.ArgumentParser(description="1枚絵 → Live2D用パーツ分割PSD")
    parser.add_argument("input", type=Path, help="入力画像（正面向きの立ち絵/バストアップ推奨）")
    parser.add_argument("-o", "--output", type=Path, default=Path("out"), help="出力ディレクトリ")
    parser.add_argument(
        "--no-bg-removal",
        action="store_true",
        help="背景除去(rembg)をスキップする（既に透過済みの素材向け）",
    )
    parser.add_argument(
        "--expressions",
        type=Path,
        default=None,
        help="表情差分ディレクトリ（face_<表情名>.png の命名規則。例: face_smile.png）",
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"error: input not found: {args.input}", file=sys.stderr)
        return 1
    args.output.mkdir(parents=True, exist_ok=True)
    parts_dir = args.output / "parts"
    parts_dir.mkdir(exist_ok=True)

    original = Image.open(args.input).convert("RGBA")
    print(f"[cli] input: {args.input} ({original.width}x{original.height})")

    # 1. キャラクター切り抜き
    rgba = original if args.no_bg_removal else cutout_character(original)

    # 2. 顔パーツのセマンティックセグメンテーション
    model = load_face_parser()
    print("[cli] parsing face parts...")
    label_map = parse_face(model, rgba)

    # 3. レイヤー組み立て
    layers = build_layers(rgba, label_map)

    # 3b. 表情差分の取り込み
    expression_layers = []
    if args.expressions and args.expressions.is_dir():
        from modelmaker_pipeline.expressions import (
            build_expression_layers,
            discover_expression_files,
        )

        for name, path in discover_expression_files(args.expressions):
            print(f"[cli] processing expression diff: {path.name}")
            expression_layers += build_expression_layers(model, rgba, label_map, name, path)
        print(f"[cli] {len(expression_layers)} expression part layers extracted")

    # 4. 出力
    stem = args.input.stem
    psd_path = args.output / f"{stem}.psd"
    skipped = write_psd(layers, rgba.size, psd_path, expression_layers)
    print(f"[cli] wrote {psd_path}")
    if skipped:
        print(f"[cli] WARNING: 検出できず空になったレイヤー（要手動作成）: {', '.join(skipped)}")

    for i, part in enumerate(layers):
        part.image.save(parts_dir / f"{i:02d}_{part.name}.png")
    for part in expression_layers:
        part.image.save(parts_dir / f"exp_{part.name}.png")
    print(f"[cli] wrote {len(layers) + len(expression_layers)} part PNGs -> {parts_dir}/")

    seg_rgb = np.zeros((*label_map.shape, 3), dtype=np.uint8)
    for cls, color in enumerate(PALETTE):
        seg_rgb[label_map == cls] = color
    seg_preview = Image.fromarray(seg_rgb)
    write_preview(original, seg_preview, layers, args.output / "preview.png")
    print(f"[cli] wrote {args.output / 'preview.png'}")

    report = {
        "input": str(args.input),
        "size": [rgba.width, rgba.height],
        "layers": [{"name": p.name, "coverage": p.coverage} for p in layers],
        "expression_layers": [{"name": p.name, "coverage": p.coverage} for p in expression_layers],
        "empty_layers_needing_manual_work": skipped,
        "notes": [
            "眉は現行モデルでは分類されません（髪または顔に含まれます）。Cubism Editorで分離してください。",
            "前髪/後髪の分離は手動です。「前髪」レイヤーをEditorで複製・マスク分割してください。",
            "塗り足し（顔の下地）は推定肌色による簡易処理です。品質が必要な場合は手修正してください。",
        ],
    }
    (args.output / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[cli] wrote {args.output / 'report.json'}")
    print("[cli] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
