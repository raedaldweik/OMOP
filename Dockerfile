# ── 1) Build the frontend ──────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ .
RUN npm run build

# ── 2) Backend + bundled frontend dist ─────────────────────────
FROM python:3.12-slim
WORKDIR /app

# System packages (sqlite3 is in stdlib but good to have CLI for debugging)
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 ca-certificates curl && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend /app/frontend/dist /app/frontend/dist

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
