# Video script — Part 1: Client pitch (max 5 minutes)

**Audience:** the energy utility's day-ahead trading desk (the "client"). **Goal:** impress them —
this is the output of a pilot project they commissioned. Confident, benefit-first, minimal jargon.
Screen-record the running app (local Docker Compose or the deployed URL) throughout.

Target runtime: ~4:30, leaving margin under the 5-minute cap.

---

### 0:00–0:30 — Open on the problem, not the product

**Say:** "Every day, your desk buys power from the day-ahead market before you know how much wind
will actually blow tomorrow. Right now that extra buffer — how much thermal generation to line up
beyond what wind gives you — is mostly a judgement call. This is a pilot we built to turn that
judgement call into a number, using only the data you already trust: Elexon's own wind actuals and
forecasts."

**Show:** the app's landing state — header, date/cutoff controls, empty-ish chart about to load.

### 0:30–1:30 — The signature view: what you actually had, not just "the forecast"

**Say:** "This chart isn't 'forecast vs. actual' in the generic sense. It's the forecast you
*specifically had in hand* at your decision cutoff — not the latest one on file, which you
wouldn't have seen yet. Pick a cutoff time" — **click through 2-3 of the 8 cutoff options (02:30,
11:30, 22:30)** — "and watch the forecast line actually change, because you're looking at a
genuinely different snapshot each time."

**Show:** switch cutoff several times, let the forecast/actual lines and band visibly move.

### 1:30–2:30 — The risk band: the actual deliverable

**Say:** "This shaded band is the point of the whole exercise. For each hour of the day, we've
measured how wrong this exact kind of forecast has historically been — the 5th to 95th percentile
of real forecast error, for January — and drawn it around today's forecast. That turns 'the
forecast might be off' into an actual MW range to plan your buffer around." **Hover over a breach
point** (a metered value outside its own band). "And when the real outturn falls outside that band
— like here — that's flagged, so you can see at a glance which days were the unusual ones."

**Show:** hover/click a few hours in the readout, point at a breach marker if one is visible for
the selected day.

### 2:30–3:45 — The accuracy panel: quantified, not hand-waved

**Say:** "Below that, the actual accuracy numbers for the whole month at this cutoff — mean error,
RMSE, bias, and the error as a percentage of average output. These stay fixed to the whole month on
purpose: a single day's forecast only gives you one data point per hour, which isn't a statistic
you can act on. Changing the day changes what's overlaid here" — **switch date, point at the dots
moving, numbers staying still** — "but never the headline numbers themselves. That's deliberate —
we didn't want to show you a number that looks precise but isn't."

**Show:** switch date a couple of times with the accuracy panel visible; call out that the five
tiles don't move.

### 3:45–4:30 — Close: honest, scoped, ready to extend

**Say:** "Everything here comes from two Elexon datasets — your wind actuals and your wind forecasts
— nothing synthetic, nothing estimated. The risk band is explicitly labeled as based on one month,
in-sample, because we'd rather you trust the honest version of this than a falsely confident one.
This was built as a focused pilot; the natural next step, if this is useful, is widening the window
beyond January and adding your demand data so the buffer calculation goes all the way to 'how much
to actually buy.'"

**Show:** the "How this works" panel, scrolling briefly to its caveat paragraph.

---

**Reminders while recording:** keep cursor movement deliberate (don't rush between clicks — let the
chart finish redrawing before talking over it); no filler apologies about forecasting being hard;
don't claim calibration/confidence intervals the band doesn't have.
