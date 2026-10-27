# Technical overview

What this app does, how it's built, and — since the brief is open to anyone with the same AI
tooling — specifically what in here reflects real domain understanding rather than a default
AI-scaffolded dashboard. Written for a technical reviewer; see the main [README](../README.md) for
directory layout and run instructions, and
[`docs/superpowers/specs/2026-10-25-wind-forecast-app-design.md`](superpowers/specs/2026-10-25-wind-forecast-app-design.md)
for the original design doc this was built from.

## The question the app actually answers

Not "how good is wind forecasting" — **"what forecast did this desk actually have in front of it at
the moment it had to decide, and how wrong has that specific thing historically been?"** Those are
different questions, and most ways of building this app would accidentally answer the first one
while believing they'd answered the second.

## Status as of this submission

Done: data pipeline, backend API, frontend, Docker Compose, full test suite (18 Python + 62
frontend tests, all passing), README and this documentation.

Not done yet: Vercel deployment, video, GitHub push verification by a third party. See the README's
[Deployment](../README.md#deployment) section.

## Architecture

```
pipeline/  (one-off, offline)         backend/  (always-on, read-only)        frontend/
Elexon FUELHH + WINDFOR  ──fetch──>   dataset.json (committed)  ──serve──>    React SPA
   (Jan 2026 + Dec29-31               GET /api/day                            date + cutoff
    WINDFOR lookback)                 GET /api/accuracy                       controls -> chart
                                       GET /api/meta                          + accuracy panel
```

The pipeline runs once, offline, against the live API; its only output is a static JSON file
checked into the repo. The backend never calls Elexon — it's a cached read over that file. This
was a deliberate scope decision: January 2026 is already historical by the time this is reviewed,
so "real-time" would be fake real-time, and a live dependency would just be a new way for the demo
to break during review.

## What's technically different here (the differentiators)

### 1. Decision-time forecast selection actually excludes leakage

`WINDFOR` snapshots carry forecasts for many hours at once, and a meaningful fraction of rows in
the pulled range (up to ~3,700, lagging by as much as 25.5h) have `publishTime > startTime` — they
were published *after* the hour they claim to forecast. A naive "take whatever WINDFOR says for
this hour, filtered by snapshot date" implementation will silently pull in these rows and make the
forecast look better than anything a trader could have actually acted on.

`select_decision_forecast` (`pipeline/build_dataset.py:38`) filters on both conditions
independently — `publishTime <= cutoff` **and** `publishTime <= startTime` — and is tested against
a fixture row engineered to be eligible-by-cutoff but still leaked
(`pipeline/tests/test_build_dataset.py::test_excludes_leaked_rows`). This is called out in the
plan's own "Review Focus" section as the single highest-risk correctness bug in the whole project.

### 2. No fixed publish-time grid is assumed

`WINDFOR` publishes at 8 nominal times a day (02:30, 04:30, ... 22:30 UTC), and it would be easy to
hard-code that grid into the eligibility check. One real January row breaks that assumption: the
Jan-15 "11:30" snapshot was actually published at 12:25. `select_decision_forecast` never compares
against the nominal grid — it always compares real timestamps — so that day is handled identically
to every other, with a regression test built from that exact anomaly
(`test_picks_latest_eligible_publish_including_off_grid`).

### 3. Error normalization that doesn't blow up near zero

Per-point MAPE is the obvious metric to reach for and is wrong here: wind generation legitimately
hits zero, and dividing by it produces an undefined or exploding per-point error. `compute_metrics`
(`pipeline/build_dataset.py:145`) reports error as a percentage of the **period's mean actual** — one
constant denominator — instead, with a test built on a fixture that includes a genuine
zero-generation hour.

### 4. Risk band bucketed the way the data actually supports

The band is the empirical P5/P95 of `(actual - forecast)`, bucketed by **hour-of-delivery only**
(24 buckets, ~31 samples each) for the selected cutoff — not a 24-hour × horizon cross-tab. That's
not a shortcut: at a fixed cutoff, horizon is already a deterministic function of hour-of-delivery,
so a second bucketing axis would only fragment an already-thin one-month sample into buckets too
small to mean anything. Horizon sensitivity is explored by moving the cutoff control instead of
building a second feature for it — one interaction covers both the "does early vs. late cutoff
matter" question and the lead-time-sensitivity study a more literal reading of the brief might have
built as a separate page.

The band is also **deliberately not clamped at zero**. It's `forecast + empirical percentile`, and
on low-wind hours that can go negative; clamping it would understate how wide the historical error
actually is. The UI shows this honestly rather than hiding it (see `niceScale` in
`frontend/src/lib/chart.ts`, which never clips a genuinely negative value, and
`docs/superpowers/specs/...` plus `HowThisWorksPanel.tsx`, which say so in the product copy too).

### 5. Headline accuracy numbers can't be gamed into looking day-specific

A single delivery day has exactly one sample per hour — a "per-day MAE" computed from 24 points is
statistically closer to noise than a statistic. `AccuracyPanel` fetches month-wide accuracy keyed
only on the cutoff, never the date, and overlays the selected day's realised errors as **points**
on the month-wide chart rather than feeding them into any recomputation. Changing the delivery day
visibly moves the overlay points and visibly does *not* move the five headline tiles — this is
checkable live in the running app, not just asserted in a doc.

### 6. Honest labeling over a bigger-sounding model

The risk band is labeled everywhere it appears — in-app, in the design doc, here — as "based on 31
days, in-sample — illustrative of forecast risk, not a calibrated probabilistic model." It would
have been easy to not say that and let a P5/P95 label imply more statistical confidence than one
month of data supports.

### 7. Charts are hand-rolled SVG, not a chart library's defaults

`DayChart.tsx` and `AccuracyPanel.tsx` render their own SVG rather than wrapping Recharts/Chart.js.
Reasons, not just preference:

- **Color**: every stroke/fill resolves to a CSS custom property in `styles/theme.css`, so there is
  exactly one palette in the app. A chart library would mean hex strings at the call site or
  fighting its own default chrome.
- **The ribbon**: the risk band is a closed path between two independently-moving edges
  (`ribbonPath` in `lib/chart.ts`) that is not symmetric about the forecast line — awkward to coax
  out of a stacked-area abstraction, trivial as a hand-built path.
- **Gaps, not zeros**: missing hours break the line into a new path segment (`runsOf`) rather than
  plotting as zero, which a naive line-chart config will do by default.

The geometry and domain semantics (`niceScale`, `errorScale`, `signedTone`, percentile math) are
pulled out of the components into `lib/chart.ts` / `pipeline/build_dataset.py` specifically so they
can be unit-tested directly instead of only eyeballed in a browser — see `chart.test.ts` (25+ cases)
and `test_build_dataset.py`.

### 8. Accessibility was a real constraint, not an afterthought

Both charts expose `role="img"` with a computed text summary, are keyboard-navigable (arrow keys
step across hours of delivery, `Home`/`End`/`Escape`), and surface the active hour's readout via
`role="status"`. The faint text color token was raised specifically to clear WCAG AA contrast
against all three surfaces it's used on (`theme.css`, see the comment above `--c-text-faint`) after
an initial contrast check failed it.

### 9. Test suite targets the actual failure modes, not just happy paths

The implementation plan's own "Review Focus" section named five concrete bugs a plausible-looking
implementation could still have (leakage, off-grid publish time, missing D-1 lookback for Jan 1-2,
division on zero-generation hours, malformed API requests), and each one has a named test, not just
coverage-for-coverage's-sake:

- `test_excludes_leaked_rows`, `test_picks_latest_eligible_publish_including_off_grid` — pipeline
- `test_build_day_records_jan1_has_full_coverage_from_lookback` — pipeline
- `test_compute_metrics_uses_pct_of_mean_not_per_point_mape` — pipeline
- `test_day_endpoint_out_of_range_returns_404`, `test_accuracy_endpoint_invalid_cutoff_returns_404` — backend

18 Python tests, 62 frontend tests, all passing; `tsc --noEmit` and `vite build` both clean.

## Deliberate non-features

Called out explicitly because each was a real temptation, not just an unconsidered gap:

- **No demand/load data**, even as a clearly-labeled illustrative overlay — the brief says "no
  other data beyond this," and an illustrative series still invites the objection that it's outside
  scope.
- **No zonal/regional breakdown** — national totals only, as given.
- **No live polling in production** — the dataset is pre-fetched once; the backend never calls
  Elexon at request time.
- **No auth/accounts** — single-purpose internal tool, no multi-tenant surface to build.

## Code organization choices worth knowing about

- `backend/app/data_access.py` redefines `CUTOFF_TIMES` rather than importing it from
  `pipeline/build_dataset.py` — `backend/` is meant to deploy as its own standalone Vercel project
  (root directory `backend`) and can't depend on the sibling `pipeline/` package at runtime, so the
  constant is intentionally duplicated rather than sharing an import that would break in production.
- Pure logic is split from I/O and presentation everywhere it matters: `pipeline/build_dataset.py`
  takes plain dicts/lists in and out (no file access except its `__main__` block);
  `frontend/src/lib/chart.ts` has no React or DOM dependency. This is why both are unit-testable
  without mocking a network or a browser.
