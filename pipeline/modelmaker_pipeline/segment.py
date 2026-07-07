"""キャラクター切り抜き（ISNet）と顔パーツ分類（UNet）。

使用モデル:
- isnetis.onnx  — skytnt/anime-seg。アニメキャラクターの高精度切り抜き
- UNet.pth      — siyeong0/Anime-Face-Segmentation。顔パーツ7クラス分類
どちらも初回実行時に Hugging Face から自動ダウンロードされる。
"""
from __future__ import annotations

import os
import urllib.request
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from .network import UNet

UNET_WEIGHTS_URL = (
    "https://huggingface.co/bdsqlsz/qinglong_controlnet-lllite/resolve/main/Annotators/UNet.pth"
)
ISNET_URL = "https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.onnx"
CACHE_DIR = Path(os.environ.get("MODEL_MAKER_CACHE", Path.home() / ".cache" / "model-maker"))
PARSE_SIZE = 512
ISNET_SIZE = 1024


def _download(url: str, dest: Path) -> Path:
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"[segment] downloading {url}\n          -> {dest}")
    tmp = dest.with_suffix(".tmp")
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(dest)
    return dest


def load_face_parser() -> UNet:
    weights = _download(UNET_WEIGHTS_URL, CACHE_DIR / "UNet.pth")
    model = UNet()
    model.load_state_dict(torch.load(weights, map_location="cpu"))
    model.eval()
    return model


def cutout_character(image: Image.Image) -> Image.Image:
    """ISNet (anime-seg) でキャラクターを切り抜いた RGBA を返す。

    入力にすでに意味のある透明部分がある場合（透過素材）はそのまま使う。
    """
    rgba = image.convert("RGBA")
    alpha = np.asarray(rgba)[:, :, 3]
    if (alpha < 250).mean() > 0.05:
        print("[segment] input already has transparency; skipping background removal")
        return rgba

    import onnxruntime as ort

    print("[segment] removing background with ISNet (skytnt/anime-seg)...")
    model_path = _download(ISNET_URL, CACHE_DIR / "isnetis.onnx")
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])

    boxed, (ox, oy, nw, nh) = _letterbox(rgba, ISNET_SIZE, fill=(0, 0, 0))
    tensor = np.asarray(boxed, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
    (mask,) = session.run(["mask"], {"img": tensor})
    mask = np.clip(mask[0, 0], 0.0, 1.0)

    # letterbox解除 → 元サイズへ
    mask_img = Image.fromarray((mask[oy : oy + nh, ox : ox + nw] * 255).astype(np.uint8), "L")
    mask_full = np.asarray(mask_img.resize(rgba.size, Image.BILINEAR))

    out = np.asarray(rgba).copy()
    out[:, :, 3] = np.minimum(out[:, :, 3], mask_full)
    return Image.fromarray(out, mode="RGBA")


def _letterbox(
    image: Image.Image, size: int, fill: tuple[int, int, int] = (255, 255, 255)
) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """アスペクト比を保って size×size に収める。(画像, (offset_x, offset_y, w, h)) を返す"""
    w, h = image.size
    scale = size / max(w, h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    resized = image.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), fill)
    ox, oy = (size - nw) // 2, (size - nh) // 2
    canvas.paste(resized, (ox, oy), resized if resized.mode == "RGBA" else None)
    return canvas, (ox, oy, nw, nh)


def _parse_once(model: UNet, rgba: Image.Image) -> np.ndarray:
    """画像1枚をそのまま512px解析してラベルマップを返す。"""
    boxed, (ox, oy, nw, nh) = _letterbox(rgba, PARSE_SIZE)
    tensor = torch.from_numpy(np.asarray(boxed).copy()).float().permute(2, 0, 1).unsqueeze(0) / 255.0
    with torch.no_grad():
        seg = model(tensor).squeeze(0).numpy()  # (7, 512, 512)
    labels = seg.argmax(axis=0).astype(np.uint8)

    # letterbox 部分を切り出して元サイズへ最近傍で戻す
    cropped = Image.fromarray(labels[oy : oy + nh, ox : ox + nw], mode="L")
    restored = cropped.resize(rgba.size, Image.NEAREST)
    return np.asarray(restored).copy()


def parse_face(model: UNet, rgba: Image.Image) -> np.ndarray:
    """顔パーツのクラスラベルマップ (H, W) uint8 を元画像サイズで返す。

    全身絵では顔が小さく目・口を取り逃すため、2パスで解析する:
      pass1: 全体を解析して顔の位置を推定
      pass2: 顔周辺をクロップして高解像度で再解析し、結果を統合
    """
    from .network import CLASS_EYE, CLASS_FACE, CLASS_MOUTH

    label_map = _parse_once(model, rgba)
    h, w = label_map.shape
    alpha = np.asarray(rgba)[:, :, 3]

    # --- pass2: 頭部領域のリファイン ---
    # 「顔」クラスは全身絵だと服などへ誤反応しやすいので、頭部の位置決めには
    # 誤検出の少ない「目」を優先し、無ければ顔クラスの重心を使う。
    eye_ys, eye_xs = np.nonzero(label_map == CLASS_EYE)
    face_ys, face_xs = np.nonzero(
        (label_map == CLASS_FACE) | (label_map == CLASS_MOUTH)
    )
    center: tuple[int, int] | None = None
    if len(eye_ys) >= 20:
        center = (int(np.median(eye_ys)), int(np.median(eye_xs)))
    elif len(face_ys) >= 64:
        center = (int(np.median(face_ys)), int(np.median(face_xs)))

    char_ys = np.nonzero(alpha > 16)[0]
    if center is not None and len(char_ys) > 0:
        char_h = int(char_ys.max() - char_ys.min())
        side = max(64, int(char_h * 0.35))
        if side < max(w, h):
            cy, cx = center
            top = max(0, cy - side // 2)
            left = max(0, cx - side // 2)
            bottom = min(h, top + side)
            right = min(w, left + side)
            print(f"[segment] refining head region ({right - left}x{bottom - top})...")
            crop = rgba.crop((left, top, right, bottom))
            refined = _parse_once(model, crop)
            region = label_map[top:bottom, left:right]
            # 頭部の詳細クラスはpass2を優先。背景判定はpass1を尊重する
            take = refined != 0
            region[take] = refined[take]
            label_map[top:bottom, left:right] = region

            label_map = _cleanup_outside_head(
                label_map, (top, bottom, left, right), np.asarray(rgba)[:, :, :3]
            )

    # キャラクター外は必ず背景クラスにする
    label_map[alpha < 16] = 0
    return label_map


def _cleanup_outside_head(
    label_map: np.ndarray, head_box: tuple[int, int, int, int], rgb: np.ndarray
) -> np.ndarray:
    """全身絵で服などに出る顔・髪クラスの誤検出を後処理で除去する。

    - 頭部範囲外の 顔/目/口 → 肌（体側のレイヤーへ）
    - 頭部範囲に接続していない「髪」の連結成分 → 服
      （ロングヘアは頭部に繋がっているため残る）
    - 頭部範囲外で、髪の代表色と大きく異なる色の「髪」画素 → 服
      （髪と接続した服が髪クラスに巻き込まれるケース。白シャツ等に有効）
    """
    from scipy import ndimage

    from .network import CLASS_CLOTHES, CLASS_EYE, CLASS_FACE, CLASS_HAIR, CLASS_MOUTH, CLASS_SKIN

    top, bottom, left, right = head_box
    out = label_map.copy()

    in_head = np.zeros(label_map.shape, dtype=bool)
    in_head[top:bottom, left:right] = True

    for cls in (CLASS_FACE, CLASS_EYE, CLASS_MOUTH):
        stray = (out == cls) & ~in_head
        out[stray] = CLASS_SKIN

    hair = out == CLASS_HAIR
    labeled, count = ndimage.label(hair)
    if count > 0:
        touching = np.unique(labeled[in_head & hair])
        touching = touching[touching != 0]
        stray_hair = hair & ~np.isin(labeled, touching)
        out[stray_hair] = CLASS_CLOTHES

    # 髪の代表色: 頭部ボックス上半分の髪画素の中央値
    upper_head = np.zeros(label_map.shape, dtype=bool)
    upper_head[top : top + (bottom - top) // 2, left:right] = True
    ref_pixels = rgb[(out == CLASS_HAIR) & upper_head]
    if len(ref_pixels) > 64:
        ref = np.median(ref_pixels, axis=0)
        hair_outside = (out == CLASS_HAIR) & ~in_head
        dist = np.linalg.norm(rgb.astype(np.int16) - ref.astype(np.int16), axis=2)
        out[hair_outside & (dist > 90)] = CLASS_CLOTHES

    return out
