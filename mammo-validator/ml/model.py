"""Mammography AI model — architecture ported from ``bestone_v3_cv_oof.ipynb``.

This is the **exact** network used to produce the checkpoints in ``models/``:
``BreastMultiviewNetwork`` = SwinV2-Tiny image backbone (shared by the CC and
MLO views) + FT-Transformer style tabular embedding + cross-attention fusion +
``BreastFusionHead`` that merges the two view latents into one breast-level
latent, followed (outside the network) by a CatBoost classifier trained on a
selected subset of the 256-d latent vector.

Every class below is a 1:1 port of the notebook so the saved ``state_dict``
loads without surprises (0 missing / 0 unexpected). The single-view
``UnifiedMultimodalNetwork`` is kept as-is for reference; the deployed
checkpoints carry the ``breast_fusion.*`` keys and require the per-breast
``BreastMultiviewNetwork``. Inference-only concerns (no_grad, no unfreezing, no
pretrained downloads) are the only deviations.

The training notebook's 3-class collapse is preserved:

    0 -> Normal          (BI-RADS 1)
    1 -> Benign-leaning  (BI-RADS 2-3)
    2 -> Suspicious      (BI-RADS 4-5)
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import timm
import torch
import torch.nn as nn

# ---------------------------------------------------------------------------
# Domain constants (MUST match training — see notebook CELL 3 / CELL 6)
# ---------------------------------------------------------------------------
MAMMO_IMG_SIZE = (1024, 1024)
MAMMO_MEAN = 0.2865
MAMMO_STD = 0.1743
CLAHE_CLIP_LIMIT = 2.0
CLAHE_TILE_GRID = (8, 8)
MEDIAN_KERNEL = 3

SWIN_MODEL_NAME = "swinv2_tiny_window16_256"
SWIN_IMG_SIZE = (1024, 1024)
SWIN_OUT_CHANNELS = 768

CLASS_NAMES_3 = [
    "Normal (BI-RADS 1)",
    "Benign-leaning (BI-RADS 2-3)",
    "Suspicious (BI-RADS 4-5)",
]

DENSITY_MAPPING = {
    "DENSITY A": 0,
    "DENSITY B": 1,
    "DENSITY C": 2,
    "DENSITY D": 3,
}
DENSITY_CHOICES = ("A", "B", "C", "D")
DEFAULT_DENSITY_CODE = 2  # notebook falls back to DENSITY C when missing

DICOM_SUFFIXES = (".dcm", ".dicom")

# ---------------------------------------------------------------------------
# Image loading + mammography preprocessing
# ---------------------------------------------------------------------------


def read_dicom_grayscale(path: str | Path) -> np.ndarray:
    """Read a DICOM P10 mammogram as an 8-bit grayscale ``uint8`` array.

    The training data was VinDr-Mammo DICOMs exported to PNG, so to feed a raw
    ``.dcm`` through the same pipeline we reproduce the usual export: rescale
    with Slope/Intercept, window to 8-bit (stored Window Center/Width when
    present, otherwise a robust 1-99 percentile stretch) and flip MONOCHROME1.
    """
    import pydicom

    dataset = pydicom.dcmread(str(path))
    pixels = dataset.pixel_array.astype(np.float32)

    slope = float(getattr(dataset, "RescaleSlope", 1) or 1)
    intercept = float(getattr(dataset, "RescaleIntercept", 0) or 0)
    pixels = pixels * slope + intercept

    center = getattr(dataset, "WindowCenter", None)
    width = getattr(dataset, "WindowWidth", None)
    if center is not None and width is not None:
        # Window Center/Width may be multi-valued (list) — take the first.
        center = float(np.atleast_1d(center)[0])
        width = float(np.atleast_1d(width)[0])
        if width <= 1:
            width = 1.0
        lower = center - width / 2.0
        upper = center + width / 2.0
    else:
        lower, upper = np.percentile(pixels, (1.0, 99.0))

    if upper <= lower:
        upper = lower + 1.0
    pixels = np.clip(pixels, lower, upper)
    pixels = (pixels - lower) / (upper - lower) * 255.0

    photo = str(getattr(dataset, "PhotometricInterpretation", "") or "").upper()
    if photo == "MONOCHROME1":
        # MONOCHROME1 = high values are dark; invert to match MONOCHROME2.
        pixels = 255.0 - pixels

    return pixels.astype(np.uint8)


def read_image_grayscale(path: str | Path) -> np.ndarray:
    """Load a PNG/JPG or DICOM file as an 8-bit grayscale array."""
    import cv2

    suffix = Path(path).suffix.lower()
    if suffix in DICOM_SUFFIXES:
        return read_dicom_grayscale(path)

    image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise FileNotFoundError(f"Could not read image: {path}")
    return image


class MammographyTransform:
    """Domain-specific mammography preprocessing (notebook CELL 3).

    Order: load grayscale -> resize 1024x1024 (INTER_CUBIC) -> median filter ->
    CLAHE -> scale to [0, 1] -> z-score with the VinDr-Mammo statistics.
    """

    def __init__(
        self,
        clip_limit: float = CLAHE_CLIP_LIMIT,
        tile_grid_size: tuple = CLAHE_TILE_GRID,
        kernel_size: int = MEDIAN_KERNEL,
    ):
        import cv2

        self.clahe = cv2.createCLAHE(
            clipLimit=clip_limit, tileGridSize=tile_grid_size
        )
        self.kernel_size = kernel_size
        self.mean = MAMMO_MEAN
        self.std = MAMMO_STD

    def __call__(self, img_path: str | Path) -> torch.Tensor:
        import cv2

        image = read_image_grayscale(img_path)
        if image.shape != MAMMO_IMG_SIZE:
            image = cv2.resize(
                image, MAMMO_IMG_SIZE, interpolation=cv2.INTER_CUBIC
            )
        image = cv2.medianBlur(image, self.kernel_size)
        image = self.clahe.apply(image)
        return self._to_normalised_tensor(image)

    def _to_normalised_tensor(self, image: np.ndarray) -> torch.Tensor:
        tensor = torch.from_numpy(np.ascontiguousarray(image)).float() / 255.0
        tensor = (tensor - self.mean) / self.std
        return tensor.unsqueeze(0)  # [1, H, W]


# ---------------------------------------------------------------------------
# Image branch — SwinV2-Tiny feature extractor (notebook CELL 6)
# ---------------------------------------------------------------------------


class SpatialPreservingSwinBackbone(nn.Module):
    """SwinV2-Tiny backbone returning the final spatial feature grid.

    Layout is ``[B, H, W, C]`` (channels-last, as timm/Swin emits).
    ``pretrained=False`` is intentional — the fold checkpoints carry the full
    backbone weights, so no Hub download is needed.
    """

    def __init__(
        self,
        model_name: str = SWIN_MODEL_NAME,
        pretrained: bool = False,
        local_checkpoint_path: str | Path | None = None,
    ):
        super().__init__()
        common_kwargs = dict(features_only=True, img_size=SWIN_IMG_SIZE)
        self.swin = timm.create_model(
            model_name, pretrained=bool(pretrained), **common_kwargs
        )
        if local_checkpoint_path is not None:
            state = torch.load(str(local_checkpoint_path), map_location="cpu")
            self.swin.load_state_dict(state, strict=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Swin expects 3 channels -> replicate the grayscale mammogram.
        if x.shape[1] == 1:
            x = x.repeat(1, 3, 1, 1)
        with torch.no_grad():
            features = self.swin(x)
        return features[-1]  # final feature map


# ---------------------------------------------------------------------------
# Tabular branch — FT-Transformer style embedding (notebook CELL 7)
# ---------------------------------------------------------------------------


class TabularFTTransformerEmbedding(nn.Module):
    """Embed categorical + continuous clinical variables into one token set."""

    def __init__(
        self,
        cat_cardinalities: list[int],
        num_continuous: int,
        embed_dim: int = 256,
    ):
        super().__init__()
        self.cat_embeddings = nn.ModuleList(
            [nn.Embedding(card, embed_dim) for card in cat_cardinalities]
        )
        self.cont_projections = nn.ModuleList(
            [nn.Linear(1, embed_dim) for _ in range(num_continuous)]
        )

    def forward(self, x_cat: torch.Tensor, x_cont: torch.Tensor) -> torch.Tensor:
        """Return a token sequence of shape [B, N_tokens, embed_dim]."""
        tokens: list[torch.Tensor] = []
        for i, embed_layer in enumerate(self.cat_embeddings):
            tokens.append(embed_layer(x_cat[:, i]).unsqueeze(1))
        for i, proj_layer in enumerate(self.cont_projections):
            tokens.append(proj_layer(x_cont[:, i].unsqueeze(1)).unsqueeze(1))
        return torch.cat(tokens, dim=1)

# ---------------------------------------------------------------------------
# Cross-attention fusion (notebook CELL 8)
# ---------------------------------------------------------------------------


class IntermediateCrossAttentionFusion(nn.Module):
    """Tabular tokens query the image grid tokens, then mean-pool the result."""

    def __init__(
        self,
        img_channels: int = SWIN_OUT_CHANNELS,
        embed_dim: int = 256,
        num_heads: int = 8,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.img_projection = nn.Linear(img_channels, embed_dim)
        self.cross_attention = nn.MultiheadAttention(
            embed_dim=embed_dim,
            num_heads=num_heads,
            dropout=dropout,
            batch_first=True,
        )
        self.layer_norm = nn.LayerNorm(embed_dim)
        self.dropout = nn.Dropout(dropout)

    def forward(
        self, img_grid_tokens: torch.Tensor, tab_tokens: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """Fuse image + tabular tokens -> (latent_vector [B, C], attn_weights)."""
        img_flat = self._flatten_image_grid(img_grid_tokens)
        img_tokens = self.img_projection(img_flat)
        attn_output, attn_weights = self.cross_attention(
            query=tab_tokens, key=img_tokens, value=img_tokens
        )
        fused_features = self.layer_norm(tab_tokens + self.dropout(attn_output))
        return torch.mean(fused_features, dim=1), attn_weights

    def _flatten_image_grid(self, grid: torch.Tensor) -> torch.Tensor:
        """Accept [B, H, W, C] (Swin) or [B, C, H, W] (CNN) -> [B, N, C]."""
        if grid.shape[-1] == self.img_projection.in_features:
            return grid.flatten(1, 2)
        return grid.flatten(2).permute(0, 2, 1)


# ---------------------------------------------------------------------------
# Unified multimodal network (notebook CELL 9)
# ---------------------------------------------------------------------------

# VinDr-Mammo tabular schema: 1 categorical (density, 4 levels) + 1 continuous (age)
VINDR_CAT_CARDINALITIES = [4]
VINDR_NUM_CONTINUOUS = 1
NUM_CLASSES = 3


class UnifiedMultimodalNetwork(nn.Module):
    """SwinV2 + tabular embedding + cross-attention fusion + linear head."""

    def __init__(
        self,
        cat_cardinalities: list[int] | None = None,
        num_continuous: int = VINDR_NUM_CONTINUOUS,
        embed_dim: int = 256,
        num_classes: int = NUM_CLASSES,
    ):
        super().__init__()
        if cat_cardinalities is None:
            cat_cardinalities = list(VINDR_CAT_CARDINALITIES)
        self.img_branch = SpatialPreservingSwinBackbone()
        self.tab_branch = TabularFTTransformerEmbedding(
            cat_cardinalities, num_continuous, embed_dim
        )
        self.fusion_core = IntermediateCrossAttentionFusion(
            img_channels=SWIN_OUT_CHANNELS, embed_dim=embed_dim
        )
        self.classifier_head = nn.Linear(embed_dim, num_classes)

    def forward(
        self, img: torch.Tensor, x_cat: torch.Tensor, x_cont: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        img_feats = self.img_branch(img)
        tab_tokens = self.tab_branch(x_cat, x_cont)
        latent_vector, attn_weights = self.fusion_core(img_feats, tab_tokens)
        logits = self.classifier_head(latent_vector)
        return logits, latent_vector, attn_weights

    @torch.no_grad()
    def latent(
        self, img: torch.Tensor, x_cat: torch.Tensor, x_cont: torch.Tensor
    ) -> torch.Tensor:
        """The 256-d representation consumed by the CatBoost stage."""
        _, latent_vector, _ = self.forward(img, x_cat, x_cont)
        return latent_vector


# ---------------------------------------------------------------------------
# Per-breast multiview network (notebook CELL 10 — trained artifact)
# ---------------------------------------------------------------------------
#
# The fold checkpoints under ``models/`` were trained as a *per-breast*
# network: one breast = the CC + MLO pair of the same side, fused by
# ``BreastFusionHead`` into a single breast-level latent before the linear
# head.  The deployed weights carry the ``breast_fusion.*`` keys, so loading
# them into a single-view ``UnifiedMultimodalNetwork`` silently drops 16
# parameters.  ``BreastMultiviewNetwork`` restores the exact trained
# topology and state-dict contract (0 missing / 0 unexpected).


class BreastFusionHead(nn.Module):
    """Fuse the two view latents (CC=0, MLO=1) of one breast into one latent."""

    def __init__(
        self,
        embed_dim: int = 256,
        num_heads: int = 8,
        num_layers: int = 1,
        dropout: float = 0.1,
    ):
        super().__init__()
        # Learned positional embedding for the 2 views: 0=CC, 1=MLO
        self.view_pos = nn.Embedding(2, embed_dim)
        # CLS token pooling: attends over both views
        self.cls_token = nn.Parameter(torch.zeros(1, 1, embed_dim))
        nn.init.trunc_normal_(self.cls_token, std=0.02)

        layer = nn.TransformerEncoderLayer(
            d_model=embed_dim,
            nhead=num_heads,
            dim_feedforward=embed_dim * 4,
            dropout=dropout,
            batch_first=True,
            norm_first=True,
        )
        self.encoder = nn.TransformerEncoder(layer, num_layers=num_layers)
        self.norm = nn.LayerNorm(embed_dim)

    def forward(self, view_latents: torch.Tensor) -> torch.Tensor:
        """view_latents [B, 2, embed_dim] -> breast_latent [B, embed_dim]."""
        B, n_views, _ = view_latents.shape
        pos = self.view_pos(
            torch.arange(n_views, device=view_latents.device)
        )  # [2, D]
        seq = view_latents + pos.unsqueeze(0)  # [B, 2, D]

        cls = self.cls_token.expand(B, 1, -1)  # [B, 1, D]
        seq = torch.cat([cls, seq], dim=1)  # [B, 3, D]

        out = self.encoder(seq)
        return self.norm(out[:, 0])  # CLS pooled -> [B, embed_dim]


class BreastMultiviewNetwork(nn.Module):
    """SwinV2 (shared) + tabular + cross-attention + breast fusion + head.

    Per-breast multiview model: the CC and MLO views of the same breast go
    through a shared encoder, then ``BreastFusionHead`` merges the two view
    latents into one breast-level latent consumed by the linear head (and,
    downstream, the CatBoost stage).
    """

    def __init__(
        self,
        cat_cardinalities: list[int] | None = None,
        num_continuous: int = VINDR_NUM_CONTINUOUS,
        embed_dim: int = 256,
        num_classes: int = NUM_CLASSES,
    ):
        super().__init__()
        if cat_cardinalities is None:
            cat_cardinalities = list(VINDR_CAT_CARDINALITIES)
        self.img_branch = SpatialPreservingSwinBackbone()
        self.tab_branch = TabularFTTransformerEmbedding(
            cat_cardinalities, num_continuous, embed_dim
        )
        self.fusion_core = IntermediateCrossAttentionFusion(
            img_channels=SWIN_OUT_CHANNELS, embed_dim=embed_dim
        )
        self.breast_fusion = BreastFusionHead(embed_dim=embed_dim)
        self.classifier_head = nn.Linear(embed_dim, num_classes)

    def forward(
        self,
        cc_img: torch.Tensor,
        mlo_img: torch.Tensor,
        x_cat: torch.Tensor,
        x_cont: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        cc_feats = self.img_branch(cc_img)
        mlo_feats = self.img_branch(mlo_img)
        tab_tokens = self.tab_branch(x_cat, x_cont)

        cc_latent, _ = self.fusion_core(cc_feats, tab_tokens)  # [B, D]
        mlo_latent, _ = self.fusion_core(mlo_feats, tab_tokens)  # [B, D]

        view_latents = torch.stack([cc_latent, mlo_latent], dim=1)  # [B, 2, D]
        breast_latent = self.breast_fusion(view_latents)  # [B, D]

        logits = self.classifier_head(breast_latent)
        return logits, breast_latent, view_latents
