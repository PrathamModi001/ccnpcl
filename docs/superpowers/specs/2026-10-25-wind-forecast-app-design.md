# Day-Ahead Wind Forecast Accuracy App — Design

## Intent and why

A UK energy utility's day-ahead trading desk buys power one day before delivery, before they know how much wind will actually blow. They currently have to reason about forecast risk informally. This app gives them two things in one place: the forecast they'd actually have seen at decision time, and a quantified, honest picture of how wrong that forecast has historically been — so the "extra buffer to buy" becomes a number instead of a gut feeling.

This is a take-home technical challenge, not a real client engagement — but it's being built and evaluated as if it were one, including a pitch video to an "evaluator client" and a tech walkthrough to an "evaluator reviewer." The brief intentionally restricts scope to two Elexon datasets (`FUELHH` wind actuals, `WINDFOR` wind forecasts) for January 2026 only, no other data. Every submitter has access to similar AI tooling, so the standard to beat is not "did they finish the checklist" but "does this reflect real understanding of how the market and the data actually behave, and does it look and feel deliberately made rather than default-generated."

## Goals

- Show, for any hour in January 2026, the forecast that was actually available at the day-ahead decision point — not just "the latest forecast on file."
- Quantify forecast error with metrics a trader would actually use to size a buffer (MAE, RMSE, bias, P90 absolute error, error as % of mean generation), broken down by hour-of-delivery.
- Turn historical error into an actionable number: an empirical-quantile risk band around the current forecast, expressed in MW, honestly labeled as based on one in-sample month.
- Be demonstrably correct about market mechanics most people will hand-wave (decision cutoff timing, forecast "leakage," lead-time variability) — this is the main differentiator.
- Ship something that looks deliberately designed, not like a default AI-scaffolded dashboard.

## Non-goals

- No live polling of the Elexon API in production — January 2026 is already historical, so the dataset is pre-fetched once and bundled.
- No demand/load data or "how much to buy in total" calculation — out of the stated data scope.
- No multi-region/zonal breakdown — national totals only, as given.
- No user accounts, auth, or multi-tenant anything — single-purpose internal tool.
- No real-time alerting, notifications, or scheduling integrations.

## Anti-goals (would be failures even if technically working)

- A generic line-chart dashboard that doesn't model the actual decision cutoff (i.e., just shows "latest forecast vs actual" without regard to when that forecast was actually published relative to when a trader would have needed it).
- Any feature that reaches outside the two named Elexon datasets for Jan 2026 — including synthetic/illustrative demand data, even clearly labeled. This was explicitly ruled out: the brief says "no other data beyond this," and even an illustrative overlay invites a scope objection.
- UI that reads as default shadcn/Tailwind/Bootstrap-template AI output.
- Overstating forecast reliability — the risk band must be honestly labeled as empirical/in-sample/one-month, not presented as a calibrated statistical model.

## Constraints

- Frontend: React. Backend: Python. Must run via Docker locally. Must be deployed (Vercel or Heroku). ≤16 hours of build time (soft budget — respect it by not over-building, even though it isn't literally billed). AI tool usage must be disclosed in the README.
- Data: only `FUELHH` (fuelType=WIND) and `WINDFOR` from Elexon, only January 2026.
- Deliverables: working deployed app; public GitHub repo with an anonymized random-string name; README (file/dir layout, run instructions, deploy link, AI-disclosure); a single video ≤10 minutes total, in two ≤5-minute parts (client pitch, then tech walkthrough). The form is not to be submitted by Claude.

## Verified data facts (all independently confirmed live against the API, see `[[wind-forecast-assignment]]` memory for the raw numbers — not reproduced in full here, just what drives design)

- No API key required. `WINDFOR` query params: `publishDateTimeFrom`/`To` only. `FUELHH`: `settlementDateFrom/To`, `publishDateTimeFrom/To`, `settlementPeriod`, `fuelType` — settlement-date and publish-date filters can't be combined in one call.
- `WINDFOR` is **hourly** (not half-hourly as the brief implies), published in exactly 8 snapshots/day (02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC). One real anomaly in the month: the Jan 15 11:30 snapshot was actually published at 12:25 — the ingestion/analysis code must not assume a fixed publish grid.
- `FUELHH` is genuinely half-hourly (48 settlement periods/day), 1,488 rows for the full month, no gaps, no duplicates — treated as ground truth.
- Earliest available forecast for any January target arrives 43.5–66.5h (median 55.5h) ahead. Some forecast rows are published *after* their own target hour ("leakage," up to 3,697 such rows in the full pulled range, lagging as much as 25.5h) — these must be excluded when selecting "the forecast available at decision time."
- Any day-ahead decision cutoff between 09:00–12:00 UTC on day D-1 selects the same forecast snapshot and yields zero missing hourly forecasts across all 744 January target-hours — so the exact published gate-closure time doesn't change outcomes here. Resulting decision horizon: 14.5–37.5h ahead (median 26h).

## Architecture

```
/data-pipeline      one-off Python script: pulls FUELHH + WINDFOR for Jan 2026 (+ a Dec-29 lookback
                     for WINDFOR so early-January decisions have a valid prior-day snapshot),
                     computes the decision-time forecast per hour, computes error metrics,
                     writes a single static JSON (or SQLite) artifact checked into the repo.
/backend            FastAPI app, read-only endpoints over the precomputed artifact:
                       GET /api/day?date=YYYY-MM-DD&cutoff=HH:MM
                            -> all 24 hours for that day: actual, decision-time forecast,
                               and risk-band low/high (one batch call drives the whole chart,
                               ribbon included — not 24 separate lookups)
                       GET /api/accuracy?cutoff=HH:MM
                            -> month-wide headline metrics (MAE/RMSE/bias/P90/%error) plus the
                               error-by-hour-of-delivery array, for the selected cutoff
                     `cutoff` snaps to the 8 real WINDFOR publish times (02:30...22:30 UTC) — see
                     "Cutoff is an interactive control" below. Deployed as its own Vercel project
                     (root directory `backend`): a single FastAPI app with normal routes, which
                     Vercel auto-detects with zero config — no separate `api/` folder of per-endpoint
                     files, no `vercel.json` rewrites (data is static+small, no DB needed).
/frontend           React app (Vite). One main view: a date selector + cutoff slider driving a
                     single chart — hourly actual vs. decision-time forecast, with the risk-band
                     ribbon across all 24 hours (from one /api/day call). Selecting a day also
                     overlays that day's actual signed errors as points on the accuracy panel's
                     error-by-hour-of-delivery chart (from /api/accuracy) — the headline MAE/RMSE/
                     bias/P90 numbers themselves stay month-wide; a single day only ever has one
                     sample per hour, so a "per-day MAE" would be statistically meaningless and is
                     deliberately not computed. A secondary "how this works" panel documents the
                     decision-cutoff logic and data caveats inline, so the pitch and the tech review
                     can both point at the running app. Deployed as its own Vercel project (root directory
                     `frontend`), auto-detected zero-config Vite build.
docker-compose.yml  runs backend (uvicorn) + frontend (vite dev) locally for development/review;
                     not the deployed path (Vercel doesn't run containers), but required by the brief
                     and useful for the tech-lead reviewer to run it themselves.
README.md           file/dir layout, run instructions (docker compose + Vercel link), AI-tool disclosure.
```

### Decision-time forecast logic (the core correctness point)
For a given cutoff time (default 11:00 UTC, configurable, explicitly labeled in the README as "a reasonable default, not verified against a primary source for the real N2EX/EPEX gate closure time"):
1. For target day D, look at day D-1.
2. Among all `WINDFOR` rows with `publishTime <= D-1 cutoff` AND `publishTime <= startTime` (excluding leaked/post-hoc rows), take the one with the latest `publishTime` for each hour of D.
3. That per-hour value is "the forecast available for the decision." This is what's shown as *the* forecast, and what's compared against the `FUELHH` actual (averaging the two half-hourly actuals per hour, documented as such).

### Cutoff is an interactive control, not just a backend parameter
The slider/selector exposes exactly the 8 real `WINDFOR` publish times as cutoff options (not a continuous 09:00–12:00 range). This does two things at once instead of needing a separate feature: (a) it's the "prove the robustness yourself" interaction for the pitch — moving the cutoff between 09:30 and 11:30 visibly changes nothing, which is the point; (b) moving it further back (e.g. to 02:30 or 04:30 the same D-1) or forward (15:30/18:30/22:30, still D-1, still "one day ahead") *does* change the forecast and error, which is exactly the lead-time-sensitivity study the design already decided not to build as a separate page ("the cutoff slider already covers it"). Every cutoff choice still represents a decision made on D-1 for delivery on D, so it stays inside the "day-ahead" framing.

### Risk band logic (signature feature)
Bucketed by **hour-of-delivery only** (24 buckets, ~31 samples each) for the currently selected cutoff — not a separate hour-of-delivery × horizon cross-tab. At a fixed cutoff, horizon is already a deterministic function of hour-of-delivery, so a second bucketing dimension would only fragment an already-thin 31-sample month into unreliable slivers; moving the cutoff slider is how horizon sensitivity gets explored instead. Take the empirical distribution of (actual − decision-time-forecast) across all of January for that bucket, and report the forecast ± the empirical 5th/95th percentile error as the displayed band. Label it: "based on 31 days, in-sample — illustrative of forecast risk, not a calibrated probabilistic model."

## Metrics specification
- Headline (whole month, and selectable per-day): MAE, RMSE, mean bias (signed), P90 absolute error.
- Error normalized as % of mean generation for the period (avoids MAPE blowing up near-zero generation hours).
- Error-by-hour-of-delivery breakdown (0–23h), since horizon varies across a day's targets — this substitutes for a separate lead-time study.

## Standing out — concrete plan (not vague aspiration)
1. **Domain correctness as the pitch's spine**: the Part 1 video explicitly calls out the leakage/cutoff-robustness/snapshot-anomaly findings as "we didn't just chart your data, we understood it" — this is the single biggest differentiator versus a generic submission.
2. **UI that doesn't look AI-templated**: use a deliberate, non-default visual system (specific typography/color choices made at build time, not a stock component-library look) — frontend-design skill to be invoked during implementation, not left to framework defaults.
3. **The risk band as the signature feature** — turns "we measured accuracy" into "here's what to actually buy," the one thing a trader would want that a plain forecast-vs-actual chart doesn't give them.
4. Keep the whole thing scoped tightly — no feature exists that isn't traceable to one of the two stated purposes in the brief. Discipline, not breadth, is the differentiator.

## What's left to the builder
- Exact color palette / typography / visual direction for the frontend (to be decided during implementation via a frontend-design pass, not pre-specified here).
- Exact chart library choice (e.g. Recharts vs Observable Plot vs D3) — pick whatever best serves "not generic" and the risk-band visualization.
- Exact FastAPI project layout / module boundaries.
- Anonymous repo name (to be generated at repo-creation time).
- Video script/storyboard detail (to be written as a separate artifact once the app exists, not pre-written here).
