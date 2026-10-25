import { useEffect, useState } from 'react'

import { ApiError, fetchDay, fetchMeta } from './api'
import type { DayResponse, MetaResponse } from './api'
import DateCutoffControls from './components/DateCutoffControls'
import DayChart from './components/DayChart'
import { EM_DASH, formatMW } from './lib/format'

/**
 * Application shell. Owns the two pieces of state the whole page is a function
 * of — the delivery day and the decision cutoff — and the fetches they drive.
 *
 * Task 9 replaces the "Forecast accuracy" slot with
 * `components/AccuracyPanel.tsx` and the methodology panel with
 * `components/HowThisWorksPanel.tsx`.
 *
 * Keep the `.panel` / `.metric` / `.chip-row` / `.caveat` primitives when you
 * do — they are the design system, not scaffolding (see styles/theme.css).
 */

/** The 8 real WINDFOR publish times (backend `data_access.CUTOFF_TIMES`).
 *  Used only until `fetchMeta` confirms them, so the control strip renders at
 *  its final width on the first paint. */
const CUTOFFS = ['02:30', '04:30', '07:30', '09:30', '11:30', '15:30', '18:30', '22:30']

/** The cutoff a desk defaults to: late enough to be a real D−1 decision point,
 *  early enough to still be tradeable. */
const DEFAULT_CUTOFF = '11:30'

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

/**
 * Turns a thrown value into something a trader can act on. A 404 means the
 * selection is outside the dataset; anything else is almost always "the
 * backend isn't up", which is the one failure a reader can fix themselves.
 */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'No data published for that delivery day and cutoff.'
    return `The forecast API returned ${error.status}. Try another day, or reload.`
  }
  return 'Could not reach the forecast API. Is the backend running?'
}

function App() {
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [date, setDate] = useState('')
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF)

  const [day, setDay] = useState<DayResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** `fetchMeta` failed, so no days will ever arrive. Distinct from "not yet
   *  loaded", which the controls otherwise cannot tell apart. */
  const [metaFailed, setMetaFailed] = useState(false)

  /**
   * Whether the day on screen is for the current selection. Derived from the
   * date/cutoff the response echoes back rather than tracked as a `loading`
   * flag, which would mean setting state inside the fetch effect.
   */
  const stale = day !== null && (day.date !== date || day.cutoff !== cutoff)

  // Which days and cutoffs exist at all. Runs once; the dataset is static.
  useEffect(() => {
    let cancelled = false

    fetchMeta()
      .then((response) => {
        if (cancelled) return
        setMeta(response)
        setDate(response.dates[0] ?? '')
        // Honour the default cutoff only if the backend actually publishes it.
        if (!response.cutoffs.includes(DEFAULT_CUTOFF)) {
          setCutoff(response.cutoffs[0] ?? DEFAULT_CUTOFF)
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(describeError(cause))
        setMetaFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  /** Selection changes retire any previous failure before the refetch. */
  function selectDate(next: string) {
    setDate(next)
    setError(null)
  }

  function selectCutoff(next: string) {
    setCutoff(next)
    setError(null)
  }

  // The day view, refetched on every selection change. The previous day stays
  // on screen (dimmed) while the next one loads, so the chart never blanks.
  useEffect(() => {
    if (!date || !cutoff) return

    let cancelled = false

    fetchDay(date, cutoff)
      .then((response) => {
        if (cancelled) return
        setDay(response)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setDay(null)
        setError(describeError(cause))
      })

    return () => {
      cancelled = true
    }
  }, [date, cutoff])

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
        <DateCutoffControls
          dates={meta?.dates ?? []}
          cutoffs={meta?.cutoffs ?? CUTOFFS}
          selectedDate={date}
          selectedCutoff={cutoff}
          onDateChange={selectDate}
          onCutoffChange={selectCutoff}
          unavailable={metaFailed}
        />

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
                <li className="legend__item">
                  <span className="legend__swatch legend__swatch--breach" />
                  Outside band
                </li>
              </ul>
            </div>

            {error !== null ? (
              <p className="chart-state chart-state--error" role="alert">
                {error}
              </p>
            ) : day === null ? (
              <p className="chart-state">Loading the delivery day…</p>
            ) : (
              <DayChart hours={day.hours} busy={stale} />
            )}
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
