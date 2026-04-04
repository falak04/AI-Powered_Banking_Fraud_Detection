# Fraud Detection Architecture

This project now follows a clear three-service flow:

1. `frontend` is the React UI where a user enters transaction features.
2. `spring-backend` is the orchestration layer that validates requests and forwards them to the ML service.
3. `ml-service` is the FastAPI inference service that loads the trained model, scores the transaction, and returns explanations.

```text
React UI (:3000)
   -> Spring Boot API (/fraud/predict on :8080)
      -> FastAPI ML service (/predict on :8000)
         -> model + scaler + SHAP explainer
```

## What Was Fixed

- Removed hardcoded architecture assumptions from the UI and backend by making endpoints configurable.
- Added backend validation so incomplete or invalid transaction payloads are rejected before hitting the model.
- Added centralized backend error handling for validation failures and ML connectivity problems.
- Replaced the ML service's untyped `dict` API with explicit request/response models.
- Added a health endpoint to the ML service.
- Updated the frontend so it reflects the actual architecture and handles API errors more cleanly.

## Run The System

### 1. Start the ML service

From `C:\Users\dhruv\Downloads\fraud-project\ml-service`:

```powershell
uvicorn ml_service:app --reload --port 8000
```

### 2. Start the Spring backend

From `C:\Users\dhruv\Downloads\fraud-project\spring-backend`:

```powershell
./mvnw spring-boot:run
```

The backend uses `app.ml.predict-url=http://localhost:8000/predict` by default.

### 3. Start the frontend

From `C:\Users\dhruv\Downloads\fraud-project\frontend`:

```powershell
npm start
```

If you want a different backend URL, copy `.env.example` to `.env` and set `REACT_APP_API_BASE_URL`.

## Architecture Notes

- The frontend should only call the Spring API, not the ML service directly.
- The backend owns input validation and integration concerns.
- The ML service owns model loading, prediction, and explanation generation.
- This separation makes it easier to swap models or scale inference independently without changing the UI contract.
