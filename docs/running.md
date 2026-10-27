# Running this project

Everything below assumes a shell at the repo root. Commands are grouped by what you're trying to do.

## 1. Run the app (the common case)

The committed `backend/app/data/dataset.json` already has the full January 2026 dataset baked in —
you do **not** need to touch the pipeline or the Elexon API to run the app.

### Docker Compose (recommended — no local Python/Node setup needed)

```bash
docker compose up --build
```

- Backend: http://localhost:8000 (try `curl http://localhost:8000/api/meta`)
- Frontend: http://localhost:5173

```bash
docker compose down
```

### Without Docker

Backend:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend (in a second terminal):

```bash
cd frontend
npm install
VITE_API_BASE=http://localhost:8000 npm run dev
```

Open http://localhost:5173.

## 2. Run the tests

```bash
# Pipeline + backend (Python)
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt pytest
cd .. && python3 -m pytest pipeline/tests/ backend/tests/ -v

# Frontend (TypeScript/Vitest)
cd frontend
npm install
npm run test        # unit tests
npx tsc -b --noEmit  # type-check
npm run build        # production build
npm run lint          # oxlint
```

## 3. Regenerate the dataset artifact (only if you want fresher/different data)

This re-fetches from the live Elexon API and rebuilds `backend/app/data/dataset.json`. Not required
to run the app — only needed if you're changing the pipeline logic or re-pulling data.

```bash
# 1. Fetch raw FUELHH + WINDFOR rows for Jan 2026 (+ Dec 29-31 lookback) into pipeline/raw/
cd pipeline
pip install requests
python3 fetch_elexon.py

# 2. Rebuild the artifact the backend reads
cd ..
python3 pipeline/build_dataset.py
# -> writes backend/app/data/dataset.json
```

No API key is required for either Elexon endpoint.

## 4. Deploying (Vercel)

Two separate Vercel projects from this one repo, both zero-config:

```bash
# Backend
vercel --cwd backend

# Frontend — set VITE_API_BASE to the backend URL from the step above first,
# either via `vercel env add VITE_API_BASE` or the dashboard, then:
vercel --cwd frontend
```
