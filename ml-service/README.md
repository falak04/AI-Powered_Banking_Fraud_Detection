# ML Service

This folder contains the FastAPI inference service.

## Responsibilities

- transaction scoring with XGBoost
- login anomaly scoring with Isolation Forest
- SHAP feature explanations for transaction events
- graph risk lookup from precomputed node scores
- combined action decisioning for the unified event endpoint

## Key Files

- [ml_service.py](c:\Users\dhruv\Downloads\fraud-project\ml-service\ml_service.py)
- [data/isolation.py](c:\Users\dhruv\Downloads\fraud-project\ml-service\data\isolation.py)
- [models](c:\Users\dhruv\Downloads\fraud-project\ml-service\models)

What these mean:

- [ml_service.py](c:\Users\dhruv\Downloads\fraud-project\ml-service\ml_service.py):
  the runtime inference service. This is the file that FastAPI runs. It loads the saved artifacts from `models/` and scores new requests.
- [data/isolation.py](c:\Users\dhruv\Downloads\fraud-project\ml-service\data\isolation.py):
  training code. This is one of the scripts used to create the login anomaly model from dataset files. You run code like this during model-building time, not during live API prediction time.
- [models](c:\Users\dhruv\Downloads\fraud-project\ml-service\models):
  saved model artifacts produced by the training scripts. `ml_service.py` reads these files at runtime.

Simple distinction:

- `data/` = training scripts and datasets used to build models
- `models/` = saved output files produced by training
- `ml_service.py` = inference code that uses those saved files for live prediction

## Model Artifacts

Important files in `models/` include:

- transaction model and scaler
- SHAP explainer
- Isolation Forest model
- login feature list
- graph risk score map

The login path now checks for either:

- `scaler.pkl`
- `scaler (1).pkl`

## API Surface

- `GET /health`
- `GET /model/info`
- `POST /predict/transaction`
- `POST /predict/login`
- `POST /predict/event`
- `GET /graph/risk/{userId}`
- `GET /graph/risk/all`
- `POST /batch/transactions`

## Run

From this folder:

```powershell
uvicorn ml_service:app --reload --port 8000
```

## Syntax Check

```powershell
python -m py_compile ml_service.py
```

## Notes

- login `time_diff` is treated as hours
- the service applies the saved login scaler when the scaler artifact is present
- graph risk is a lookup value, not a probability
- the service returns errors when required model artifacts are missing instead of fabricating scores
