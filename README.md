# Day-Ahead Wind Forecast Accuracy

A web app for a UK energy utility's day-ahead trading desk: for any hour in January 2026, it shows
the GB national wind forecast the desk actually had available at the decision point, overlaid with
the metered outturn and an empirical risk band — plus the forecast's quantified historical accuracy,
broken down by hour of delivery and decision cutoff.

Built on two Elexon BMRS datasets only: `FUELHH` (fuelType `WIND`, metered half-hourly actuals) and
`WINDFOR` (hourly forecasts, 8 publishes/day). No other data source, no live data in production —
January 2026 is pre-fetched once and shipped as a static artifact. See
[`docs/technical-overview.md`](docs/technical-overview.md) for the full design rationale and the
market-mechanics findings that drove it.

**Live app:** not yet deployed — see [Deployment](#deployment) below.

## Directory layout

```
pipeline/                   One-off Python data pipeline (not part of the running app)
  fetch_elexon.py             Pulls FUELHH + WINDFOR from the Elexon API, writes pipeline/raw/*.json
  build_dataset.py            Decision-forecast selection, accuracy metrics, risk bands, dataset
                               assembly; also the CLI entrypoint that writes backend/app/data/dataset.json
  tests/                       fixtures.py + test_build_dataset.py — unit tests for the above
  raw/                         gitignored; populated by fetch_elexon.py

backend/                     FastAPI app, read-only over the precomputed dataset
  app/
    main.py                     FastAPI app, CORS, the 3 routes
    data_access.py              Loads dataset.json (cached), exposes get_day/get_accuracy/get_meta
    data/dataset.json           Generated artifact — committed, this is the only data the app reads
  tests/                       test_data_access.py, test_api.py
  requirements.txt
  Dockerfile

frontend/                    React (Vite + TypeScript) single-page app
  src/
    api.ts                       Typed fetch client for the backend's 3 endpoints
    lib/
      format.ts                   MW / date / percent display formatting
      chart.ts                     Pure chart geometry + domain semantics (scales, paths, sign/tone rules)
    hooks/useBoxSize.ts           Responsive SVG sizing
    components/
      DateCutoffControls.tsx       Date + decision-cutoff selectors
      DayChart.tsx                 Signature chart: actual vs. decision forecast + P5–P95 risk band
      AccuracyPanel.tsx            Month-wide MAE/RMSE/bias/P90/%-of-mean + error-by-hour chart
      HowThisWorksPanel.tsx        In-app methodology & caveats copy
    App.tsx                      Page shell, data fetching, state
  Dockerfile

docs/
  technical-overview.md        What's implemented and why — the technical differentiators, written
                                for the tech-lead review
  running.md                   Exact commands to run every part of this project
  video-script-part1-pitch.md        Script for the ≤5-min client-pitch video
  video-script-part2-tech-review.md  Script for the ≤5-min tech-walkthrough video
  superpowers/                 Original design spec and task-by-task implementation plan

docker-compose.yml           Runs backend + frontend locally for development/review
README.md                    This file
```

## Running it

See [`docs/running.md`](docs/running.md) for the exact command for every piece (pipeline, backend,
frontend, Docker, tests). The fast path:

```bash
docker compose up --build
# backend  -> http://localhost:8000
# frontend -> http://localhost:5173
```

The committed `backend/app/data/dataset.json` is the only data source the running app needs — you do
not need an Elexon API call or the pipeline to just run the app.

## Deployment

Designed to deploy as two independent zero-config Vercel projects from this one repo:

- **Backend** — root directory `backend`, Vercel's Python/FastAPI detection, no `vercel.json` needed.
- **Frontend** — root directory `frontend`, Vercel's Vite detection, with `VITE_API_BASE` set to the
  backend's deployed URL.

This has not been done yet for this submission. Docker Compose above is the verified way to run the
full stack today.

## AI tool disclosure

This project was built with [Claude Code](https://claude.com/claude-code) (Anthropic). Claude Code
was used for substantially all of the implementation: the initial domain research against the live
Elexon API, the design spec and task-by-task implementation plan in `docs/superpowers/`, the pipeline
and backend code and their tests, the frontend components and visual design, and this documentation.
Each implementation task was written test-first and code-reviewed before being committed. All product
and architecture decisions (metric choices, risk-band construction, cutoff handling, scope
exclusions) were directed and reviewed by the author, not left to model defaults.
