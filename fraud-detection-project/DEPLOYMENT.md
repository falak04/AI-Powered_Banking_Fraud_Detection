Deployment guide — Spring backend + ML service on Render, Frontend on Vercel

Overview

- `spring-backend`: Spring Boot service (Docker image) — listens on 8080
- `ml-service`: FastAPI/uvicorn ML service (Docker image) — listens on $PORT (defaults 8000)
- `frontend`: React app deployed to Vercel (static build)

What I added

- `spring-backend/Dockerfile` — multi-stage Maven build + runtime image
- `ml-service/Dockerfile` — Python image, installs `requirements.txt`, runs uvicorn
- `.dockerignore` for services
- `frontend/vercel.json` — instructs Vercel to build the React app
- `DEPLOYMENT.md` (this file)

Render (for `spring-backend` and `ml-service`)

1. Sign in to Render and create a new "Web Service".
2. Connect your Git repo and select the subfolder for the service (use the repo path and set the "Root Directory" to the folder):
   - For backend: `spring-backend`
   - For ML: `ml-service`
3. Choose "Docker" as the Environment (Render will use the `Dockerfile` in that folder).
4. Set the port and health check:
   - `spring-backend`: Render will map to container port 8080. Set the Health Check Path to `/` or an API endpoint your app exposes.
   - `ml-service`: Render provides `$PORT`; the image uses `${PORT:-8000}`. Set Health Check Path to `/health`.
5. Add any required Environment Variables in Render's dashboard (example):
   - `SPRING_PROFILES_ACTIVE` — if you use Spring profiles
   - Any DB connection strings or API keys required by your backend
6. Deploy. Render will build the Docker image and run the service.

Notes for the `spring-backend` Dockerfile

- The Dockerfile builds the app with Maven inside the image (multi-stage) and exposes port 8080.
- If you want to use pre-built artifacts, you can change the Dockerfile to copy a prepared JAR instead.

Notes for `ml-service` Dockerfile

- The Dockerfile installs `requirements.txt` then copies the service and models.
- The container CMD uses `uvicorn ml_service:app` and will respect the `PORT` env var provided by Render.

Vercel (for `frontend`)

1. Go to Vercel and import the project (or create a new project from Git).
2. When prompted for the root directory, set it to the `frontend` folder.
3. Vercel will use `npm run build` (make sure `package.json` has a `build` script). The `vercel.json` in `frontend` configures the static build output.
4. Set any environment variables your frontend needs under Project Settings → Environment Variables.

Local testing commands

- Build Spring image locally:

```bash
cd spring-backend
docker build -t fraud-spring-backend .
docker run -p 8080:8080 fraud-spring-backend
```

- Build ML service image locally:

```bash
cd ml-service
docker build -t fraud-ml-service .
docker run -p 8000:8000 -e PORT=8000 fraud-ml-service
```

- Frontend locally:

```bash
cd frontend
npm install
npm run build
npx serve -s build -l 5000
```

Next steps I can do for you

- Create a `render.yaml` with service definitions (I can scaffold it if you want).
- Add CI workflow (GitHub Actions) to build and push images to a registry.
- Add environment variable placeholders to `application.properties`.
