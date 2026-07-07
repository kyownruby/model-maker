"""アニメ顔パーツのセマンティックセグメンテーション用UNet。

出典: siyeong0/Anime-Face-Segmentation（MobileNetV2エンコーダ + UNetデコーダ）
実装は comfyui_controlnet_aux (Apache-2.0) の再配布版を元に、
学習済み重み（UNet.pth）だけで完結するよう調整したもの。
入力: 3x512x512 (0-1正規化) / 出力: 7x512x512 (softmax)
クラス順: [背景, 髪, 目, 口, 顔, 肌, 服]
"""
import torch
import torch.nn as nn
import torchvision

NUM_SEG_CLASSES = 7

CLASS_BACKGROUND = 0
CLASS_HAIR = 1
CLASS_EYE = 2
CLASS_MOUTH = 3
CLASS_FACE = 4
CLASS_SKIN = 5
CLASS_CLOTHES = 6

CLASS_NAMES = ["background", "hair", "eye", "mouth", "face", "skin", "clothes"]

# プレビュー画像用の色（クラス順に対応）
PALETTE = [
    (255, 255, 0),
    (0, 0, 255),
    (255, 0, 0),
    (255, 255, 255),
    (0, 255, 0),
    (0, 255, 255),
    (255, 0, 255),
]


class UNet(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        # 重みはUNet.pthから全て読み込むため、torchvisionの事前学習DLは行わない
        mobilenet_v2 = torchvision.models.mobilenet_v2(weights=None)
        mob_blocks = mobilenet_v2.features

        # Encoder
        self.en_block0 = nn.Sequential(mob_blocks[0], mob_blocks[1])  # 3 -> 16
        self.en_block1 = nn.Sequential(mob_blocks[2], mob_blocks[3])  # 16 -> 24
        self.en_block2 = nn.Sequential(mob_blocks[4], mob_blocks[5], mob_blocks[6])  # 24 -> 32
        self.en_block3 = nn.Sequential(  # 32 -> 96
            mob_blocks[7], mob_blocks[8], mob_blocks[9], mob_blocks[10],
            mob_blocks[11], mob_blocks[12], mob_blocks[13],
        )
        self.en_block4 = nn.Sequential(mob_blocks[14], mob_blocks[15], mob_blocks[16])  # 96 -> 160

        # Decoder
        def de_block(in_ch: int, out_ch: int) -> nn.Sequential:
            return nn.Sequential(
                nn.UpsamplingNearest2d(scale_factor=2),
                nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1),
                nn.InstanceNorm2d(out_ch),
                nn.LeakyReLU(0.1),
                nn.Dropout(p=0.2),
            )

        self.de_block4 = de_block(160, 96)
        self.de_block3 = de_block(96 * 2, 32)
        self.de_block2 = de_block(32 * 2, 24)
        self.de_block1 = de_block(24 * 2, 16)
        self.de_block0 = nn.Sequential(
            nn.UpsamplingNearest2d(scale_factor=2),
            nn.Conv2d(16 * 2, NUM_SEG_CLASSES, kernel_size=3, padding=1),
            nn.Softmax2d(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        e0 = self.en_block0(x)
        e1 = self.en_block1(e0)
        e2 = self.en_block2(e1)
        e3 = self.en_block3(e2)
        e4 = self.en_block4(e3)

        d4 = self.de_block4(e4)
        d3 = self.de_block3(torch.cat((d4, e3), 1))
        d2 = self.de_block2(torch.cat((d3, e2), 1))
        d1 = self.de_block1(torch.cat((d2, e1), 1))
        return self.de_block0(torch.cat((d1, e0), 1))
