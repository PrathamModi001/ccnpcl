import { useEffect, useState } from 'react'

import { ApiError, fetchAccuracy, fetchDay, fetchMeta } from './api'
import type { AccuracyResponse, DayResponse, MetaResponse } from './api'
import AccuracyPanel from './components/AccuracyPanel'
import DateCutoffControls from './components/DateCutoffControls'
import DayChart from './components/DayChart'
import HowThisWorksPanel from './components/HowThisWorksPanel'

/**
 * Application shell. Owns the two pieces of state the whole page is a function
 * of — the delivery day and the decision cutoff — and the fetches they drive.
 *
 * The two fetches are deliberately keyed differently. `/api/day` depends on
 * both the date and the cutoff; `/api/accuracy` depends on the cutoff alone,
 * because the headline error figures are month-wide by design (a single day
 * holds one sample per hour of delivery, so a per-day MAE would be noise
 * dressed as a statistic). Keying it on the cutoff only also means the
 * figures demonstrably do not move when the delivery day changes.
 */

/** The 8 real WINDFOR publish times (backend `data_access.CUTOFF_TIMES`).
 *  Used only until `fetchMeta` confirms them, so the control strip renders at
 *  its final width on the first paint. */
const CUTOFFS = ['02:30', '04:30', '07:30', '09:30', '11:30', '15:30', '18:30', '22:30']

/** The cutoff a desk defaults to: late enough to be a real D−1 decision point,
 *  early enough to still be tradeable. */
const DEFAULT_CUTOFF = '11:30'

/**
 * Turns a thrown value into something a trader can act on. A 404 means the
 * selection is outside the dataset — `missing` says which selection, since the
 * two endpoints are keyed differently — and anything else is almost always
 * "the backend isn't up", the one failure a reader can fix themselves.
 */
function describeError(
  error: unknown,
  missing = 'No data published for that delivery day and cutoff.',
): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return missing
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
  /**
   * Month-wide accuracy, stored with the cutoff it was fetched for.
   * `AccuracyResponse` does not echo its cutoff back the way `DayResponse`
   * does, so this is the only way to tell "these figures are the current
   * selection's" from "these are the previous selection's, still arriving".
   */
  const [accuracy, setAccuracy] = useState<{ cutoff: string; data: AccuracyResponse } | null>(
    null,
  )
  const [accuracyError, setAccuracyError] = useState<string | null>(null)
  /** `fetchMeta` failed, so no days will ever arrive. Distinct from "not yet
   *  loaded", which the controls otherwise cannot tell apart. */
  const [metaFailed, setMetaFailed] = useState(false)

  /**
   * Whether the day on screen is for the current selection. Derived from the
   * date/cutoff the response echoes back rather than tracked as a `loading`
   * flag, which would mean setting state inside the fetch effect.
   */
  const stale = day !== null && (day.date !== date || day.cutoff !== cutoff)
  /** The same derivation for the accuracy figures. Note it ignores `date`:
   *  changing the delivery day must not even *look* like it recomputes them. */
  const accuracyStale = accuracy !== null && accuracy.cutoff !== cutoff

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
    setAccuracyError(null)
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

  // Month-wide accuracy for the cutoff. Not keyed on the date — see the note
  // at the top of this file.
  useEffect(() => {
    if (!cutoff) return

    let cancelled = false

    fetchAccuracy(cutoff)
      .then((response) => {
        if (cancelled) return
        setAccuracy({ cutoff, data: response })
        setAccuracyError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setAccuracy(null)
        setAccuracyError(describeError(cause, 'No accuracy published for that cutoff.'))
      })

    return () => {
      cancelled = true
    }
  }, [cutoff])

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

            {accuracyError !== null ? (
              <p className="chart-state chart-state--error" role="alert">
                {accuracyError}
              </p>
            ) : accuracy === null ? (
              <p className="chart-state">Loading the month’s accuracy…</p>
            ) : (
              <AccuracyPanel
                accuracy={accuracy.data}
                /* The day already fetched for the chart on the left — the
                   panel overlays its realised errors rather than fetching the
                   same day again. */
                overlayDay={day ?? undefined}
                busy={accuracyStale}
              />
            )}
          </section>
        </div>

        <HowThisWorksPanel />
      </main>

      <footer className="app__footer">
        Built on Elexon Insights open data (FUELHH fuelType=WIND, WINDFOR), January 2026 only.
      </footer>
    </div>
  )
}

export default App
