import { useEffect, useMemo, useRef, useState } from 'react'

import type { DayHour, DayResponse } from '../api'
import type { BandPoint, Point } from '../lib/chart'
import { errorTone, linePath, niceScale, ribbonPath, runsOf } from '../lib/chart'
import { EM_DASH, formatMW } from '../lib/format'

/**
 * The signature panel: one delivery day, metered output against the forecast
 * the desk actually had at the cutoff, wrapped in its P5–P95 risk band.
 *
 * Hand-rolled SVG rather than a chart library, on purpose:
 *
 *  1. Colour. Every stroke and fill below resolves to a token from
 *     styles/theme.css via a class in primitives.css — there is no second
 *     palette in the app to drift from the legend. Recharts/Chart.js would have
 *     meant passing hex strings (or `getComputedStyle` gymnastics) and then
 *     overriding their default grid, tick and tooltip chrome anyway.
 *  2. The ribbon. A band that is *not* symmetric about the forecast (the
 *     empirical percentiles routinely sit mostly below it) is one closed path
 *     here, versus fighting a stacked-area abstraction.
 *  3. Null handling. The brief wants missing hours skipped, not zeroed. Here a
 *     gap is simply a new path segment.
 *
 * The scale, path and sign-semantics maths lives in lib/chart.ts so it can be
 * asserted on directly (lib/chart.test.ts); this file is projection,
 * interaction and markup.
 */

interface DayChartProps {
  hours: DayResponse['hours']
  /** True while a newer day/cutoff is in flight; dims rather than blanks. */
  busy?: boolean
}

/** Room for the MW axis (left), the hour-of-delivery axis (bottom), and the
 *  unit header above the topmost tick label. */
const PAD = { top: 30, right: 16, bottom: 30, left: 60 }

/** Hour labels every 3 hours keeps 8 ticks across the widest layout. */
const HOUR_LABEL_EVERY = 3

/**
 * Metered output outside its own risk band — the thing a desk wants flagged.
 *
 * Narrows `actual` so callers can plot a breach without asserting past the
 * type system.
 */
function isBreach(hour: DayHour): hour is DayHour & { actual: number } {
  if (hour.actual === null || hour.risk_low === null || hour.risk_high === null) return false
  return hour.actual < hour.risk_low || hour.actual > hour.risk_high
}

/** Measures the element the chart is drawn into, without feeding back into it
 *  (the SVG is absolutely positioned, so it cannot influence this box). */
function useBoxSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width: Math.round(width), height: Math.round(height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}

function DayChart({ hours, busy = false }: DayChartProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const { width, height } = useBoxSize(boxRef)
  const [activeHour, setActiveHour] = useState<number | null>(null)

  const plotWidth = Math.max(width - PAD.left - PAD.right, 0)
  const plotHeight = Math.max(height - PAD.top - PAD.bottom, 0)
  // Derived from the hour values, not the array length: a short or
  // non-contiguous day must still land each point at its true hour of
  // delivery rather than at its index.
  const lastHour = Math.max(...hours.map((hour) => hour.hour), 1)

  const geometry = useMemo(() => {
    const values = hours.flatMap((hour) =>
      [hour.actual, hour.forecast, hour.risk_low, hour.risk_high].filter(
        (value): value is number => value !== null,
      ),
    )
    const scale = niceScale(Math.min(...values), Math.max(...values))

    const x = (hour: number) => PAD.left + (hour / lastHour) * plotWidth
    const y = (value: number) =>
      PAD.top + (1 - (value - scale.low) / (scale.high - scale.low)) * plotHeight

    const point = (hour: DayHour, value: number | null): Point | null =>
      value === null ? null : { x: x(hour.hour), y: y(value) }

    return {
      scale,
      x,
      y,
      actual: runsOf(hours.map((hour) => point(hour, hour.actual))),
      forecast: runsOf(hours.map((hour) => point(hour, hour.forecast))),
      band: runsOf(
        hours.map((hour): BandPoint | null =>
          hour.risk_low === null || hour.risk_high === null
            ? null
            : { x: x(hour.hour), low: y(hour.risk_low), high: y(hour.risk_high) },
        ),
      ),
      breaches: hours.filter(isBreach),
    }
  }, [hours, lastHour, plotWidth, plotHeight])

  const active = activeHour === null ? null : (hours.find((h) => h.hour === activeHour) ?? null)

  if (hours.length === 0) {
    return <p className="chart-state">No hourly data for this delivery day.</p>
  }

  const summary =
    `Hourly metered output against the decision forecast and its P5–P95 risk band, ` +
    `across ${hours.length} hours of delivery. ` +
    `${geometry.breaches.length} of ${hours.length} hours fell outside the band. ` +
    `Use the arrow keys to read a single hour.`

  function hourFromPointer(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - bounds.left - PAD.left) / (plotWidth || 1)
    return Math.min(Math.max(Math.round(ratio * lastHour), 0), lastHour)
  }

  function onKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0

    if (step !== 0) {
      event.preventDefault()
      setActiveHour((current) =>
        current === null
          ? step > 0
            ? 0
            : lastHour
          : Math.min(Math.max(current + step, 0), lastHour),
      )
    } else if (event.key === 'Home') {
      setActiveHour(0)
    } else if (event.key === 'End') {
      setActiveHour(lastHour)
    } else if (event.key === 'Escape') {
      setActiveHour(null)
    }
  }

  return (
    <div className={`chart${busy ? ' chart--busy' : ''}`} ref={boxRef}>
      {plotWidth > 0 && plotHeight > 0 && (
        <svg
          className="chart__canvas"
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onPointerMove={(event) => setActiveHour(hourFromPointer(event))}
          onPointerLeave={() => setActiveHour(null)}
          onBlur={() => setActiveHour(null)}
          onKeyDown={onKeyDown}
        >
          {/* MW gridlines and their labels. */}
          {geometry.scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                className="chart__grid"
                x1={PAD.left}
                x2={PAD.left + plotWidth}
                y1={geometry.y(tick)}
                y2={geometry.y(tick)}
              />
              <text
                className="chart__tick"
                x={PAD.left - 10}
                y={geometry.y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {tick.toLocaleString('en-GB')}
              </text>
            </g>
          ))}
          <text className="chart__unit" x={PAD.left - 10} y={PAD.top - 16} textAnchor="end">
            MW
          </text>

          {/* The risk band, under the lines it describes. */}
          {geometry.band.map((run) => (
            <g key={`band-${run[0].x}`}>
              <path className="chart__band" d={ribbonPath(run)} />
              <path
                className="chart__band-edge"
                d={linePath(run.map((p) => ({ x: p.x, y: p.high })))}
              />
              <path
                className="chart__band-edge"
                d={linePath(run.map((p) => ({ x: p.x, y: p.low })))}
              />
            </g>
          ))}

          {/* Crosshair sits between the band and the lines so it never
              obscures a data point. */}
          {active && (
            <line
              className="chart__crosshair"
              x1={geometry.x(active.hour)}
              x2={geometry.x(active.hour)}
              y1={PAD.top}
              y2={PAD.top + plotHeight}
            />
          )}

          {geometry.forecast.map((run) => (
            <path
              className="chart__line chart__line--forecast"
              key={`forecast-${run[0].x}`}
              d={linePath(run)}
            />
          ))}
          {geometry.actual.map((run) => (
            <path
              className="chart__line chart__line--actual"
              key={`actual-${run[0].x}`}
              d={linePath(run)}
            />
          ))}

          {/* Hours where metered output escaped its own P5–P95 band. */}
          {geometry.breaches.map((hour) => (
            <circle
              className="chart__breach"
              key={`breach-${hour.hour}`}
              cx={geometry.x(hour.hour)}
              cy={geometry.y(hour.actual)}
              r={3.5}
            />
          ))}

          {active !== null && active.forecast !== null && (
            <circle
              className="chart__dot chart__dot--forecast"
              cx={geometry.x(active.hour)}
              cy={geometry.y(active.forecast)}
              r={3}
            />
          )}
          {active !== null && active.actual !== null && (
            <circle
              className="chart__dot chart__dot--actual"
              cx={geometry.x(active.hour)}
              cy={geometry.y(active.actual)}
              r={3}
            />
          )}

          {/* Hour-of-delivery axis. */}
          <line
            className="chart__axis"
            x1={PAD.left}
            x2={PAD.left + plotWidth}
            y1={PAD.top + plotHeight}
            y2={PAD.top + plotHeight}
          />
          {hours
            .filter((hour) => hour.hour % HOUR_LABEL_EVERY === 0)
            .map((hour) => (
              <text
                className="chart__tick"
                key={`hour-${hour.hour}`}
                x={geometry.x(hour.hour)}
                y={PAD.top + plotHeight + 18}
                textAnchor="middle"
              >
                {String(hour.hour).padStart(2, '0')}:00
              </text>
            ))}

          {/* Transparent target so pointer events cover the whole plot area. */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
          />
        </svg>
      )}

      {active && (
        /* Placed opposite the cursor so the readout never covers the hour it
           is describing. `role="status"` makes arrow-key stepping audible. */
        <div
          className={`readout readout--${active.hour <= lastHour / 2 ? 'right' : 'left'}`}
          role="status"
        >
          <span className="readout__hour label-micro">
            {String(active.hour).padStart(2, '0')}:00–{String(active.hour + 1).padStart(2, '0')}
            :00 UTC
          </span>
          <div className="readout__rows">
            <span className="readout__label">Metered</span>
            <span className="readout__value">
              {active.actual === null ? EM_DASH : formatMW(active.actual)}
            </span>

            <span className="readout__label">Decision forecast</span>
            <span className="readout__value">
              {active.forecast === null ? EM_DASH : formatMW(active.forecast)}
            </span>

            <span className="readout__label">Metered − forecast</span>
            <span className={`readout__value ${errorTone(active.actual, active.forecast)}`}>
              {active.actual === null || active.forecast === null
                ? EM_DASH
                : formatMW(active.actual - active.forecast)}
            </span>

            <span className="readout__label">P5 / P95</span>
            <span className="readout__value">
              {active.risk_low === null ? EM_DASH : formatMW(active.risk_low)}
              <br />
              {active.risk_high === null ? EM_DASH : formatMW(active.risk_high)}
            </span>
          </div>
          {isBreach(active) && (
            <span className="readout__flag">Metered output fell outside the risk band.</span>
          )}
        </div>
      )}
    </div>
  )
}

export default DayChart
