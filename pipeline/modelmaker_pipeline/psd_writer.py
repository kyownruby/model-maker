"""パーツレイヤーを Photoshop PSD として書き出す（Cubism Editor読み込み用）。"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from .layers import PartLayer


def write_psd(layers: list[PartLayer], size: tuple[int, int], dest: Path) -> list[str]:
    """layers は上（手前）→下（奥）の順で渡すこと。

    完全に空のレイヤーはpytoshopがPSDから除外してしまうため書き込まない。
    スキップしたレイヤー名のリストを返す（呼び出し側でレポートする）。
    """
    import pytoshop
    from pytoshop import enums
    from pytoshop.user import nested_layers

    skipped = [p.name for p in layers if np.asarray(p.image)[:, :, 3].max() == 0]
    written = [p for p in layers if p.name not in skipped]

    psd_layers = []
    for part in written:
        rgba = np.asarray(part.image.convert("RGBA"))
        psd_layers.append(
            nested_layers.Image(
                name=part.name,
                visible=True,
                opacity=255,
                blend_mode=enums.BlendMode.normal,
                top=0,
                left=0,
                channels={
                    0: rgba[:, :, 0],
                    1: rgba[:, :, 1],
                    2: rgba[:, :, 2],
                    -1: rgba[:, :, 3],
                },
            )
        )

    psd = nested_layers.nested_layers_to_psd(
        psd_layers,
        color_mode=enums.ColorMode.rgb,
        # RLE圧縮はpytoshopのCython拡張が必要で環境により壊れるため無圧縮で書く
        compression=enums.Compression.raw,
        size=(size[1], size[0]),  # (height, width)
    )
    with open(dest, "wb") as f:
        psd.write(f)

    # 検証: 自前で読み戻してレイヤー数を確認する
    with open(dest, "rb") as f:
        reread = pytoshop.read(f)
        count = len(reread.layer_and_mask_info.layer_info.layer_records)
    if count != len(written):
        raise RuntimeError(f"PSD検証に失敗: expected {len(written)} layers, got {count}")
    return skipped


def write_preview(
    original: Image.Image,
    seg_preview: Image.Image,
    layers: list[PartLayer],
    dest: Path,
) -> None:
    """元画像 / セグメンテーション / 各レイヤーを1枚のモンタージュにする。"""
    thumb_h = 480
    cells: list[Image.Image] = []
    checker = _checker_bg

    for img in [original, seg_preview] + [p.image for p in layers]:
        w, h = img.size
        scale = thumb_h / h
        thumb = img.resize((max(1, round(w * scale)), thumb_h), Image.LANCZOS)
        cells.append(checker(thumb))

    labels = ["original", "segmentation"] + [p.name for p in layers]
    pad = 8
    total_w = sum(c.width for c in cells) + pad * (len(cells) + 1)
    canvas = Image.new("RGB", (total_w, thumb_h + 28 + pad * 2), (40, 40, 48))
    x = pad
    from PIL import ImageDraw

    draw = ImageDraw.Draw(canvas)
    for cell, label in zip(cells, labels):
        canvas.paste(cell, (x, pad + 22))
        draw.text((x + 2, pad + 4), label, fill=(230, 230, 240))
        x += cell.width + pad
    canvas.save(dest)


def _checker_bg(img: Image.Image, cell: int = 12) -> Image.Image:
    """透過部分を市松模様の上に合成して見やすくする"""
    if img.mode != "RGBA":
        return img.convert("RGB")
    w, h = img.size
    bg = Image.new("RGB", (w, h), (200, 200, 200))
    tile = np.zeros((h, w), dtype=bool)
    ys, xs = np.mgrid[0:h, 0:w]
    tile = ((ys // cell) + (xs // cell)) % 2 == 0
    arr = np.asarray(bg).copy()
    arr[tile] = (160, 160, 160)
    bg = Image.fromarray(arr)
    bg.paste(img, (0, 0), img)
    return bg
