import { useState } from 'react'

import { EM_DASH, formatDate, formatMW } from './lib/format'

/**
 * Scaffold shell (Task 7). The layout, controls strip, metric row and panel
 * slots below are the real chrome; the data is not wired up yet.
 *
 * Task 8 replaces the controls strip with `components/DateCutoffControls.tsx`
 * (driven by `fetchMeta`) and the "Forecast vs. metered output" slot with
 * `components/DayChart.tsx`. Task 9 replaces the "Forecast accuracy" slot with
 * `components/AccuracyPanel.tsx` and the methodology panel with
 * `components/HowThisWorksPanel.tsx`.
 *
 * Keep the `.panel` / `.metric` / `.chip-row` / `.caveat` primitives when you
 * do — they are the design system, not scaffolding (see styles/theme.css).
 */

/** The 8 real WINDFOR publish times (backend `data_access.CUTOFF_TIMES`). */
const CUTOFFS = ['02:30', '04:30', '07:30', '09:30', '11:30', '15:30', '18:30', '22:30']

/** Placeholder only — Task 8 populates this from `fetchMeta().dates`, which
 *  returns all 31 days of January 2026 (verified against the running API). */
const SCAFFOLD_DATES = Array.from(
  { length: 31 },
  (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`,
)

/**
 * Headline metrics in the order a desk reads them; values arrive in Task 9.
 *
 * `unit` matters: mae/rmse/bias/p90_abs_error are MW and go through
 * `formatMW`, but the backend's `pct_of_mean` is already scaled to a
 * percentage (e.g. 17.42 means 17.4%) — do not run it through `formatMW`.
 */
const METRICS = [
  { key: 'mae', label: 'MAE', sub: 'mean absolute error', unit: 'MW' },
  { key: 'rmse', label: 'RMSE', sub: 'penalises large misses', unit: 'MW' },
  { key: 'bias', label: 'Bias', sub: 'signed, actual − forecast', unit: 'MW' },
  { key: 'p90', label: 'P90 |error|', sub: 'buffer for 9 days in 10', unit: 'MW' },
  { key: 'pct', label: 'Error / mean', sub: 'as % of mean output', unit: '%' },
] as const

function App() {
  const [date, setDate] = useState(SCAFFOLD_DATES[3])
  const [cutoff, setCutoff] = useState('11:30')

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <h1 className="app__title">Day-ahead wind forecast accuracy</h1>
          <p className="app__strapline">
            The forecast a trading desk actually had at the decision point — and how wrong it
            has been.
          </p>
        </div>
        <p className="app__provenance">
          Elexon FUELHH · WINDFOR
          <br />
          GB national · Jan 2026
        </p>
      </header>

      <main className="app__main">
        <section className="controls" aria-label="Delivery day and decision cutoff">
          <div className="field">
            <label className="label-micro" htmlFor="date">
              Delivery day
            </label>
            <select
              className="select"
              id="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            >
              {SCAFFOLD_DATES.map((option) => (
                <option key={option} value={option}>
                  {formatDate(option)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <span className="label-micro" id="cutoff-label">
              Decision cutoff (D−1, UTC)
            </span>
            <div className="chip-row" role="group" aria-labelledby="cutoff-label">
              {CUTOFFS.map((option) => (
                <button
                  key={option}
                  className="chip"
                  type="button"
                  aria-pressed={option === cutoff}
                  onClick={() => setCutoff(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <p className="panel__note">
            Showing {formatDate(date)} as decided at {cutoff} the day before. Only the 8 real
            WINDFOR publish times are selectable — there is no forecast to choose between them.
          </p>
        </section>

        <div className="layout">
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Forecast vs. metered output</h2>
              <ul className="legend">
                <li className="legend__item">
                  <span className="legend__swatch legend__swatch--actual" />
                  Metered (FUELHH)
                </li>
                <li className="legend__item">
                  <span className="legend__swatch legend__swatch--forecast" />
                  Decision forecast
                </li>
                <li className="legend__item">
                  <span className="legend__swatch legend__swatch--band" />
                  P5–P95 risk band
                </li>
              </ul>
            </div>
            <div className="slot">Day chart renders here (Task 8)</div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Forecast accuracy</h2>
              <p className="panel__note">Whole of January at the {cutoff} cutoff</p>
            </div>

            <div className="metric-row">
              {METRICS.map((metric) => (
                <div className="metric" key={metric.key}>
                  <span className="label-micro">{metric.label}</span>
                  {/* formatMW renders an em dash for a missing value, so the
                      tiles hold their shape before the fetch lands. */}
                  <span className="metric__value">
                    {metric.unit === 'MW' ? formatMW(Number.NaN) : EM_DASH}
                  </span>
                  <span className="metric__sub">{metric.sub}</span>
                </div>
              ))}
            </div>

            <div className="slot">Error by hour of delivery renders here (Task 9)</div>
          </section>
        </div>

        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">How this works</h2>
            <p className="panel__note">Methodology and its limits (Task 9)</p>
          </div>
          <p className="caveat">
            The risk band is the empirical 5th–95th percentile of (metered − forecast) for the
            same hour of delivery across 31 days of January 2026, in-sample. It is illustrative
            of forecast risk, not a calibrated probabilistic model.
          </p>
        </section>
      </main>

      <footer className="app__footer">
        Built on Elexon Insights open data (FUELHH fuelType=WIND, WINDFOR), January 2026 only.
      </footer>
    </div>
  )
}

export default App
