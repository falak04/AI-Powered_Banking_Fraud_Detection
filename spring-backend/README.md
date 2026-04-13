# Spring Backend

This folder contains the Spring Boot gateway between the React dashboard and the FastAPI ML service.

## Responsibilities

- validates incoming transaction and login payloads
- forwards requests to Python ML endpoints
- stores recent alerts and login events in in-memory dashboard state
- serves the aggregated dashboard snapshot used by the frontend
- exposes health and model metadata endpoints

## Key Files

- [src/main/java/com/example/demo/controller/FraudController.java](c:\Users\dhruv\Downloads\fraud-project\spring-backend\src\main\java\com\example\demo\controller\FraudController.java)
- [src/main/java/com/example/demo/service/FraudService.java](c:\Users\dhruv\Downloads\fraud-project\spring-backend\src\main\java\com\example\demo\service\FraudService.java)
- [src/main/java/com/example/demo/service/DashboardStateService.java](c:\Users\dhruv\Downloads\fraud-project\spring-backend\src\main\java\com\example\demo\service\DashboardStateService.java)

## Main Endpoints

- `POST /fraud/event`
- `POST /fraud/predict/transaction`
- `POST /fraud/predict/login`
- `GET /fraud/graph/risk/{userId}`
- `GET /fraud/graph/risk`
- `GET /fraud/dashboard/snapshot`
- `GET /fraud/health`
- `GET /fraud/model/info`
- `POST /fraud/batch`

## Run

From this folder:

```powershell
./mvnw spring-boot:run
```

## Compile Check

```powershell
./mvnw -q -DskipTests compile
```

## Configuration

Important property:

- `app.ml.base-url`

Default value points to:

- `http://localhost:8000`

## Notes

- dashboard state is session-local and memory-backed
- stored alerts and stored login events are what drive the frontend snapshot
- if Python is unavailable, Spring returns an error instead of inventing a synthetic result
