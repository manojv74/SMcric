"""Training and inference primitives for SMcric.

The classifier learns pre-match team strength from match-level IPL records.
Live chase inputs are applied as an explicitly documented situation estimate;
they are not represented as learned ball-by-ball features.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import math
from pathlib import Path
from time import perf_counter
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    classification_report,
    confusion_matrix,
    log_loss,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


BUNDLE_SCHEMA_VERSION = 1
FEATURE_COLUMNS = [
    "team1",
    "team2",
    "city",
    "toss_winner",
    "toss_decision",
    "target_runs",
    "target_overs",
]
CATEGORICAL_COLUMNS = FEATURE_COLUMNS[:5]
NUMERIC_COLUMNS = FEATURE_COLUMNS[5:]


class PredictorError(RuntimeError):
    """Raised when a predictor bundle is missing or incompatible."""


@dataclass(frozen=True)
class PredictionResult:
    team1_probability: float
    team2_probability: float
    predicted_winner: str
    required_run_rate: float
    latency_ms: float
    situation_method: str = "bounded_chase_estimate_v1"


def dataset_fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()[:16]


def _validate_training_frame(frame: pd.DataFrame) -> pd.DataFrame:
    required = set(FEATURE_COLUMNS + ["winner"])
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise ValueError(f"Dataset is missing columns: {', '.join(missing)}")
    clean = frame.dropna(subset=list(required)).copy()
    clean = clean[(clean["winner"] == clean["team1"]) | (clean["winner"] == clean["team2"])]
    if clean.empty:
        raise ValueError("Dataset has no valid completed matches")
    clean["target_runs"] = pd.to_numeric(clean["target_runs"], errors="coerce")
    clean["target_overs"] = pd.to_numeric(clean["target_overs"], errors="coerce")
    clean = clean.dropna(subset=["target_runs", "target_overs"])
    return clean


def build_estimator(random_state: int = 42) -> CalibratedClassifierCV:
    preprocessor = ColumnTransformer(
        transformers=[
            ("categories", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_COLUMNS),
            ("numbers", StandardScaler(), NUMERIC_COLUMNS),
        ]
    )
    forest = RandomForestClassifier(
        n_estimators=220,
        max_depth=9,
        min_samples_leaf=4,
        class_weight="balanced",
        random_state=random_state,
        n_jobs=-1,
    )
    pipeline = Pipeline([("preprocess", preprocessor), ("model", forest)])
    return CalibratedClassifierCV(pipeline, method="sigmoid", cv=3)


def train_bundle(frame: pd.DataFrame, dataset_hash: str = "unknown") -> tuple[dict[str, Any], dict[str, Any]]:
    """Train chronologically and return a complete serializable bundle."""
    clean = _validate_training_frame(frame)
    if "match_id" in clean.columns:
        clean = clean.sort_values("match_id")
    split_at = max(int(len(clean) * 0.8), 1)
    train = clean.iloc[:split_at]
    test = clean.iloc[split_at:]
    if test.empty or train["winner"].nunique() < 2:
        raise ValueError("Dataset is too small for chronological evaluation")

    y_train = (train["winner"] == train["team1"]).astype(int)
    y_test = (test["winner"] == test["team1"]).astype(int)
    estimator = build_estimator()
    estimator.fit(train[FEATURE_COLUMNS], y_train)
    probabilities = estimator.predict_proba(test[FEATURE_COLUMNS])[:, 1]
    predictions = (probabilities >= 0.5).astype(int)

    metrics = {
        "accuracy": round(float(accuracy_score(y_test, predictions)), 4),
        "log_loss": round(float(log_loss(y_test, probabilities, labels=[0, 1])), 4),
        "brier_score": round(float(brier_score_loss(y_test, probabilities)), 4),
        "confusion_matrix": confusion_matrix(y_test, predictions, labels=[0, 1]).tolist(),
        "classification_report": classification_report(
            y_test, predictions, labels=[0, 1], output_dict=True, zero_division=0
        ),
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
    }
    bundle = {
        "schema_version": BUNDLE_SCHEMA_VERSION,
        "model_version": datetime.now(timezone.utc).strftime("%Y.%m.%d.%H%M"),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset_fingerprint": dataset_hash,
        "feature_columns": FEATURE_COLUMNS,
        "class_mapping": {"0": "team2_win", "1": "team1_win"},
        "known_teams": sorted(set(clean["team1"]) | set(clean["team2"])),
        "known_cities": sorted(clean["city"].unique().tolist()),
        "known_toss_decisions": sorted(clean["toss_decision"].unique().tolist()),
        "estimator": estimator,
        "metrics": metrics,
    }
    return bundle, metrics


def save_bundle(bundle: dict[str, Any], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, destination, compress=3)


def load_bundle(path: Path) -> dict[str, Any]:
    try:
        bundle = joblib.load(path)
    except FileNotFoundError as exc:
        raise PredictorError(f"Model bundle is missing: {path.name}") from exc
    except Exception as exc:
        raise PredictorError("Model bundle could not be loaded") from exc
    required = {
        "schema_version", "model_version", "feature_columns", "class_mapping",
        "known_teams", "known_cities", "known_toss_decisions", "estimator", "metrics",
    }
    if not isinstance(bundle, dict) or not required.issubset(bundle):
        raise PredictorError("Model bundle is incomplete")
    if bundle["schema_version"] != BUNDLE_SCHEMA_VERSION:
        raise PredictorError("Model bundle schema is incompatible")
    if bundle["feature_columns"] != FEATURE_COLUMNS:
        raise PredictorError("Model bundle feature order is incompatible")
    return bundle


class PredictorService:
    """Read-only inference service loaded once per Flask/Gunicorn process."""

    def __init__(self, bundle: dict[str, Any]):
        self.bundle = bundle
        self.estimator = bundle["estimator"]
        self.known_teams = frozenset(bundle["known_teams"])
        self.known_cities = frozenset(bundle["known_cities"])
        self.known_toss_decisions = frozenset(bundle["known_toss_decisions"])

    @property
    def model_version(self) -> str:
        return str(self.bundle["model_version"])

    def _chase_probability(self, match: dict[str, Any]) -> float:
        balls = match["balls_remaining"]
        wickets = match["wickets_remaining"]
        required_runs = match["required_runs"]
        target_runs = match["target_runs"]
        required_rate = required_runs * 6 / balls
        par_rate = target_runs / 20
        rate_pressure = required_rate - par_rate
        wicket_strength = (wickets - 5) / 2.5
        progress = 1 - balls / 120
        logit = 0.35 + 0.62 * wicket_strength - 0.58 * rate_pressure - 0.25 * progress
        return float(np.clip(1 / (1 + math.exp(-np.clip(logit, -12, 12))), 0.05, 0.95))

    def predict(self, match: dict[str, Any]) -> PredictionResult:
        started = perf_counter()
        frame = pd.DataFrame([{key: match[key] for key in FEATURE_COLUMNS}])
        classes = list(self.estimator.classes_)
        class_one_index = classes.index(1)
        team1_base = float(self.estimator.predict_proba(frame)[0][class_one_index])

        toss_winner = match["toss_winner"]
        team1_bats_first = (
            (toss_winner == match["team1"] and match["toss_decision"] == "bat")
            or (toss_winner == match["team2"] and match["toss_decision"] == "field")
        )
        chasing_team = match["team2"] if team1_bats_first else match["team1"]
        chase_probability = self._chase_probability(match)
        team1_situation = chase_probability if chasing_team == match["team1"] else 1 - chase_probability
        progress = 1 - match["balls_remaining"] / 120
        situation_weight = float(np.clip(0.35 + 0.45 * progress, 0.35, 0.8))
        team1_probability = (1 - situation_weight) * team1_base + situation_weight * team1_situation
        team1_probability = float(np.clip(team1_probability, 0.03, 0.97))
        team2_probability = 1 - team1_probability
        winner = match["team1"] if team1_probability >= 0.5 else match["team2"]
        return PredictionResult(
            team1_probability=round(team1_probability * 100, 2),
            team2_probability=round(team2_probability * 100, 2),
            predicted_winner=winner,
            required_run_rate=round(match["required_runs"] * 6 / match["balls_remaining"], 2),
            latency_ms=round((perf_counter() - started) * 1000, 2),
        )
