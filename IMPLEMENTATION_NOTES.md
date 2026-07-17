# SMcric prediction workflow update

## Root cause

The previous Flask process loaded a bundle when possible but silently retrained from `output2.csv` whenever the bundle was missing or incompatible. That fallback ran feature fitting, XGBoost training, feature selection and cross-validation in the web process, causing the reported 10–15 second delay. The request also used inconsistent wicket names and reversed the chasing-team mapping in the situation adjustment.

The dataset contains completed match-level records. It does not contain ball-by-ball chase states, so required runs, balls remaining and wickets remaining cannot truthfully be described as features learned by the classifier.

## New architecture

```text
python train_model.py
        ↓
predictor_bundle.pkl
        ↓ loaded once per process
gunicorn mn:app
        ↓
POST /predict/result → validate → predict_proba → bounded chase estimate → JSON
```

`mn.py` has no training imports or training fallback. A missing/incompatible bundle produces a controlled `503` response.

## Bundle contents

- Calibrated preprocessing/model pipeline
- Fixed ordered feature list
- Explicit class-to-team mapping
- Known teams, cities and toss decisions
- Schema and model version
- Training timestamp and dataset fingerprint
- Chronological holdout metrics

## Commands

Install application dependencies:

```bash
pip install -r requirements.txt
```

Train intentionally after dataset/model changes:

```bash
python train_model.py
```

Run locally:

```bash
python mn.py
```

Run tests:

```bash
pip install -r requirements-dev.txt
pytest -q
```

Production remains:

```bash
gunicorn mn:app
```

## Measured results

Actual `output2.csv`, chronological 80/20 holdout:

- Training rows: 872
- Test rows: 218
- Accuracy: 62.84%
- Log loss: 0.6823
- Brier score: 0.2446
- Confusion matrix: `[[47, 59], [22, 90]]`

Local inference benchmark, 100 calls:

- First call: 96.34 ms
- Median: 105.25 ms
- Mean: 104.60 ms
- Maximum: 153.04 ms

Hardware and deployment worker load will change exact timings.

## Important limitation

The percentage combines a calibrated pre-match classifier with a bounded, documented chase-situation heuristic. It is not a ball-by-ball trained live win-probability model. A future accuracy upgrade should use ball-level innings data with the outcome from every match state and should re-evaluate calibration chronologically.

## UI changes

- Matching dark-green SMcric design
- Grouped match, toss and chase inputs
- Balls remaining instead of ambiguous decimal overs
- Live required-run-rate preview
- Loading/timeout/double-submit protection
- Inline and summary validation
- Responsive two-column result layout
- Probability, match context, model version and measured latency
- Clear estimate disclaimer
- Reduced-motion support

## Deployment requirement

`predictor_bundle.pkl` must be present in the deployed repository or artifact. Do not train it during Render build, startup, health checks or prediction requests.
