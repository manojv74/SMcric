"""SMcric Flask application.

The model bundle is loaded once per process. Training is intentionally absent
from this module and from every request path.
"""

from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any

import requests
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

from predictor import PredictorError, PredictorService, load_bundle


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = Path(os.getenv("SMCRIC_MODEL_PATH", BASE_DIR / "predictor_bundle.pkl"))

app = Flask(__name__)
CORS(app)

predictor: PredictorService | None = None
model_error: str | None = None
try:
    predictor = PredictorService(load_bundle(MODEL_PATH))
except PredictorError as exc:
    model_error = str(exc)
    app.logger.error("Prediction model unavailable: %s", exc)


def error_response(code: str, message: str, fields: dict[str, str] | None = None, status: int = 400):
    return jsonify({"success": False, "error": {"code": code, "message": message, "fields": fields or {}}}), status


def _number(data: dict[str, Any], key: str, integer: bool = False):
    try:
        value = int(data[key]) if integer else float(data[key])
    except (KeyError, TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def validate_prediction(data: Any) -> tuple[dict[str, Any] | None, dict[str, str]]:
    if not isinstance(data, dict):
        return None, {"request": "Send a JSON object."}
    fields: dict[str, str] = {}
    required_text = ["team1", "team2", "city", "toss_winner", "toss_decision"]
    for key in required_text:
        if not isinstance(data.get(key), str) or not data[key].strip():
            fields[key] = "This field is required."

    required_runs = _number(data, "required_runs", integer=True)
    target_runs = _number(data, "target_runs", integer=True)
    balls_remaining = _number(data, "balls_remaining", integer=True)
    wickets_remaining = _number(data, "wickets_remaining", integer=True)
    for key, value in {
        "required_runs": required_runs,
        "target_runs": target_runs,
        "balls_remaining": balls_remaining,
        "wickets_remaining": wickets_remaining,
    }.items():
        if value is None:
            fields[key] = "Enter a valid whole number."

    if fields:
        return None, fields
    if data["team1"] == data["team2"]:
        fields["team2"] = "Choose a different team."
    if predictor:
        if data["team1"] not in predictor.known_teams:
            fields["team1"] = "This team is not supported by the trained model."
        if data["team2"] not in predictor.known_teams:
            fields["team2"] = "This team is not supported by the trained model."
        if data["city"] not in predictor.known_cities:
            fields["city"] = "This city is not supported by the trained model."
    if data["toss_winner"] not in {data["team1"], data["team2"]}:
        fields["toss_winner"] = "Toss winner must be one of the selected teams."
    if data["toss_decision"] not in {"bat", "field"}:
        fields["toss_decision"] = "Choose bat or field."
    if required_runs < 0:
        fields["required_runs"] = "Required runs cannot be negative."
    if target_runs <= 0:
        fields["target_runs"] = "Target must be greater than zero."
    if required_runs > target_runs:
        fields["required_runs"] = "Required runs cannot exceed the target."
    if not 1 <= balls_remaining <= 120:
        fields["balls_remaining"] = "Balls remaining must be between 1 and 120."
    if not 0 <= wickets_remaining <= 10:
        fields["wickets_remaining"] = "Wickets remaining must be between 0 and 10."
    if fields:
        return None, fields

    return {
        "team1": data["team1"],
        "team2": data["team2"],
        "city": data["city"],
        "toss_winner": data["toss_winner"],
        "toss_decision": data["toss_decision"],
        "required_runs": required_runs,
        "target_runs": target_runs,
        "balls_remaining": balls_remaining,
        "wickets_remaining": wickets_remaining,
        "target_overs": 20.0,
    }, {}


@app.get("/")
def index():
    return render_template("home.html")


@app.get("/predict")
def predict_form():
    return render_template("predict.html")


@app.get("/dropdown_data")
def dropdown_data():
    if predictor is None:
        return error_response("MODEL_UNAVAILABLE", "Prediction model is not available.", status=503)
    teams = [{"name": name} for name in sorted(predictor.known_teams)]
    return jsonify({"success": True, "teams": teams, "cities": sorted(predictor.known_cities)})


@app.post("/predict/result")
def predict_result():
    if predictor is None:
        return error_response("MODEL_UNAVAILABLE", "Prediction model is not available. Train and deploy the bundle first.", status=503)
    match, fields = validate_prediction(request.get_json(silent=True))
    if fields:
        return error_response("INVALID_INPUT", "Please correct the highlighted fields.", fields, 400)
    try:
        result = predictor.predict(match)
    except Exception:
        app.logger.exception("Unexpected prediction failure")
        return error_response("PREDICTION_FAILED", "The prediction could not be completed.", status=500)
    return jsonify({
        "success": True,
        "prediction": {
            "team1": match["team1"],
            "team2": match["team2"],
            "team1_probability": result.team1_probability,
            "team2_probability": result.team2_probability,
            "predicted_winner": result.predicted_winner,
        },
        "match_context": {
            "required_runs": match["required_runs"],
            "balls_remaining": match["balls_remaining"],
            "wickets_remaining": match["wickets_remaining"],
            "required_run_rate": result.required_run_rate,
        },
        "model": {
            "version": predictor.model_version,
            "situation_method": result.situation_method,
            "disclaimer": "Estimate based on historical match results and a bounded chase-situation heuristic.",
        },
        "latency_ms": result.latency_ms,
    })


@app.get("/live_matches")
def live_matches():
    api_key = os.getenv("RAPIDAPI_KEY")
    if not api_key:
        return jsonify({"error": "Live-match service is not configured"}), 503
    try:
        response = requests.get(
            "https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent",
            headers={"x-rapidapi-key": api_key, "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com"},
            timeout=10,
        )
        response.raise_for_status()
        return jsonify(response.json())
    except requests.RequestException:
        app.logger.exception("Live-match request failed")
        return jsonify({"error": "Live matches are temporarily unavailable"}), 502


@app.get("/health")
def health():
    return jsonify({"status": "ok", "model_ready": predictor is not None, "model_error": model_error})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
