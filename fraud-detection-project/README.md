# SafeNet Fraud Project

SafeNet is a three-service fraud detection demo:

- `frontend/`: React SOC dashboard and manual simulators
- `spring-backend/`: Spring Boot gateway, validation layer, and session-state store
- `ml-service/`: FastAPI inference service for transaction, login, SHAP, and graph risk

## Architecture

```text
React dashboard (:3000)
  -> Spring Boot API (:8080/fraud/*)
    -> FastAPI ML service (:8000/*)
```

## Dashboard Behavior

The dashboard is intended to be live-only.

What that means:

- no UI mock bootstrap:
  the frontend should not open with fake alerts, fake SHAP results, fake graph states, or fake login anomalies just to make the screen look active
- no fake fallback alerts or login anomalies:
  if Spring Boot or the Python ML service is unavailable, the UI should show the failure state instead of inventing a local fraud result
- no background auto-generated events:
  the dashboard should not silently create random transactions or logins only to keep panels moving
- visible results come from the real full pipeline:
  React form input -> Spring Boot -> Python ML service -> Spring Boot -> React render

In other words, whatever appears on the dashboard should be based on values that were actually submitted and actually scored by the backend services.

## Main Flows

Transaction simulation:

1. React builds a transaction payload from the simulator form.
2. Spring validates the request and forwards it to Python `POST /predict/event`.
3. Python returns ML score, SHAP explanation, graph lookup, combined risk, and action.
4. Spring stores the event in dashboard state.
5. React refreshes the stored snapshot and renders the returned result.

Login simulation:

1. React builds a login payload from the simulator form.
2. Spring validates the request and forwards it to Python `POST /predict/login`.
3. Python returns the Isolation Forest anomaly score.
4. Spring stores the login in dashboard state.
5. React refreshes the stored snapshot and renders the returned result.

## Run Locally

### 1. Start the ML service

From [ml-service](c:\Users\dhruv\Downloads\fraud-project\ml-service):

```powershell
uvicorn ml_service:app --reload --port 8000
```

### 2. Start Spring Boot

From [spring-backend](c:\Users\dhruv\Downloads\fraud-project\spring-backend):

```powershell
./mvnw spring-boot:run
```

Default ML base URL is `http://localhost:8000`.

### 3. Start the frontend

From [frontend](c:\Users\dhruv\Downloads\fraud-project\frontend):

```powershell
npm start
```

The frontend defaults to `http://localhost:8080`.

## Important Endpoints

Spring Boot:

- `GET /fraud/health`
- `GET /fraud/model/info`
- `POST /fraud/event`
- `POST /fraud/predict/transaction`
- `POST /fraud/predict/login`
- `GET /fraud/graph/risk/{userId}`
- `GET /fraud/graph/risk`
- `GET /fraud/dashboard/snapshot`
- `POST /fraud/batch`

FastAPI:

- `GET /health`
- `GET /model/info`
- `POST /predict/event`
- `POST /predict/transaction`
- `POST /predict/login`
- `GET /graph/risk/{userId}`
- `GET /graph/risk/all`
- `POST /batch/transactions`

## Verification

Useful local checks:

```powershell
# frontend
cd frontend
npm run build

# spring backend
cd ../spring-backend
./mvnw -q -DskipTests compile

# python service
cd ../ml-service
python -m py_compile ml_service.py
```

## Folder Guides

- [frontend/README.md](c:\Users\dhruv\Downloads\fraud-project\frontend\README.md)
- [spring-backend/README.md](c:\Users\dhruv\Downloads\fraud-project\spring-backend\README.md)
- [ml-service/README.md](c:\Users\dhruv\Downloads\fraud-project\ml-service\README.md)
