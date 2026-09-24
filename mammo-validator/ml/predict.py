"""Mammography label prediction — CLI and JSON-line server.

Loads the 4-fold ensemble from ``models/`` (PyTorch per-breast multiview
network + CatBoost head per fold) and predicts the 3-class label for one
breast given its CC + MLO pair.

Class collapse (exactly as trained in ``bestone_v3_cv_oof.ipynb``):
    0 -> Normal         (BI-RADS 1)
    1 -> Benign-leaning (BI-RADS 2-3)
    2 -> Suspicious     (BI-RADS 4-5)

Usage:
    python ml/predict.py <cc_image> <mlo_image> [--age 55] [--density C] [--models-dir PATH]
    python ml/predict.py --serve        # newline-delimited JSON on stdin/stdout

``--serve`` keeps every fold resident in memory so the Next.js API can reuse a
single process instead of paying the model-load cost on every request.

Request line  : {"image_cc": "<abs path>", "image_mlo": "<abs path>", "age": 55, "density": "C"}
Response line : {"ok": true, "label": 2, ...} or {"ok": false, "error": "..."}
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch

# Script-local import: works when executed as `python ml/predict.py`.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from model import (  # noqa: E402
    BreastMultiviewNetwork,
    CLASS_NAMES_3,
    DEFAULT_DENSITY_CODE,
    DENSITY_CHOICES,
    DENSITY_MAPPING,
    NUM_CLASSES,
    MammographyTransform,
)

MODEL_NAME = "SwinV2 + FT-Transformer + Cross-Attention + CatBoost"
MODEL_VERSION = "v1.0-cl (bestone_v3_cv_oof)"

# The 3-class collapse expressed as BI-RADS ranges (no invented precision).
CLASS_BIRADS_RANGE = ["BI-RADS 1", "BI-RADS 2-3", "BI-RADS 4-5"]

DEFAULT_AGE = 55.0
DEFAULT_MODELS_DIR = Path(__file__).resolve().parents[2] / "models"


def density_code_for(value: object) -> int:
    """Normalise 'A'..'D' / 'DENSITY C' / 0..3 into the training code."""
    if value is None or isinstance(value, bool):
        return DEFAULT_DENSITY_CODE
    if isinstance(value, int):
        return value if 0 <= value <= 3 else DEFAULT_DENSITY_CODE
    text = str(value).strip().upper()
    if text in DENSITY_CHOICES:
        return DENSITY_MAPPING[f"DENSITY {text}"]
    if text in DENSITY_MAPPING:
        return DENSITY_MAPPING[text]

# ---------------------------------------------------------------------------
# Ensemble predictor
# ---------------------------------------------------------------------------


class Predictor:
    """4-fold ensemble: PyTorch latent extractor + CatBoost classifier."""

    def __init__(
        self,
        models_dir: Path | str = DEFAULT_MODELS_DIR,
        max_folds: int = 0,
    ):
        self.models_dir = Path(models_dir)
        self.transform = MammographyTransform()
        self.folds: list[dict] = []
        self.load_errors: list[str] = []
        self._load(max_folds)

    # -- loading ---------------------------------------------------------

    def _load(self, max_folds: int) -> None:
        from catboost import CatBoostClassifier

        if not self.models_dir.exists():
            raise FileNotFoundError(f"Models directory not found: {self.models_dir}")

        checkpoints = sorted(self.models_dir.glob("fold_*_pytorch.pth"))
        if not checkpoints:
            raise FileNotFoundError(
                f"No 'fold_*_pytorch.pth' checkpoints in {self.models_dir}"
            )
        if max_folds > 0:
            checkpoints = checkpoints[:max_folds]

        for checkpoint_path in checkpoints:
            fold = int(checkpoint_path.stem.split("_")[1])
            catboost_path = self.models_dir / f"fold_{fold}_catboost.cbm"
            if not catboost_path.exists():
                self.load_errors.append(f"missing {catboost_path.name}")
                continue

            checkpoint = torch.load(
                checkpoint_path, map_location="cpu", weights_only=False
            )
            network = BreastMultiviewNetwork(
                embed_dim=int(checkpoint.get("embed_dim", 256)),
                num_classes=int(checkpoint.get("num_classes", NUM_CLASSES)),
            )
            missing, unexpected = network.load_state_dict(
                checkpoint["model_state_dict"], strict=False
            )
            network.eval()

            classifier = CatBoostClassifier()
            classifier.load_model(str(catboost_path))

            self.folds.append(
                {
                    "fold": fold,
                    "network": network,
                    "classifier": classifier,
                    "selected": np.asarray(
                        checkpoint["selected_feature_indices"], dtype=int
                    ),
                    "missing_keys": len(missing),
                    "unexpected_keys": len(unexpected),
                }
            )

    # -- introspection ---------------------------------------------------

    @property
    def ready(self) -> bool:
        return bool(self.folds)

    @property
    def fold_numbers(self) -> list[int]:
        return [fold["fold"] for fold in self.folds]

    def describe(self) -> dict:
        """Health report used by /api/predict to surface load problems."""
        return {
            "modelsConfigured": self.ready,
            "folds": self.fold_numbers,
            "loaded": len(self.folds),
            "loadErrors": self.load_errors,
            "missingKeys": [fold["missing_keys"] for fold in self.folds],
            "unexpectedKeys": [fold["unexpected_keys"] for fold in self.folds],
            "selectedFeatures": [len(fold["selected"]) for fold in self.folds],
        }

    # -- inference -------------------------------------------------------

    def predict(
        self,
        cc_path: Path | str,
        mlo_path: Path | str,
        age: float = DEFAULT_AGE,
        density: object = None,
    ) -> dict:
        """Score the CC + MLO pair of one breast and return the joint label."""
        if not self.folds:
            raise RuntimeError("No fold models are loaded.")

        cc = Path(cc_path)
        mlo = Path(mlo_path)
        missing = [p.name for p in (cc, mlo) if not p.exists()]
        if missing:
            raise FileNotFoundError(
                f"Image(s) not found: {', '.join(missing)}"
            )

        code = density_code_for(density)
        started = time.perf_counter()

        cc_tensor = self.transform(cc).unsqueeze(0)  # [1, 1, H, W]
        mlo_tensor = self.transform(mlo).unsqueeze(0)  # [1, 1, H, W]
        x_cat = torch.tensor([[code]], dtype=torch.long)
        x_cont = torch.tensor([[float(age)]], dtype=torch.float32)

        per_fold: list[dict] = []
        probability_rows: list[np.ndarray] = []
        with torch.no_grad():
            for fold in self.folds:
                _, latent_vector, _ = fold["network"](
                    cc_tensor, mlo_tensor, x_cat, x_cont
                )
                features = latent_vector.cpu().numpy()[:, fold["selected"]]
                probs = np.asarray(fold["classifier"].predict_proba(features))[0]
                probability_rows.append(probs)
                per_fold.append(
                    {
                        "fold": fold["fold"],
                        "label": int(np.argmax(probs)),
                        "probabilities": [round(float(p), 6) for p in probs],
                    }
                )

        mean_probs = np.mean(np.vstack(probability_rows), axis=0)
        label = int(np.argmax(mean_probs))

        return {
            "ok": True,
            "label": label,
            "labelName": CLASS_NAMES_3[label],
            "biradsRange": CLASS_BIRADS_RANGE[label],
            "confidence": round(float(mean_probs[label]), 6),
            "probabilities": {
                "normal": round(float(mean_probs[0]), 6),
                "benignLeaning": round(float(mean_probs[1]), 6),
                "suspicious": round(float(mean_probs[2]), 6),
            },
            "folds": per_fold,
            "model": MODEL_NAME,
            "modelVersion": MODEL_VERSION,
            "input": {
                "fileCC": cc.name,
                "fileMLO": mlo.name,
                "age": float(age),
                "densityCode": code,
            },
            "elapsedMs": round((time.perf_counter() - started) * 1000),
        }


def _handle_request(predictor: Predictor, payload: dict) -> dict:
    """Never raises — errors travel back to the caller as JSON."""
    try:
        cc_path = payload.get("image_cc") or ""
        mlo_path = payload.get("image_mlo") or ""
        if not cc_path or not mlo_path:
            return {
                "ok": False,
                "error": (
                    "Both image_cc and image_mlo are required "
                    "(per-breast inference over the CC + MLO pair)."
                ),
            }
        return predictor.predict(
            cc_path,
            mlo_path,
            age=float(payload.get("age", DEFAULT_AGE)),
            density=payload.get("density"),
        )
    except Exception as exc:  # noqa: BLE001 - reported to the API caller
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Mammography label prediction (SwinV2 + CatBoost ensemble)"
    )
    parser.add_argument("cc_image", nargs="?", help="CC PNG/JPG or DICOM to score")
    parser.add_argument("mlo_image", nargs="?", help="MLO PNG/JPG or DICOM to score")
    parser.add_argument("--age", type=float, default=DEFAULT_AGE)
    parser.add_argument("--density", default="C", help="A | B | C | D")
    parser.add_argument("--models-dir", default=str(DEFAULT_MODELS_DIR))
    parser.add_argument("--max-folds", type=int, default=0, help="0 = all folds")
    parser.add_argument(
        "--serve", action="store_true", help="JSON-line request server on stdin"
    )
    parser.add_argument(
        "--describe", action="store_true", help="Print model info and exit"
    )
    args = parser.parse_args(argv)

    try:
        predictor = Predictor(args.models_dir, max_folds=args.max_folds)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}))
        return 2

    if args.describe:
        print(json.dumps({"ok": True, **predictor.describe()}, indent=2))
        return 0

    if args.serve:
        # One JSON request per line; models stay resident between requests.
        for line in sys.stdin:
            stripped = line.strip()
            if not stripped:
                continue
            try:
                payload = json.loads(stripped)
            except json.JSONDecodeError as exc:
                response = {"ok": False, "error": f"Invalid JSON: {exc}"}
            else:
                if payload.get("command") == "describe":
                    response = {"ok": True, **predictor.describe()}
                else:
                    response = _handle_request(predictor, payload)
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
        return 0

    if not args.cc_image or not args.mlo_image:
        parser.error(
            "a CC image and an MLO image are required "
            "(per-breast inference over the CC + MLO pair)"
        )

    result = _handle_request(
        predictor,
        {
            "image_cc": args.cc_image,
            "image_mlo": args.mlo_image,
            "age": args.age,
            "density": args.density,
        },
    )
    print(json.dumps(result, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())

