from pathlib import Path
import re

import pytest

import mn


ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture()
def client():
    mn.app.config.update(TESTING=True)
    return mn.app.test_client()


def valid_payload():
    return {
        "team1": "Royal Challengers Bengaluru",
        "team2": "Chennai Super Kings",
        "city": "Bengaluru",
        "toss_winner": "Royal Challengers Bengaluru",
        "toss_decision": "bat",
        "target_runs": 181,
        "required_runs": 42,
        "remaining_overs": 4.67,
        "wickets_lost": 4,
    }


def test_prediction_route_uses_mn_contract(client, monkeypatch):
    captured = {}

    def fake_main(match_info):
        captured.update(match_info)
        return mn.jsonify(
            team1=match_info["team1"],
            team2=match_info["team2"],
            team1_win_probability=52.73,
            team2_win_probability=47.27,
        )

    monkeypatch.setattr(mn, "main", fake_main)
    response = client.post("/predict/result", json=valid_payload())

    assert response.status_code == 200
    assert captured["remaining_overs"] == pytest.approx(4.67)
    assert captured["wickets_lost"] == 4
    assert captured["target_overs"] == 20
    assert response.get_json()["team1_win_probability"] == pytest.approx(52.73)


@pytest.mark.parametrize(
    "field",
    [
        "team1",
        "team2",
        "city",
        "required_runs",
        "remaining_overs",
        "wickets_lost",
        "toss_winner",
        "toss_decision",
        "target_runs",
    ],
)
def test_missing_required_field_is_rejected(client, field):
    payload = valid_payload()
    payload.pop(field)
    response = client.post("/predict/result", json=payload)
    assert response.status_code == 400
    assert field in response.get_json()["fields"]


def test_dropdown_endpoint_returns_dataset_values(client):
    response = client.get("/dropdown_data")
    body = response.get_json()
    assert response.status_code == 200
    assert body["team1"]
    assert body["team2"]
    assert "Bengaluru" in body["cities"]


def test_frontend_fields_match_mn_contract():
    html = (ROOT / "templates" / "predict.html").read_text(encoding="utf-8")
    script = (ROOT / "static" / "js" / "predict.js").read_text(encoding="utf-8")

    assert 'name="remaining_overs"' in html
    assert 'name="wickets_lost"' in html
    assert 'name="balls_remaining"' not in html
    assert 'name="wickets_remaining"' not in html
    assert "remaining_overs: values.remaining_overs" in script
    assert "wickets_lost: values.wickets_lost" in script


def test_frontend_reads_flat_mn_response():
    script = (ROOT / "static" / "js" / "predict.js").read_text(encoding="utf-8")
    assert "data.team1_win_probability" in script
    assert "data.team2_win_probability" in script
    assert "data.prediction" not in script
    assert "data.success" not in script


def test_supported_city_list_is_curated_and_known_to_dataset():
    script = (ROOT / "static" / "js" / "predict.js").read_text(encoding="utf-8")
    block = re.search(r"SUPPORTED_CITIES = new Set\(\[(.*?)\]\);", script, re.S)
    assert block
    supported = re.findall(r"'([^']+)'", block.group(1))

    _, _, dataset_cities = mn.read_csv_data(ROOT / "output2.csv")
    assert 1 < len(supported) < len(dataset_cities)
    assert set(supported).issubset(set(dataset_cities))
    assert "Unknown" not in supported
