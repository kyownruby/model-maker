"""表情差分イラストの取り込み。

`face_<表情名>.png`（例: face_smile.png）の命名規則で置かれた差分画像を解析し、
基準画像と比べて**変化のあったパーツ（目・口）だけ**を追加レイヤーとして返す。
返されたレイヤーはPSDの「表情差分」グループ（非表示）に入り、Cubism Editorで
テクスチャ切替・表情モーフの目標形状として利用できる。
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from .layers import PartLayer, _extract, _mask_of, _split_left_right
from .network import CLASS_EYE, CLASS_MOUTH
from .segment import cutout_character, parse_face
from .network import UNet

# パーツ領域内の平均色差がこの値を超えたら「変化あり」とみなす（0-255）
CHANGE_THRESHOLD = 8.0


def discover_expression_files(directory: Path) -> list[tuple[str, Path]]:
    """face_<name>.png を列挙して (name, path) を返す。face_neutral は基準扱いで除外。"""
    found = []
    for path in sorted(directory.glob("face_*.png")):
        name = path.stem[len("face_") :]
        if name and name != "neutral":
            found.append((name, path))
    return found


def _part_changed(
    base_rgba: np.ndarray, diff_rgba: np.ndarray, mask: np.ndarray
) -> bool:
    if mask.sum() < 16:
        return False
    a = base_rgba[mask][:, :3].astype(np.int16)
    b = diff_rgba[mask][:, :3].astype(np.int16)
    return float(np.abs(a - b).mean()) > CHANGE_THRESHOLD


def build_expression_layers(
    model: UNet,
    base_rgba_img: Image.Image,
    base_label_map: np.ndarray,
    name: str,
    diff_path: Path,
) -> list[PartLayer]:
    """1枚の表情差分から、変化したパーツのレイヤー群を返す。"""
    diff_img = Image.open(diff_path).convert("RGBA")
    if diff_img.size != base_rgba_img.size:
        print(
            f"[expressions] WARNING: {diff_path.name} のサイズ {diff_img.size} が"
            f"基準画像 {base_rgba_img.size} と異なるためリサイズします"
        )
        diff_img = diff_img.resize(base_rgba_img.size, Image.LANCZOS)

    diff_cut = cutout_character(diff_img)
    label_map = parse_face(model, diff_cut)

    base_rgba = np.asarray(base_rgba_img.convert("RGBA"))
    diff_rgba = np.asarray(diff_cut)
    total = label_map.size

    eye = _mask_of(label_map, CLASS_EYE)
    mouth = _mask_of(label_map, CLASS_MOUTH)
    eye_left, eye_right = _split_left_right(eye)

    # 変化判定は「差分側マスク ∪ 基準側マスク」で行う
    # （目を閉じた差分では差分側の目マスクが消えるため、基準側も見る必要がある）
    base_eye = _mask_of(base_label_map, CLASS_EYE)
    base_eye_left, base_eye_right = _split_left_right(base_eye)
    base_mouth = _mask_of(base_label_map, CLASS_MOUTH)

    candidates: list[tuple[str, np.ndarray, np.ndarray]] = [
        (f"右目_{name}", eye_right, eye_right | base_eye_right),
        (f"左目_{name}", eye_left, eye_left | base_eye_left),
        (f"口_{name}", mouth, mouth | base_mouth),
    ]

    layers: list[PartLayer] = []
    for layer_name, extract_mask, judge_mask in candidates:
        if not _part_changed(base_rgba, diff_rgba, judge_mask):
            continue
        # 目を閉じている等で差分側のパーツ検出が消えた場合は、
        # 基準側のパーツ位置から差分画像を切り出す（閉じ目テクスチャの回収）
        mask = extract_mask if extract_mask.sum() >= 16 else judge_mask
        if mask.sum() < 16:
            continue
        layers.append(
            PartLayer(layer_name, _extract(diff_rgba, mask), round(float(mask.sum()) / total, 4))
        )
    return layers
