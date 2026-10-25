# Day-Ahead Wind Forecast Accuracy App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a React + FastAPI web app that shows, for any hour in January 2026, the wind forecast actually available at the day-ahead decision point, plus quantified historical forecast accuracy and an empirical risk band.

**Architecture:** A one-off Python pipeline fetches Elexon `FUELHH`/`WINDFOR` data for Jan 2026 (+ a Dec-29 lookback) and precomputes, for each of 8 real decision-cutoff times, the decision-time forecast, actual, metrics, and risk band per hour — written once to a committed static JSON artifact. A thin FastAPI backend serves two read-only endpoints over that artifact (no live Elexon calls at runtime). A React (Vite) frontend renders one main view: a date + cutoff selector driving a day chart with an actual-vs-forecast ribbon, and an accuracy panel. Backend and frontend deploy as two separate zero-config Vercel projects from the same repo; Docker Compose runs both locally for development and reviewer verification.

**Tech Stack:** Python 3.12 (FastAPI, pytest), Node/React (Vite, TypeScript, Vitest), Docker Compose, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-25-wind-forecast-app-design.md`

## Global Constraints

- Frontend: React (Vite, TypeScript). Backend: Python (FastAPI).
- Docker Compose required for local runs; deployed app lives on Vercel (not Heroku — no free tier anymore).
- Only `FUELHH` (fuelType=WIND) and `WINDFOR` Elexon datasets, January 2026 only, plus a Dec-29–31 `WINDFOR` lookback strictly to cover early-January decisions (same dataset, earlier publish dates — not a scope violation).
- No live Elexon calls at runtime — one precomputed static JSON artifact, committed to the repo, is the only data source the running app reads.
- No demand data, no synthetic/illustrative data of any kind, no auth/accounts, no live polling/alerting, national totals only (no zonal breakdown).
- Decision cutoff is restricted to the 8 real `WINDFOR` publish times: `02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30` (UTC).
- `WINDFOR` rows with `publishTime > startTime` ("leakage") must be excluded when selecting the decision-time forecast.
- Metrics: MAE, RMSE, mean bias, P90 absolute error, error as % of **mean** generation (not per-point MAPE), error-by-hour-of-delivery (24 buckets, one per hour 0–23).
- Risk band: empirical 5th/95th percentile of (actual − decision-forecast), bucketed by hour-of-delivery only (never hour × horizon), labeled "based on 31 days, in-sample — illustrative of forecast risk, not a calibrated probabilistic model."
- Headline accuracy metrics are always month-wide for the selected cutoff; never recomputed for a single day (n=1 per hour is statistically meaningless).
- AI tool usage must be disclosed explicitly in the README.
- Repo gets an anonymous random-string name; only push to GitHub with an explicit user-supplied username and go-ahead.

## Review Focus

- **Leakage rows corrupting the signature feature** — a `WINDFOR` row with `publishTime > startTime` picked as "the decision forecast" would silently misrepresent what a trader could have known. Covered in Task 3's `select_decision_forecast` tests.
- **Off-grid publish times** (the real Jan-15 anomaly: 11:30 snapshot published at 12:25) — code that assumes publish times land exactly on the 8-slot grid could skip or crash on that day. Covered in Task 3's tests with an off-grid fixture row.
- **Early-January decisions with no prior-day snapshot** (Jan 1's decision is made Dec 31) — if the pipeline only pulls Jan-dated publishes, Jan 1–2 would have null forecasts for some hours. Covered in Task 4's dataset-build test asserting Jan 1 has a non-null forecast for all 24 hours.
- **Division/aggregation on zero-or-near-zero-generation hours** — the spec specifically chose "% of mean generation" over per-point MAPE to avoid this; a naive implementation could still divide per-point. Covered in Task 4's metrics test with a zero-generation fixture hour.
- **Out-of-range or malformed date/cutoff requests** (e.g. a frontend bug requesting Feb 1, or an invalid cutoff string) — API must return a defined 404/400, never a 500. Covered in Task 5's API tests.

---

## File Structure

```
pipeline/
  build_dataset.py       # pure logic: decision-forecast selection, metrics, risk bands, dataset assembly
  fetch_elexon.py         # thin network script: pulls FUELHH + WINDFOR, writes pipeline/raw/*.json
  raw/                    # gitignored; populated by fetch_elexon.py
  tests/
    fixtures.py           # small hand-built FUELHH/WINDFOR row fixtures (leakage, off-grid, zero-gen, Jan-1 lookback)
    test_build_dataset.py

backend/
  app/
    main.py                # FastAPI app, CORS, routes
    data_access.py          # loads dataset.json, serves get_day/get_accuracy/get_meta
    data/dataset.json        # generated artifact (committed)
  requirements.txt
  Dockerfile
  tests/
    test_data_access.py
    test_api.py

frontend/
  src/
    api.ts                 # fetch wrapper + response types
    lib/format.ts            # MW/date formatting helpers
    components/
      DateCutoffControls.tsx
      DayChart.tsx
      AccuracyPanel.tsx
      HowThisWorksPanel.tsx
    App.tsx
    App.test.tsx (or per-component tests, Vitest)
  package.json / vite.config.ts / Dockerfile

docker-compose.yml
README.md
.gitignore
```

---

### Task 1: Repo scaffolding

**Files:**
- Create: `.gitignore`, `README.md` (stub), empty dirs per File Structure above (`pipeline/`, `pipeline/raw/.gitkeep`, `backend/app/data/.gitkeep`, `frontend/`)

**Interfaces:**
- Produces: the directory layout every later task writes into.

- [ ] **Step 1: `git init` the repo** (if not already a repo)

Run: `git -C /home/modi/Work/check init`

- [ ] **Step 2: Create `.gitignore`**

Cover: `pipeline/raw/`, `node_modules/`, `__pycache__/`, `*.pyc`, `.venv/`, `dist/`, `.vercel/`, `.env*`

- [ ] **Step 3: Create the directory skeleton and placeholder files listed above**

- [ ] **Step 4: Write a README stub** with just a title and a "Work in progress" note (full content comes in Task 11)

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: scaffold repo structure"
```

---

### Task 2: Elexon fetch script

**Files:**
- Create: `pipeline/fetch_elexon.py`

**Interfaces:**
- Produces: `pipeline/raw/fuelhh_jan2026.json` (list of FUELHH row dicts, fuelType=WIND, settlementDateFrom=2026-01-01 to settlementDateTo=2026-01-31) and `pipeline/raw/windfor.json` (list of WINDFOR row dicts, publishDateTimeFrom=2025-12-29T00:00:00Z to publishDateTimeTo=2026-02-01T00:00:00Z). Task 3/4 read these two files by exact path.

This script only calls the two whitelisted Elexon endpoints (`FUELHH`, `WINDFOR` `stream` routes) — no other dataset, per Global Constraints.

- [ ] **Step 1: Implement `fetch_fuelhh() -> list[dict]` and `fetch_windfor() -> list[dict]` in `pipeline/fetch_elexon.py`**

Each does a single GET via `requests` (or `urllib`) to `https://data.elexon.co.uk/bmrs/api/v1/datasets/{FUELHH|WINDFOR}/stream` with the exact query params above, raises on non-200, returns the parsed JSON list.

- [ ] **Step 2: Implement `if __name__ == "__main__":` to call both and write the two files under `pipeline/raw/`**

- [ ] **Step 3: Run it for real and verify the two files exist with the expected row counts**

Run: `python pipeline/fetch_elexon.py && python -c "import json; print(len(json.load(open('pipeline/raw/fuelhh_jan2026.json'))), len(json.load(open('pipeline/raw/windfor.json'))))"`
Expected: `1488 19856` (counts verified live against the API during design)

- [ ] **Step 4: Commit the script only (raw/ is gitignored)**

```bash
git add pipeline/fetch_elexon.py
git commit -m "feat: add Elexon fetch script for FUELHH and WINDFOR"
```

---

### Task 3: Decision-forecast selection logic

**Files:**
- Create: `pipeline/build_dataset.py` (this task owns `select_decision_forecast` and `hourly_actual`; Task 4 adds the rest of the module)
- Create: `pipeline/tests/fixtures.py`
- Test: `pipeline/tests/test_build_dataset.py`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure logic over plain dicts/lists).
- Produces:
  - `CUTOFF_TIMES: list[str]` = `["02:30","04:30","07:30","09:30","11:30","15:30","18:30","22:30"]`
  - `select_decision_forecast(windfor_rows: list[dict], target_hour_iso: str, cutoff_iso: str) -> float | None`
  - `hourly_actual(fuelhh_rows: list[dict], target_hour_iso: str) -> float | None`
  - Row dict shape: WINDFOR `{"publishTime": str, "startTime": str, "generation": float}`; FUELHH `{"startTime": str, "generation": float}` (ISO 8601 UTC strings throughout, e.g. `"2026-01-05T09:00:00Z"`).

- [ ] **Step 1: Write `pipeline/tests/fixtures.py`** with small hand-built row lists: a handful of WINDFOR rows for one target hour including (a) a normal pre-cutoff row, (b) a leaked row (`publishTime > startTime`), (c) an off-grid publish time (e.g. `"2026-01-15T12:25:00Z"` standing in for the real anomaly), and matching FUELHH half-hour pairs including one zero-generation hour.

- [ ] **Step 2: Write failing tests in `pipeline/tests/test_build_dataset.py`**

```python
def test_excludes_leaked_rows():
    result = select_decision_forecast(fixtures.WINDFOR_WITH_LEAK, "2026-01-05T09:00:00Z", "2026-01-04T11:30:00Z")
    assert result == fixtures.EXPECTED_NON_LEAKED_VALUE

def test_picks_latest_eligible_publish_including_off_grid():
    result = select_decision_forecast(fixtures.WINDFOR_OFF_GRID, "2026-01-15T13:00:00Z", "2026-01-15T12:30:00Z")
    assert result == fixtures.EXPECTED_OFF_GRID_VALUE

def test_hourly_actual_averages_half_hours():
    result = hourly_actual(fixtures.FUELHH_PAIR, "2026-01-05T09:00:00Z")
    assert result == fixtures.EXPECTED_HOURLY_AVERAGE

def test_hourly_actual_handles_zero_generation():
    result = hourly_actual(fixtures.FUELHH_ZERO_HOUR, "2026-01-28T15:00:00Z")
    assert result == 0.0
```

- [ ] **Step 3: Run tests, verify they fail with `NameError`/`ImportError`**

Run: `pytest pipeline/tests/test_build_dataset.py -v`
Expected: FAIL (functions not defined)

- [ ] **Step 4: Implement `select_decision_forecast` and `hourly_actual` in `pipeline/build_dataset.py`**

`select_decision_forecast`: filter `windfor_rows` to `startTime == target_hour_iso AND publishTime <= cutoff_iso AND publishTime <= startTime`; among survivors return the `generation` of the max-`publishTime` row, else `None`. `hourly_actual`: find the two `fuelhh_rows` with `startTime == target_hour_iso` and `startTime == target_hour_iso + 30min`, return their mean, else `None`.

- [ ] **Step 5: Run tests, verify they pass**

Run: `pytest pipeline/tests/test_build_dataset.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add pipeline/build_dataset.py pipeline/tests/
git commit -m "feat: add decision-forecast selection and hourly-actual logic"
```

---

### Task 4: Metrics, risk bands, and dataset assembly

**Files:**
- Modify: `pipeline/build_dataset.py` (add to the module from Task 3)
- Test: `pipeline/tests/test_build_dataset.py` (add to it)

**Interfaces:**
- Consumes: `CUTOFF_TIMES`, `select_decision_forecast`, `hourly_actual` from Task 3.
- Produces:
  - `build_day_records(fuelhh_rows, windfor_rows, dates: list[str], cutoff_time: str) -> list[dict]` — each record `{"date": str, "hour": int, "actual": float|None, "forecast": float|None}`.
  - `compute_metrics(records: list[dict]) -> dict` — `{"mae": float, "rmse": float, "bias": float, "p90_abs_error": float, "pct_of_mean": float, "by_hour": [{"hour": int, "mae": float, "bias": float, "n": int}, ...]}`, computed only over records where both `actual` and `forecast` are not `None`.
  - `compute_risk_band(records: list[dict]) -> dict[int, tuple[float, float]]` — per hour-of-delivery (0–23), the (p5, p95) of `actual - forecast` across all dates in `records` for that hour.
  - `build_dataset(fuelhh_rows, windfor_rows, dates: list[str]) -> dict` — `{"cutoffs": {cutoff_time: {"days": {date: [{"hour","actual","forecast"}...]}, "accuracy": <compute_metrics output>, "risk_band": {str(hour): [p5, p95]}} for cutoff_time in CUTOFF_TIMES}}`.
  - Used by Task 5's backend loader, which expects exactly this JSON shape once serialized.

- [ ] **Step 1: Write failing tests**

```python
def test_build_day_records_jan1_has_full_coverage_from_lookback():
    records = build_day_records(fixtures.FUELHH_JAN, fixtures.WINDFOR_WITH_LOOKBACK, ["2026-01-01"], "11:30")
    assert len(records) == 24
    assert all(r["forecast"] is not None for r in records)

def test_compute_metrics_uses_pct_of_mean_not_per_point_mape():
    records = fixtures.RECORDS_WITH_ZERO_GENERATION_HOUR
    metrics = compute_metrics(records)
    assert metrics["pct_of_mean"] == pytest.approx(fixtures.EXPECTED_PCT_OF_MEAN)

def test_compute_risk_band_buckets_by_hour_only():
    band = compute_risk_band(fixtures.RECORDS_TWO_HOURS_MULTIPLE_DAYS)
    assert set(band.keys()) == {h for r in fixtures.RECORDS_TWO_HOURS_MULTIPLE_DAYS for h in [r["hour"]]}

def test_build_dataset_has_all_eight_cutoffs():
    dataset = build_dataset(fixtures.FUELHH_JAN, fixtures.WINDFOR_WITH_LOOKBACK, ["2026-01-01", "2026-01-02"])
    assert set(dataset["cutoffs"].keys()) == set(CUTOFF_TIMES)
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pytest pipeline/tests/test_build_dataset.py -v`
Expected: FAIL (functions not defined)

- [ ] **Step 3: Implement `build_day_records`, `compute_metrics`, `compute_risk_band`, `build_dataset`**

`pct_of_mean` = `mae / mean(actuals) * 100` using the whole record set's mean actual as a single constant denominator (not per-point). `p90_abs_error` via a straightforward percentile over absolute errors. Risk band percentiles via linear-interpolation percentile (e.g. `statistics.quantiles` or manual sort+index) — document the interpolation choice as a one-line comment where it's computed.

- [ ] **Step 4: Run tests, verify they pass**

Run: `pytest pipeline/tests/test_build_dataset.py -v`
Expected: PASS

- [ ] **Step 5: Add the CLI entrypoint**

`if __name__ == "__main__":` reads `pipeline/raw/fuelhh_jan2026.json` and `pipeline/raw/windfor.json`, calls `build_dataset(..., dates=["2026-01-01", ..., "2026-01-31"])`, writes the result to `backend/app/data/dataset.json` (pretty-printed JSON).

- [ ] **Step 6: Run the real pipeline end-to-end and sanity-check the artifact**

Run: `python pipeline/build_dataset.py && python -c "import json; d=json.load(open('backend/app/data/dataset.json')); print(list(d['cutoffs'].keys()), len(d['cutoffs']['11:30']['days']))"`
Expected: all 8 cutoff times printed, `31` days under `"11:30"`.

- [ ] **Step 7: Commit (including the generated `dataset.json` artifact — it's meant to be committed, per the spec's "pre-fetch once, bundle" decision)**

```bash
git add pipeline/build_dataset.py pipeline/tests/ backend/app/data/dataset.json
git commit -m "feat: compute metrics, risk bands, and assemble the full dataset artifact"
```

---

### Task 5: Backend data access + API

**Files:**
- Create: `backend/app/data_access.py`
- Create: `backend/app/main.py`
- Create: `backend/requirements.txt`
- Test: `backend/tests/test_data_access.py`
- Test: `backend/tests/test_api.py`

**Interfaces:**
- Consumes: `backend/app/data/dataset.json` written by Task 4, with the exact shape `build_dataset` produces.
- Produces:
  - `data_access.load_dataset() -> dict` (cached)
  - `data_access.get_day(date: str, cutoff: str) -> dict | None` — `{"date": str, "cutoff": str, "hours": [{"hour": int, "actual": float|None, "forecast": float|None, "risk_low": float|None, "risk_high": float|None}, ...]}`, `None` if `date` not in the dataset's days or `cutoff` not in `CUTOFF_TIMES`. `risk_low`/`risk_high` are the band **around that hour's forecast**: `forecast + risk_band[str(hour)][0]` and `forecast + risk_band[str(hour)][1]` (the stored values are signed `actual - forecast` percentiles, so they can shift the band below or above the raw forecast); `None` when `forecast` is `None`.
  - `data_access.get_accuracy(cutoff: str) -> dict | None` — the `accuracy` block for that cutoff, `None` if invalid cutoff.
  - `data_access.get_meta() -> dict` — `{"dates": sorted list of all dates in the dataset, "cutoffs": CUTOFF_TIMES}` (frontend uses this to populate pickers instead of hardcoding Jan 2026).
  - FastAPI routes on `app` (exported from `backend/app/main.py`): `GET /api/day?date=&cutoff=`, `GET /api/accuracy?cutoff=`, `GET /api/meta` — each returning the corresponding function's result as JSON, or `404 {"error": "..."}` when the function returns `None`.

- [ ] **Step 1: Write failing tests for `data_access`**

```python
def test_get_day_returns_24_hours_with_risk_band():
    result = data_access.get_day("2026-01-05", "11:30")
    assert len(result["hours"]) == 24
    assert all("risk_low" in h and "risk_high" in h for h in result["hours"])

def test_get_day_out_of_range_date_returns_none():
    assert data_access.get_day("2026-02-01", "11:30") is None

def test_get_day_invalid_cutoff_returns_none():
    assert data_access.get_day("2026-01-05", "13:00") is None

def test_get_accuracy_returns_month_wide_metrics():
    result = data_access.get_accuracy("11:30")
    assert "mae" in result and "by_hour" in result and len(result["by_hour"]) == 24
```

- [ ] **Step 2: Run, verify failure**

Run: `pytest backend/tests/test_data_access.py -v`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `backend/app/data_access.py`** against the real `backend/app/data/dataset.json` artifact from Task 4, with `load_dataset` using `functools.lru_cache`.

- [ ] **Step 4: Run, verify pass**

Run: `pytest backend/tests/test_data_access.py -v`
Expected: PASS

- [ ] **Step 5: Write failing API tests using FastAPI's `TestClient`**

```python
def test_day_endpoint_happy_path(client):
    r = client.get("/api/day", params={"date": "2026-01-05", "cutoff": "11:30"})
    assert r.status_code == 200 and len(r.json()["hours"]) == 24

def test_day_endpoint_out_of_range_returns_404(client):
    r = client.get("/api/day", params={"date": "2026-02-01", "cutoff": "11:30"})
    assert r.status_code == 404

def test_accuracy_endpoint_invalid_cutoff_returns_404(client):
    r = client.get("/api/accuracy", params={"cutoff": "13:00"})
    assert r.status_code == 404

def test_meta_endpoint_lists_cutoffs(client):
    r = client.get("/api/meta")
    assert r.json()["cutoffs"] == data_access.CUTOFF_TIMES
```

- [ ] **Step 6: Run, verify failure**

Run: `pytest backend/tests/test_api.py -v`
Expected: FAIL

- [ ] **Step 7: Implement `backend/app/main.py`**

`app = FastAPI()`, `CORSMiddleware` with `allow_origins=["*"]` (no auth, no sensitive data — acceptable for this scope), three routes as specified above, each catching the `None` case and returning `JSONResponse(status_code=404, content={"error": "not found"})`.

- [ ] **Step 8: Write `backend/requirements.txt`**: `fastapi`, `uvicorn`, `pytest`, `httpx` (TestClient dependency).

- [ ] **Step 9: Run, verify pass**

Run: `pytest backend/tests/ -v`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/app/data_access.py backend/app/main.py backend/requirements.txt backend/tests/
git commit -m "feat: add backend data access layer and FastAPI endpoints"
```

---

### Task 6: Backend Docker + Compose wiring

**Files:**
- Create: `backend/Dockerfile`
- Create: `docker-compose.yml` (backend service only for this task; Task 10 adds frontend)

**Interfaces:**
- Consumes: `backend/app/main.py`'s `app` object (Task 5).
- Produces: a running container serving the API on `localhost:8000`, which Task 10's frontend container will call.

- [ ] **Step 1: Write `backend/Dockerfile`**: `python:3.12-slim` base, copy `requirements.txt`, `pip install`, copy `app/`, `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`.

- [ ] **Step 2: Write `docker-compose.yml`** with a `backend` service building `./backend`, mapping port `8000:8000`.

- [ ] **Step 3: Build and run, verify the API responds**

Run: `docker compose up -d backend && sleep 2 && curl -s localhost:8000/api/meta`
Expected: JSON with `"cutoffs"` listing all 8 times.

- [ ] **Step 4: Tear down and commit**

```bash
docker compose down
git add backend/Dockerfile docker-compose.yml
git commit -m "chore: dockerize backend service"
```

---

### Task 7: Frontend scaffold, API client, formatting helpers

**Files:**
- Create: Vite React+TS scaffold under `frontend/` (`package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx` placeholder)
- Create: `frontend/src/api.ts`
- Create: `frontend/src/lib/format.ts`
- Test: `frontend/src/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `formatMW(value: number): string` (e.g. `12345` → `"12.3 GW"` or similar — exact display convention is the builder's call, just must be consistent and tested)
  - `formatDate(iso: string): string`
  - `api.ts` types: `DayResponse = { date: string; cutoff: string; hours: { hour: number; actual: number | null; forecast: number | null; risk_low: number | null; risk_high: number | null }[] }`, `AccuracyResponse = { mae: number; rmse: number; bias: number; p90_abs_error: number; pct_of_mean: number; by_hour: { hour: number; mae: number; bias: number; n: number }[] }`, `MetaResponse = { dates: string[]; cutoffs: string[] }`
  - `fetchMeta(): Promise<MetaResponse>`, `fetchDay(date: string, cutoff: string): Promise<DayResponse>`, `fetchAccuracy(cutoff: string): Promise<AccuracyResponse>` — each a thin `fetch(...)` against `import.meta.env.VITE_API_BASE`, throwing on non-2xx.
  - Later tasks (8, 9) import these types and functions from `./api` and the helpers from `./lib/format`.

- [ ] **Step 1: Scaffold the Vite project**

Run: `npm create vite@latest frontend -- --template react-ts` (or equivalent non-interactive invocation), then `cd frontend && npm install vitest -D`

Before Tasks 8–9 build on this scaffold, make the deliberate visual-system choices called for in the design doc's "standing out" plan (typography, color palette, overall look) — invoke a frontend-design skill for this if one is available, rather than carrying the default Vite/template look forward.

- [ ] **Step 2: Write failing tests in `frontend/src/lib/format.test.ts`**

```ts
test("formatMW renders a human-readable MW value", () => {
  expect(formatMW(12345)).toBe(/* exact expected string the builder picks and documents */);
});
test("formatDate renders an ISO date readably", () => {
  expect(formatDate("2026-01-05")).toBe(/* exact expected string */);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm --prefix frontend run test -- format.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `frontend/src/lib/format.ts`** and update the tests' expected strings to match the convention chosen (pick one, document it in a one-line comment, move on).

- [ ] **Step 4: Implement `frontend/src/api.ts`** with the types and three fetch functions above.

- [ ] **Step 5: Run, verify pass**

Run: `npm --prefix frontend run test -- format.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold frontend, add API client and formatting helpers"
```

---

### Task 8: Day chart + date/cutoff controls

**Files:**
- Create: `frontend/src/components/DateCutoffControls.tsx`
- Create: `frontend/src/components/DayChart.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `fetchMeta`, `fetchDay`, `DayResponse`, `MetaResponse` from Task 7's `api.ts`; `formatMW`, `formatDate` from `lib/format.ts`.
- Produces: `App.tsx` holds `selectedDate`/`selectedCutoff` state, calls `fetchMeta` on mount to populate `DateCutoffControls`, calls `fetchDay` whenever selection changes, passes the result into `DayChart`.
- `DateCutoffControls` props: `{ dates: string[]; cutoffs: string[]; selectedDate: string; selectedCutoff: string; onDateChange: (d: string) => void; onCutoffChange: (c: string) => void }`.
- `DayChart` props: `{ hours: DayResponse["hours"] }` — renders actual vs. decision-forecast lines plus the risk-band ribbon (`risk_low`/`risk_high`) across all 24 hours, using whichever chart library the builder picks (Recharts, Observable Plot, etc. — left to the builder per spec).

- [ ] **Step 1: Implement `DateCutoffControls.tsx`** — a date `<select>` (or date picker) over `dates`, and a cutoff `<select>` over `cutoffs`, calling the respective `onChange` props.

- [ ] **Step 2: Implement `DayChart.tsx`** — a line/area chart: actual and forecast as lines, risk band as a shaded area between `risk_low` and `risk_high`. Hours with `null` actual/forecast (shouldn't occur in-range, but defensively) are skipped rather than plotted as zero.

- [ ] **Step 3: Wire `App.tsx`**: on mount call `fetchMeta`, default `selectedDate` to the first date and `selectedCutoff` to `"11:30"`; on any selection change, call `fetchDay` and pass the result to `DayChart`.

- [ ] **Step 4: Manually verify in the Vite dev server** that changing the date and cutoff updates the chart.

Run: `npm --prefix frontend run dev` and check in a browser.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DateCutoffControls.tsx frontend/src/components/DayChart.tsx frontend/src/App.tsx
git commit -m "feat: add day chart with risk-band ribbon and date/cutoff controls"
```

---

### Task 9: Accuracy panel + how-this-works panel

**Files:**
- Create: `frontend/src/components/AccuracyPanel.tsx`
- Create: `frontend/src/components/HowThisWorksPanel.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `fetchAccuracy`, `AccuracyResponse`, `DayResponse` from `api.ts`; `App.tsx`'s existing `selectedCutoff` state and the `DayResponse` already fetched in Task 8.
- Produces: `AccuracyPanel` props `{ accuracy: AccuracyResponse; overlayDay?: DayResponse }` — renders the headline MAE/RMSE/bias/P90/pct_of_mean numbers (always month-wide for `selectedCutoff`) and the error-by-hour-of-delivery chart from `accuracy.by_hour`, with the currently-selected day's per-hour actual errors (`hour.actual - hour.forecast` computed in this component from `overlayDay`, when provided) plotted as overlay points — never as a recomputed headline metric.

- [ ] **Step 1: Implement `AccuracyPanel.tsx`** per the interface above.

- [ ] **Step 2: Implement `HowThisWorksPanel.tsx`** — static content documenting: the decision-cutoff logic, the honest risk-band caveat ("based on 31 days, in-sample..."), and the leakage/off-grid-anomaly findings from the design doc, so the pitch and tech review can point straight at the running app.

- [ ] **Step 3: Wire into `App.tsx`**: fetch accuracy whenever `selectedCutoff` changes, render `AccuracyPanel` alongside `DayChart`, and render `HowThisWorksPanel` below both.

- [ ] **Step 4: Manually verify**: changing the cutoff updates the accuracy panel; changing the date updates the overlay points without changing the headline numbers.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AccuracyPanel.tsx frontend/src/components/HowThisWorksPanel.tsx frontend/src/App.tsx
git commit -m "feat: add accuracy panel with day-overlay and how-this-works panel"
```

---

### Task 10: Frontend Docker + full Compose wiring

**Files:**
- Create: `frontend/Dockerfile`
- Modify: `docker-compose.yml` (add `frontend` service)

**Interfaces:**
- Consumes: the `backend` service from Task 6 (via `VITE_API_BASE` pointing at it).

- [ ] **Step 1: Write `frontend/Dockerfile`**: `node:20-slim` base, `npm ci`, `CMD ["npm", "run", "dev", "--", "--host"]`.

- [ ] **Step 2: Add the `frontend` service to `docker-compose.yml`**: builds `./frontend`, maps port `5173:5173`, sets `VITE_API_BASE=http://localhost:8000`, `depends_on: [backend]`.

- [ ] **Step 3: Run the full stack and verify end-to-end**

Run: `docker compose up -d && sleep 3 && curl -sf localhost:5173 >/dev/null && echo OK`
Then open `localhost:5173` in a browser and confirm the chart loads real data.

- [ ] **Step 4: Tear down and commit**

```bash
docker compose down
git add frontend/Dockerfile docker-compose.yml
git commit -m "chore: dockerize frontend and wire full-stack docker compose"
```

---

### Task 11: README + Vercel deployment

**Files:**
- Modify: `README.md` (replace the Task 1 stub with the full contents)
- Create (as needed): Vercel project settings for two projects (`backend` root directory `backend`, `frontend` root directory `frontend`) — configured via the Vercel dashboard/CLI, not repo files, since both are zero-config framework detections per Vercel's FastAPI/Vite support.

**Interfaces:**
- Consumes: the finished `backend/` and `frontend/` from Tasks 1–10.

This task deploys to Vercel and writes the README, but does **not** push the repo to GitHub — per the project's standing decision, pushing (and the anonymous repo name that goes with it) happens only after the user supplies a GitHub username and explicit go-ahead, outside this plan.

- [ ] **Step 1: Deploy the backend as its own Vercel project** (root directory `backend`), note the resulting URL.

- [ ] **Step 2: Set `VITE_API_BASE` to that URL in the frontend Vercel project's environment variables, then deploy the frontend as its own Vercel project** (root directory `frontend`).

- [ ] **Step 3: Verify the deployed frontend loads real data from the deployed backend** (open the Vercel frontend URL, confirm the chart renders).

- [ ] **Step 4: Write the final `README.md`**: directory/file overview (table or tree, one line per top-level item), how to run locally (`docker compose up`), the deployed app link, and an explicit "AI tools used" disclosure section naming what was used and how (per the brief's requirement).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: finalize README with run instructions, deploy link, and AI-tool disclosure"
```

---
