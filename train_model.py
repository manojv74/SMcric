"""Offline-only SMcric model training entry point."""

import argparse
import json
from pathlib import Path

import pandas as pd

from predictor import dataset_fingerprint, save_bundle, train_bundle


BASE_DIR = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and save the SMcric predictor bundle")
    parser.add_argument("--data", type=Path, default=BASE_DIR / "output2.csv")
    parser.add_argument("--output", type=Path, default=BASE_DIR / "predictor_bundle.pkl")
    args = parser.parse_args()
    if not args.data.exists():
        raise SystemExit(f"Dataset not found: {args.data}")

    frame = pd.read_csv(args.data)
    bundle, metrics = train_bundle(frame, dataset_fingerprint(args.data))
    save_bundle(bundle, args.output)
    print(f"Saved bundle: {args.output}")
    print(f"Model version: {bundle['model_version']}")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
