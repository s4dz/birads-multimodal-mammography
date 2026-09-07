"""
Generate the demo worklist assets used by the Mammo QA workbench.

Writes:
  public/samples/png/mg-<id>_<view>_<side>.png   (8-bit greyscale)
  public/samples/dicom/mg-<id>_<view>_<side>.dcm (16-bit DICOM P10, uncompressed)

The phantoms are synthetic "compressed breast" renderings — fibroglandular
texture, pectoral muscle (MLO), and the lesions referenced by the mock AI
predictions in `lib/mock-data.ts`:
  coarse macrocalcifications, punctate / pleomorphic calcification clusters,
  circumscribed / indistinct / spiculated masses, focal asymmetry and
  architectural distortion.

Usage:
    python scripts/generate_sample_data.py [output_dir]
Defaults to the app's public/samples directory (detected relative to this file).

Dependencies: numpy, Pillow, pydicom  (pip install numpy pillow pydicom)
"""

from __future__ import annotations

import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

try:
    from pydicom.dataset import Dataset, FileDataset
    from pydicom.uid import generate_uid
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Missing optional dependency 'pydicom' (needed for DICOM output).\n"
        "Install with: pip install pydicom"
    ) from exc

# ----------------------------------------------------------------------------
# Geometry / palette
# ----------------------------------------------------------------------------

W, H = 1024, 1400  # canvas size (portrait mammogram)
# 16-bit "raw" intensity anchors (what the detector/hardware would produce)
FAT_LEVEL = 950.0
GLAND_LEVEL = 2600.0
DENSE_LEVEL = 5200.0
MASS_LEVEL = 8000.0
CALC_LEVEL = 13500.0

# DICOM / PNG output anchors (values clipped & scaled to this range)
RAW_MAX = 30000.0
PNG_DIV = RAW_MAX / 255.0

SIDES = {"R": 1.0, "L": -1.0}  # mirror factor


def breast_geometry(side: str, view: str) -> dict:
    """Return ellipse (cx, cy, rx, ry) + pectoral settings for a compressed
    breast so the lesion placement helper can stay inside tissue."""
    mirror = SIDES[side]
    # Chest wall sits on the mirrored side; tissue bulges towards the nipple.
    cx = W * (0.68 if side == "R" else 0.32)
    rx = W * 0.46
    cy = H * 0.52
    ry = H * 0.54
    pectoral = view == "MLO"
    return {
        "cx": cx,
        "cy": cy,
        "rx": rx,
        "ry": ry,
        "mirror": mirror,
        "pectoral": pectoral,
    }


def in_breast(x: float, y: float, geo: dict) -> bool:
    dx = (x - geo["cx"]) / geo["rx"]
    dy = (y - geo["cy"]) / geo["ry"]
    return dx * dx + dy * dy <= 1.0


def sample_in_breast(rng: np.random.Generator, geo: dict) -> tuple[int, int]:
    """Rejection-sample a point comfortably inside the glandular field."""
    while True:
        x = rng.uniform(W * 0.18, W * 0.82)
        y = rng.uniform(H * 0.18, H * 0.82)
        dx = (x - geo["cx"]) / (geo["rx"] * 0.8)
        dy = (y - geo["cy"]) / (geo["ry"] * 0.8)
        if dx * dx + dy * dy <= 1.0 and in_breast(x, y, geo):
            return int(x), int(y)


def breast_mask(geo: dict) -> np.ndarray:
    """Float 0..1 mask of the compressed-breast silhouette."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d2 = ((xx - geo["cx"]) / geo["rx"]) ** 2 + ((yy - geo["cy"]) / geo["ry"]) ** 2
    mask = (d2 <= 1.0).astype(np.float32)
    # Skin line: slightly denser rim right inside the boundary.
    rim = (d2 > 0.965) & (d2 <= 1.0)
    mask[rim] = 0.45
    # soft 3px falloff at the boundary so the edge does not alias harshly
    blurred = Image.fromarray((mask * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(2)
    )
    mask = np.asarray(blurred).astype(np.float32) / 255.0
    if geo["pectoral"]:
        tri = Image.new("L", (W, H), 0)
        # pectoral: right triangle anchored on the chest-wall top corner
        if geo["mirror"] > 0:  # R: chest wall on the right
            pts = [(W, 0), (W, H * 0.55), (W * 0.55, 0)]
        else:  # L: chest wall on the left
            pts = [(0, 0), (0, H * 0.55), (W * 0.45, 0)]
        from PIL import ImageDraw

        ImageDraw.Draw(tri).polygon(pts, fill=255)
        tri = tri.filter(ImageFilter.GaussianBlur(6))
        tri_arr = np.asarray(tri).astype(np.float32) / 255.0
        mask = np.maximum(mask * 0.96, tri_arr * 0.8)
    return mask


def tissue_noise(rng: np.random.Generator) -> np.ndarray:
    """Low-frequency fibroglandular texture (fractional, ~ -1..1)."""
    low = rng.normal(size=(H // 24, W // 24)).astype(np.float32)
    low = (low - low.min()) / (low.max() - low.min() + 1e-6)
    img = Image.fromarray((low * 255).astype(np.uint8), "L").resize(
        (W, H), Image.BILINEAR
    )
    img = img.filter(ImageFilter.GaussianBlur(18))
    smooth = np.asarray(img).astype(np.float32) / 127.5 - 1.0
    fine = rng.normal(size=(H, W)).astype(np.float32) * 0.045
    return np.clip(smooth * 0.85 + fine, -1.0, 1.0)

# ---------------------------------------------------------------------------
# Lesion painting primitives (operate directly on the RAW float canvas)
# ---------------------------------------------------------------------------


def _line_points(x0, y0, x1, y1):
    steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    return zip(
        np.linspace(x0, x1, steps).astype(int),
        np.linspace(y0, y1, steps).astype(int),
    )


def add_gaussian_mass(canvas, x, y, radius, level, sigma_factor=1.0):
    """Soft / indistinct / circumscribed mass with a gaussian profile."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2) / max(1.0, radius)
    profile = np.exp(-((d / sigma_factor) ** 2))
    canvas += profile * (level - FAT_LEVEL) * (d <= 2.2)


def add_spiculated_mass(canvas, rng, x, y, radius, level, spikes=26):
    """High-density irregular core + radiating spicules."""
    add_gaussian_mass(canvas, x, y, radius, level, 0.72)
    for _ in range(60):  # irregular core
        a = rng.uniform(0, 2 * math.pi)
        r = radius * rng.uniform(0.75, 1.05)
        px, py = int(x + r * math.cos(a)), int(y + r * math.sin(a))
        add_gaussian_mass(canvas, px, py, radius * 0.22, level * 0.9)
    for k in range(spikes):
        a = rng.uniform(0, 2 * math.pi)
        length = radius * rng.uniform(1.5, 2.1)
        for tx, ty in _line_points(
            int(x + radius * 0.7 * math.cos(a)),
            int(y + radius * 0.7 * math.sin(a)),
            int(x + length * math.cos(a)),
            int(y + length * math.sin(a)),
        ):
            if 0 <= tx < W and 0 <= ty < H:
                canvas[ty, tx] += level * 0.45
    add_gaussian_mass(canvas, x, y, radius * 1.7, DENSE_LEVEL)  # fibrosis halo


def add_calcification_cluster(canvas, rng, x, y, radius, count, kind):
    """kind: 'coarse' | 'hetero' | 'punctate' | 'pleomorphic'."""
    r0 = {"coarse": 3.0, "hetero": 2.2, "punctate": 1.0, "pleomorphic": 1.3}[kind]
    spread = {
        "coarse": radius,
        "hetero": radius,
        "punctate": radius * 0.6,
        "pleomorphic": radius * 0.8,
    }[kind]
    for _ in range(count):
        px = x + rng.normal(0, spread * 0.5)
        py = y + rng.normal(0, spread * 0.5)
        r = r0 * rng.uniform(0.6, 1.8)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt((xx - px) ** 2 + (yy - py) ** 2)
        profile = np.exp(-((d / max(0.8, r * 3.0)) ** 2))
        canvas += profile * CALC_LEVEL * rng.uniform(0.7, 1.15) * (d <= r * 3)
        if kind == "coarse":  # lumpy "popcorn" second lobe
            a = rng.uniform(0, 2 * math.pi)
            lx, ly = int(px + r * 1.6 * math.cos(a)), int(py + r * 1.6 * math.sin(a))
            if 0 <= lx < W and 0 <= ly < H:
                canvas[ly - 2 : ly + 3, lx - 2 : lx + 3] += CALC_LEVEL * 0.35


def add_asymmetry(canvas, x, y, radius):
    """Diffuse focal asymmetry — broad, moderately dense soft blob."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2) / max(1.0, radius)
    profile = np.exp(-((d / 1.9) ** 2))
    canvas += profile * (GLAND_LEVEL * 1.35) * (d <= 2.6)


def add_architectural_distortion(canvas, rng, x, y, radius, rays=14):
    """Converging lines with no definite mass (spiculation w/o centre)."""
    for k in range(rays):
        a = rng.uniform(0, 2 * math.pi)
        length = radius * rng.uniform(0.8, 1.6)
        for tx, ty in _line_points(
            int(x + radius * 0.2 * math.cos(a)),
            int(y + radius * 0.2 * math.sin(a)),
            int(x + length * math.cos(a)),
            int(y + length * math.sin(a)),
        ):
            if 0 <= tx < W and 0 <= ty < H:
                canvas[ty, tx] += GLAND_LEVEL * 0.6



# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def render_phantom(case: dict) -> np.ndarray:
    """Return a RAW 16-bit-style float canvas for a case descriptor."""
    rng = np.random.default_rng(case["seed"])
    geo = breast_geometry(case["side"], case["view"])

    mask = breast_mask(geo)
    noise = tissue_noise(rng)

    # base tissue: fat background + fibroglandular density modulated by noise
    gland = np.clip(noise * 1.4 + 0.25, 0.0, 1.0)  # 0..1 density field
    canvas = FAT_LEVEL + gland * (GLAND_LEVEL - FAT_LEVEL)
    canvas *= mask
    # subtle radial density gradient towards the chest wall
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    toward_chest = 1.0 + 0.35 * (
        (xx / W) if geo["mirror"] > 0 else (1.0 - xx / W)
    )
    canvas *= toward_chest * mask
    if geo["pectoral"]:
        # pectoral muscle = denser tissue inside the upper chest-wall triangle
        tri_zone = mask > 0.75
        canvas[tri_zone] += (DENSE_LEVEL - GLAND_LEVEL) * 0.4

    for f in case["features"]:
        kind = f["kind"]
        if kind in ("coarse-calc", "hetero-calc", "punctate-calc", "pleo-calc"):
            x, y = sample_in_breast(rng, geo)
            kind2 = {
                "coarse-calc": "coarse",
                "hetero-calc": "hetero",
                "punctate-calc": "punctate",
                "pleo-calc": "pleomorphic",
            }[kind]
            add_calcification_cluster(
                canvas, rng, x, y, radius=f.get("radius", 46), count=f.get("count", 12), kind=kind2
            )
        elif kind == "mass-circumscribed":
            x, y = sample_in_breast(rng, geo)
            add_gaussian_mass(canvas, x, y, f.get("radius", 26), MASS_LEVEL * 0.9, 1.5)
        elif kind == "mass-indistinct":
            x, y = sample_in_breast(rng, geo)
            add_gaussian_mass(canvas, x, y, f.get("radius", 32), MASS_LEVEL, 1.0)
        elif kind == "mass-spiculated":
            x, y = sample_in_breast(rng, geo)
            add_spiculated_mass(canvas, rng, x, y, f.get("radius", 42), MASS_LEVEL * 1.05)
        elif kind == "asymmetry":
            x, y = sample_in_breast(rng, geo)
            add_asymmetry(canvas, x, y, f.get("radius", 95))
        elif kind == "distortion":
            x, y = sample_in_breast(rng, geo)
            add_architectural_distortion(canvas, rng, x, y, f.get("radius", 70))
        else:  # pragma: no cover
            raise ValueError(f"Unknown feature kind: {kind}")

    # sensor noise + final clip
    canvas += rng.normal(0, 60, size=(H, W)).astype(np.float32) * (canvas > 0)
    np.clip(canvas, 0, RAW_MAX, out=canvas)
    return canvas


def write_png(canvas: np.ndarray, path: str) -> None:
    # Display windowing so soft-tissue contrast is visible in 8-bit PNG.
    wc, ww = 2400.0, 6500.0
    px = np.clip((canvas - (wc - ww / 2.0)) * (255.0 / ww), 0, 255).astype(np.uint8)
    Image.fromarray(px, mode="L").save(path, optimize=True)
    print(f"  PNG   -> {os.path.relpath(path)}")


def write_dicom(canvas: np.ndarray, case: dict, path: str) -> None:
    ds = Dataset()
    ds.SOPClassUID = "1.2.840.10008.5.1.4.1.1.7"  # Secondary Capture Image Storage
    ds.SOPInstanceUID = generate_uid()
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.PatientID = case["patient"]
    ds.PatientSex = "F"
    ds.PatientAge = f"{case['age']:03d}Y"
    ds.StudyDate = case["studyDate"]
    ds.SeriesDate = case["studyDate"]
    ds.AccessionNumber = case["accession"]
    ds.Modality = "MG"
    ds.StudyDescription = case["studyDescription"]
    ds.SeriesDescription = "Screening mammogram phantom"
    ds.Laterality = case["side"]
    ds.Rows = H
    ds.Columns = W
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.WindowCenter = case["wc"]
    ds.WindowWidth = case["ww"]
    ds.PixelSpacing = ["0.07", "0.07"]
    ds.RescaleIntercept = "0"
    ds.RescaleSlope = "1"
    ds.PixelData = canvas.astype("<u2").tobytes()

    file_meta = Dataset()
    file_meta.MediaStorageSOPClassUID = ds.SOPClassUID
    file_meta.MediaStorageSOPInstanceUID = ds.SOPInstanceUID
    file_meta.TransferSyntaxUID = "1.2.840.10008.1.2.1"  # Explicit VR Little Endian
    file_meta.ImplementationClassUID = "1.2.826.0.1.3680043.10.844.1.1"

    fds = FileDataset(path, {}, file_meta=file_meta, preamble=b"\x00" * 128)
    fds.update(ds)
    fds.is_little_endian = True
    fds.is_implicit_VR = False
    fds.save_as(path, enforce_file_format=True)
    print(f"  DICOM -> {os.path.relpath(path)}")



# ---------------------------------------------------------------------------
# Worklist table (must mirror lib/mock-data.ts)
# ---------------------------------------------------------------------------

CASES = [
    {
        "file": "mg-2401_MLO_R.png", "image_id": "mg-2401", "side": "R", "view": "MLO",
        "seed": 2401, "patient": "PT-MAM-10485", "age": 54, "studyDate": "20260714",
        "accession": "ACC-2026-09122", "studyDescription": "Screening bilateral mammogram",
        "features": [
            {"kind": "coarse-calc", "radius": 60, "count": 14},
            {"kind": "coarse-calc", "radius": 28, "count": 5},
        ],
    },
    {
        "file": "mg-2402_CC_L.png", "image_id": "mg-2402", "side": "L", "view": "CC",
        "seed": 2402, "patient": "PT-MAM-10831", "age": 48, "studyDate": "20260715",
        "accession": "ACC-2026-09188", "studyDescription": "Screening bilateral mammogram",
        "features": [],
    },
    {
        "file": "mg-2403_MLO_L.png", "image_id": "mg-2403", "side": "L", "view": "MLO",
        "seed": 2403, "patient": "PT-MAM-11002", "age": 61, "studyDate": "20260802",
        "accession": "ACC-2026-09513", "studyDescription": "Diagnostic mammogram - palpable lump",
        "features": [
            {"kind": "mass-indistinct", "radius": 40},
            {"kind": "punctate-calc", "radius": 42, "count": 46},
            {"kind": "asymmetry", "radius": 110},
        ],
    },
    {
        "file": "mg-2404_MLO_R.dcm", "image_id": "mg-2404", "side": "R", "view": "MLO",
        "seed": 2404, "patient": "PT-MAM-11177", "age": 58, "studyDate": "20260805",
        "accession": "ACC-2026-09601", "studyDescription": "Diagnostic mammogram - recalled asymmetry",
        "wc": 5200, "ww": 9000,
        "features": [
            {"kind": "mass-spiculated", "radius": 52},
            {"kind": "pleo-calc", "radius": 55, "count": 90},
        ],
    },
    {
        "file": "mg-2405_CC_R.png", "image_id": "mg-2405", "side": "R", "view": "CC",
        "seed": 2405, "patient": "PT-MAM-11220", "age": 45, "studyDate": "20260811",
        "accession": "ACC-2026-09730", "studyDescription": "Screening bilateral mammogram",
        "features": [
            {"kind": "mass-circumscribed", "radius": 22},
        ],
    },
    {
        "file": "mg-2406_CC_L.dcm", "image_id": "mg-2406", "side": "L", "view": "CC",
        "seed": 2406, "patient": "PT-MAM-11305", "age": 52, "studyDate": "20260812",
        "accession": "ACC-2026-09745", "studyDescription": "Screening bilateral mammogram",
        "wc": 3600, "ww": 7500,
        "features": [
            {"kind": "hetero-calc", "radius": 48, "count": 30},
            {"kind": "hetero-calc", "radius": 26, "count": 12},
        ],
    },
    {
        "file": "mg-2407_MLO_R.png", "image_id": "mg-2407", "side": "R", "view": "MLO",
        "seed": 2407, "patient": "PT-MAM-11411", "age": 66, "studyDate": "20260818",
        "accession": "ACC-2026-09920", "studyDescription": "Diagnostic mammogram - suspicious mass",
        "features": [
            {"kind": "mass-spiculated", "radius": 62},
            {"kind": "pleo-calc", "radius": 70, "count": 120},
            {"kind": "distortion", "radius": 90},
        ],
    },
    {
        "file": "mg-2408_CC_L.png", "image_id": "mg-2408", "side": "L", "view": "CC",
        "seed": 2408, "patient": "PT-MAM-11502", "age": 39, "studyDate": "20260820",
        "accession": "ACC-2026-09981", "studyDescription": "Diagnostic mammogram - dense tissue follow-up",
        "features": [
            {"kind": "asymmetry", "radius": 120},
            {"kind": "distortion", "radius": 60},
        ],
    },
]


def default_output_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    candidate = os.path.normpath(os.path.join(here, "..", "public", "samples"))
    if not os.path.isdir(os.path.join(here, "..", "public")):
        raise SystemExit(
            "Expected to run inside the mammo-validator app folder so that\n"
            "public/samples can be resolved. Pass an explicit output dir instead:\n"
            "  python scripts/generate_sample_data.py C:/path/to/public/samples"
        )
    return candidate


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else default_output_dir()
    png_dir = os.path.join(out, "png")
    dicom_dir = os.path.join(out, "dicom")
    os.makedirs(png_dir, exist_ok=True)
    os.makedirs(dicom_dir, exist_ok=True)

    print(f"Generating {len(CASES)} synthetic mammogram phantoms -> {out}")
    for case in CASES:
        canvas = render_phantom(case)
        if case["file"].endswith(".png"):
            write_png(canvas, os.path.join(png_dir, case["file"]))
        else:
            write_dicom(canvas, case, os.path.join(dicom_dir, case["file"]))
    print("Done.")


if __name__ == "__main__":
    main()

