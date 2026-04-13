# Frontend

This folder contains the React SOC dashboard.

## What It Does

- shows recent stored alerts from Spring
- renders the fraud graph, timeline, AI explanation, and login heatmap
- provides manual transaction and login simulators
- refreshes dashboard panels from `GET /fraud/dashboard/snapshot`

## Live-Only Behavior

The frontend is configured to avoid fake demo data:

- it starts with empty state
- it does not fabricate fallback alerts or login anomalies
- it does not auto-generate background events
- simulator results only appear after the live backend pipeline returns

## Key Files

- [src/App.js](c:\Users\dhruv\Downloads\fraud-project\frontend\src\App.js): main dashboard UI and simulator flows
- [src/App.css](c:\Users\dhruv\Downloads\fraud-project\frontend\src\App.css): dashboard styling
- [src/api.js](c:\Users\dhruv\Downloads\fraud-project\frontend\src\api.js): Spring API client

## Commands

From this folder:

```powershell
npm install
npm start
npm run build
```

## Configuration

Environment variable:

- `REACT_APP_API_URL`

Default API base:

- `http://localhost:8080`

## Expected Backend Contract

The frontend expects Spring Boot to expose:

- `GET /fraud/health`
- `GET /fraud/model/info`
- `GET /fraud/dashboard/snapshot`
- `POST /fraud/event`
- `POST /fraud/predict/login`
