"""クラスラベルマップから Live2D 向けのパーツレイヤー（RGBA）を組み立てる。

Live2Dのリギングでは「隠れている部分の塗り足し」が重要になる：
- 前髪の裏の顔（髪が揺れたときに肌が見える）
- 目・口の裏の肌（目を閉じる・口を開けるときの下地）
ここでは推定した肌色による簡易的な塗り足しを行う。品質が必要な部分は
Cubism Editor / ペイントツールでの手修正を前提とする（半自動）。
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

from .network import (
    CLASS_CLOTHES,
    CLASS_EYE,
    CLASS_FACE,
    CLASS_HAIR,
    CLASS_MOUTH,
    CLASS_SKIN,
)


@dataclass
class PartLayer:
    """1レイヤー分のRGBA画像（キャンバスサイズは元画像と同じ）"""

    name: str
    image: Image.Image
    coverage: float  # 画面に占める割合（report用）


def _mask_of(label_map: np.ndarray, *classes: int) -> np.ndarray:
    mask = np.zeros(label_map.shape, dtype=bool)
    for c in classes:
        mask |= label_map == c
    return mask


def _feather(mask: np.ndarray, radius: int = 1) -> np.ndarray:
    """マスク境界を少しだけ柔らかくした alpha (0-255) を返す"""
    img = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    if radius > 0:
        img = img.filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(img)


def _extract(rgba: np.ndarray, mask: np.ndarray, feather: int = 1) -> Image.Image:
    out = rgba.copy()
    alpha = _feather(mask, feather).astype(np.uint16)
    out[:, :, 3] = np.minimum(out[:, :, 3], alpha).astype(np.uint8)
    return Image.fromarray(out, mode="RGBA")


def _estimate_skin_color(rgba: np.ndarray, face_mask: np.ndarray) -> tuple[int, int, int]:
    if face_mask.sum() < 16:
        return (255, 224, 210)
    pixels = rgba[face_mask][:, :3]
    r, g, b = (int(np.median(pixels[:, i])) for i in range(3))
    return (r, g, b)


def _split_left_right(mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """連結成分を重心のx座標で左右に振り分ける（画面向かって左=right側パーツ）"""
    labeled, count = ndimage.label(mask)
    if count == 0:
        return mask.copy(), np.zeros_like(mask)
    centers = ndimage.center_of_mass(mask, labeled, range(1, count + 1))
    xs = [c[1] for c in centers]
    mid = float(np.median(xs)) if count > 2 else float(np.mean(xs))
    left = np.zeros_like(mask)
    right = np.zeros_like(mask)
    for i, x in enumerate(xs, start=1):
        # 成分が2つならきれいに左右へ、奇数個でも重心で振り分ける
        (left if x >= mid else right)[labeled == i] = True
    if count == 2:
        # ちょうど2成分のときは重心比較で確実に分ける
        left[:] = False
        right[:] = False
        a, b = (labeled == 1), (labeled == 2)
        if xs[0] < xs[1]:
            right |= a
            left |= b
        else:
            right |= b
            left |= a
    return left, right


def build_layers(rgba_img: Image.Image, label_map: np.ndarray) -> list[PartLayer]:
    """レイヤーを上（手前）から下（奥）の順で返す。"""
    rgba = np.asarray(rgba_img.convert("RGBA")).copy()
    total = label_map.size

    hair = _mask_of(label_map, CLASS_HAIR)
    eye = _mask_of(label_map, CLASS_EYE)
    mouth = _mask_of(label_map, CLASS_MOUTH)
    face = _mask_of(label_map, CLASS_FACE)
    body = _mask_of(label_map, CLASS_SKIN, CLASS_CLOTHES)

    eye_left, eye_right = _split_left_right(eye)

    # --- 顔レイヤー: 目・口・前髪の裏まで肌色で塗り足す ---
    skin_color = _estimate_skin_color(rgba, face)
    near_face = ndimage.binary_dilation(face, iterations=24)
    face_filled_mask = ndimage.binary_fill_holes(
        face | eye | mouth | (hair & near_face)
    )
    assert isinstance(face_filled_mask, np.ndarray)
    face_rgba = rgba.copy()
    fill_area = face_filled_mask & ~face
    face_rgba[fill_area, 0] = skin_color[0]
    face_rgba[fill_area, 1] = skin_color[1]
    face_rgba[fill_area, 2] = skin_color[2]
    face_rgba[:, :, 3] = np.minimum(
        np.asarray(rgba_img.convert("RGBA"))[:, :, 3], _feather(face_filled_mask, 1)
    )
    face_layer = Image.fromarray(face_rgba, mode="RGBA")

    def cov(mask: np.ndarray) -> float:
        return round(float(mask.sum()) / total, 4)

    layers = [
        PartLayer("前髪", _extract(rgba, hair), cov(hair)),
        PartLayer("右目", _extract(rgba, eye_right), cov(eye_right)),
        PartLayer("左目", _extract(rgba, eye_left), cov(eye_left)),
        PartLayer("口", _extract(rgba, mouth), cov(mouth)),
        PartLayer("顔", face_layer, cov(face_filled_mask)),
        PartLayer("体", _extract(rgba, body), cov(body)),
    ]
    return layers
