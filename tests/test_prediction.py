from pathlib import Path
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import mn
from predictor import (
    BUNDLE_SCHEMA_VERSION,
    FEATURE_COLUMNS,
    PredictionResult,
    PredictorError,
    PredictorService,
    load_bundle,
    save_bundle,
    train_bundle,
)


class FakeEstimator:
    classes_ = np.array([0, 1])

    def predict_proba(self, frame):
        return np.array([[0.45, 0.55] for _ in range(len(frame))])


def fake_bundle():
    return {
        "schema_version": BUNDLE_SCHEMA_VERSION,
        "model_version": "test-1",
        "trained_at": "2026-01-01T00:00:00+00:00",
        "dataset_fingerprint": "test",
        "feature_columns": FEATURE_COLUMNS,
        "class_mapping": {"0": "team2_win", "1": "team1_win"},
        "known_teams": ["Alpha", "Beta"],
        "known_cities": ["Bengaluru"],
        "known_toss_decisions": ["bat", "field"],
        "estimator": FakeEstimator(),
        "metrics": {"accuracy": 0.5},
    }


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(mn, "predictor", PredictorService(fake_bundle()))
    mn.app.config.update(TESTING=True)
    return mn.app.test_client()


def valid_payload():
    return {
        "team1": "Alpha",
        "team2": "Beta",
        "city": "Bengaluru",
        "toss_winner": "Alpha",
        "toss_decision": "bat",
        "target_runs": 181,
        "required_runs": 42,
        "balls_remaining": 28,
        "wickets_remaining": 6,
    }


def test_bundle_round_trip(tmp_path):
    path = tmp_path / "bundle.pkl"
    save_bundle(fake_bundle(), path)
    loaded = load_bundle(path)
    assert loaded["schema_version"] == BUNDLE_SCHEMA_VERSION
    assert set(loaded) >= {"estimator", "feature_columns", "known_teams", "metrics"}


def test_missing_bundle_is_controlled(tmp_path):
    with pytest.raises(PredictorError, match="missing"):
        load_bundle(tmp_path / "missing.pkl")


def test_prediction_route_returns_consistent_probabilities(client):
    response = client.post("/predict/result", json=valid_payload())
    assert response.status_code == 200
    body = response.get_json()
    assert body["success"] is True
    prediction = body["prediction"]
    assert prediction["team1_probability"] + prediction["team2_probability"] == pytest.approx(100)
    assert body["latency_ms"] >= 0
    assert body["match_context"]["required_run_rate"] == 9.0


@pytest.mark.parametrize(
    ("field", "value"),
    [("team2", "Alpha"), ("wickets_remaining", 11), ("balls_remaining", 121), ("toss_winner", "Gamma")],
)
def test_invalid_input_is_rejected(client, field, value):
    payload = valid_payload()
    payload[field] = value
    response = client.post("/predict/result", json=payload)
    assert response.status_code == 400
    assert field in response.get_json()["error"]["fields"]


def test_request_never_trains_or_fits(client, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Training must never run during prediction")
    monkeypatch.setattr("predictor.train_bundle", forbidden)
    response = client.post("/predict/result", json=valid_payload())
    assert response.status_code == 200


def test_chasing_team_mapping_changes_situation_direction():
    service = PredictorService(fake_bundle())
    first = valid_payload()
    first["toss_winner"] = "Alpha"
    first["toss_decision"] = "bat"  # Beta chases.
    beta_chases = service.predict({**first, "target_overs": 20.0})
    first["toss_decision"] = "field"  # Alpha chases.
    alpha_chases = service.predict({**first, "target_overs": 20.0})
    assert beta_chases.team1_probability < alpha_chases.team1_probability


def test_offline_training_creates_complete_bundle():
    rows = []
    for index in range(60):
        team1, team2 = ("Alpha", "Beta") if index % 2 == 0 else ("Beta", "Alpha")
        rows.append({
            "match_id": index,
            "team1": team1,
            "team2": team2,
            "city": "Bengaluru" if index % 3 else "Chennai",
            "toss_winner": team1 if index % 2 else team2,
            "toss_decision": "bat" if index % 3 else "field",
            "target_runs": 150 + index % 50,
            "target_overs": 20.0,
            "winner": team1 if index % 4 else team2,
        })
    bundle, metrics = train_bundle(pd.DataFrame(rows), "synthetic")
    assert bundle["feature_columns"] == FEATURE_COLUMNS
    assert set(bundle) >= {"estimator", "known_teams", "known_cities", "class_mapping", "metrics"}
    assert set(metrics) >= {"accuracy", "log_loss", "brier_score", "confusion_matrix"}
