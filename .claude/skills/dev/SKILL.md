---
name: dev
description: Start the OpenLearnQuest dev environment — checks PostgreSQL, applies pending Alembic migrations, starts the FastAPI backend on port 8001 and the Vite frontend on 5173, and health-checks both. Use when asked to "start the dev environment", "run the app", "start backend/frontend", "启动项目", or before any task that needs the app running (QA, playing a question flow, testing the tutor).
---

# Start the Dev Environment

Bring up both servers with health checks. Absolute rule: **backend runs on port 8001, never 8000** (8000 belongs to another project on this machine).

## 1. Check what's already running

```bash
curl -s http://localhost:8001/health   # backend up? -> {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173   # frontend up? -> 200
```

Skip starting whatever is already healthy. If port 8001 is occupied but `/health` fails, find and report the offending process (`netstat -ano | findstr :8001`) instead of picking a different port.

## 2. Preflight: PostgreSQL + migrations

From `backend/` with the venv python:

```bash
cd backend
d:/openLearnquest/venv/Scripts/python.exe -c "from app.database import engine; engine.connect(); print('DB OK')"
```

- If this fails, PostgreSQL isn't running or `backend/.env` `DATABASE_URL` is wrong — report it and stop; don't start servers against a dead DB.
- Then apply any pending migrations: `d:/openLearnquest/venv/Scripts/alembic upgrade head` (idempotent, safe to always run).

## 3. Start the servers (background)

Run each as a background task so they persist across turns:

```bash
# backend — MUST be from backend/, MUST be port 8001
cd backend && d:/openLearnquest/venv/Scripts/uvicorn main:app --reload --port 8001
```

```bash
# frontend
cd frontend && npm run dev
```

## 4. Verify

- Backend: `curl -s http://localhost:8001/health` returns `{"status":"ok"}` (retry a few seconds for startup).
- Frontend: `http://localhost:5173` returns 200. Confirm `frontend/.env` has `VITE_API_URL=http://localhost:8001` — a stale port here silently breaks all API calls (there is no Vite proxy).

Report both URLs to the user when healthy. If a server fails to start, show its actual startup error output — don't just retry.

## Optional: reset user data

Only when the user explicitly asks for a data reset (destructive — wipes user progress):

```bash
d:/openLearnquest/venv/Scripts/python.exe backend/clear_user_data.py --apply
```
