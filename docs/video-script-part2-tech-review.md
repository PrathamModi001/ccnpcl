# Video script — Part 2: Tech-lead walkthrough (max 5 minutes)

**Audience:** an internal technical lead reviewing the work. **Goal:** make the review easy and
transfer real knowledge — architecture, key decisions, where the risk was, how it's tested. Assume
they've read neither the README nor the design doc yet; this is the orientation. Screen-record the
codebase (editor) and terminal; cut to the running app only where it demonstrates a point live.

Target runtime: ~4:30.

### 0:00–0:25 — Architecture in one breath

**Say:** "Three pieces. A one-off Python pipeline that pulls Elexon's FUELHH and WINDFOR data for
January and writes a single static JSON artifact — committed to the repo. A FastAPI backend that's
read-only over that artifact; it never calls Elexon at request time. And a React frontend that's
one view: date and cutoff controls driving a day chart and an accuracy panel."

**Show:** `README.md` directory tree, then `docs/technical-overview.md`'s architecture diagram.

### 0:25–1:30 — The correctness problem that actually mattered

**Say:** "The hard part of this brief isn't charting — it's that WINDFOR rows aren't all usable.
Up to 3,700-plus rows in the pulled range were published *after* the hour they claim to forecast —
leakage. If you naively pick 'the latest forecast for this hour as of some date,' you'll pull in
some of those and the whole accuracy measurement becomes fiction." **Open
`pipeline/build_dataset.py`, `select_decision_forecast`.** "This filters on `publishTime <= cutoff`
*and* `publishTime <= startTime` independently. And it doesn't assume the 8 nominal publish times
are a fixed grid — one real January row was published 55 minutes late, so eligibility is always
decided from the row's own timestamp." **Open `test_build_dataset.py`,
scroll to the leak and off-grid tests.**

**Show:** `select_decision_forecast` source, then its two targeted tests.

### 1:30–2:15 — Metrics and the risk band

**Say:** "`compute_metrics` reports error as a percent of the period's mean actual rather than a
per-point MAPE, because wind output genuinely hits zero and per-point division blows up there."
**Point at the zero-generation fixture test.** "The risk band — `compute_risk_band` — is the
empirical P5/P95 of actual-minus-forecast, bucketed by hour of delivery only. Not hour times
horizon: at a fixed cutoff, horizon is already a function of hour-of-delivery, so a second axis
would just fragment 31 samples per bucket into something too thin to trust. Horizon sensitivity is
explored by moving the cutoff instead — that's one UI control doing two jobs."

**Show:** `compute_metrics`, `compute_risk_band`, briefly the design doc section on this.

### 2:15–3:00 — Backend and the data flow it serves

**Say:** "`data_access.py` loads the artifact once, `lru_cache`'d, and exposes three read-only
views. Worth flagging: it redefines `CUTOFF_TIMES` instead of importing it from `pipeline/` —
that's deliberate, not a missed refactor. Backend and frontend are meant to deploy as two
independent Vercel projects, so backend can't depend on a sibling package at runtime." **Show the
comment in `data_access.py` that says this.** "Every endpoint returns a defined 404 on a bad date
or cutoff rather than a 500 — covered in `test_api.py`."

**Show:** `main.py` routes, the 404 tests.

### 3:00–3:45 — Frontend: why hand-rolled SVG, and where the logic lives

**Say:** "Charts are hand-rolled SVG, not a chart library, mainly so every color resolves to one
theme token instead of a second palette living in library config. The actual geometry and domain
semantics — scale selection, path-building, the sign convention for over/under-forecast — are
pulled out into `lib/chart.ts`, which has zero React or DOM dependency, so it's unit-tested
directly." **Open `chart.test.ts`, scroll briefly.** "The components themselves are just
projection and markup on top of that."

**Show:** `lib/chart.ts` (niceScale or errorScale), `chart.test.ts` test count.

### 3:45–4:15 — Dev practices and how to verify this yourself

**Say:** "Everything was built task-by-task from a committed design spec and implementation plan —
`docs/superpowers/` — each task written test-first, then code-reviewed before commit. Right now
that's 18 passing Python tests across the pipeline and backend, 62 passing frontend tests, clean
`tsc` and a clean production build." **Run `pytest pipeline/tests/ backend/tests/ -q` and `npm run
test` live, or show the last clean run.** "Docker Compose brings up both services with one command
for anyone reviewing this locally."

**Show:** terminal running the test suites; `docker compose up --build` if time allows.

### 4:15–4:30 — Close: what's not here on purpose

**Say:** "No demand data, no zonal breakdown, no live Elexon calls at runtime, no auth — all
deliberate scope decisions documented in the design spec, not gaps we ran out of time for."

---

**Reminders while recording:** have the three key files (`build_dataset.py`,
`data_access.py`, `lib/chart.ts`) already open in tabs before recording starts, so there's no
dead air navigating; state file names and line numbers as you jump so the review is easy to follow
without pausing the video.
