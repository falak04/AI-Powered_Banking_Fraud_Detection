FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Use PORT env if provided by the host (Render sets $PORT)
CMD ["sh", "-c", "uvicorn ml_service:app --host 0.0.0.0 --port ${PORT:-8000}"]
