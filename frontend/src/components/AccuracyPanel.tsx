import { useMemo, useRef, useState } from 'react'

import type { AccuracyResponse, DayResponse } from '../api'
import { useBoxSize } from '../hooks/useBoxSize'
import type { BandPoint, Point } from '../lib/chart'
import {
  HOUR_LABEL_EVERY,
  errorScale,
  hourAtRatio,
  linePath,
  overlayErrors,
  ribbonPath,
  runsOf,
  signedTone,
  stepHour,
} from '../lib/chart'
import { EM_DASH, formatMW, formatPercent, formatSignedMW } from '../lib/format'

/**
 * How wrong the decision-time forecast has been, for the selected cutoff.
 *
 * Two deliberate decisions about *what* this shows:
 *
 *  1. **The headline figures are always month-wide.** A single delivery day
 *     has exactly one sample per hour of delivery, so a "per-day MAE" would be
 *     24 one-sample averages — a number that looks like a statistic and is
 *     not. Changing the delivery day therefore never moves these five tiles;
 *     only the cutoff does.
 *  2. **The selected day appears as raw points, not as a metric.** Its 24
 *     realised `metered − forecast` errors are plotted straight onto the
 *     month-wide chart, which is the honest version of "how did today compare"
 *     — you can see whether the day sat inside the month's typical error or
 *     outside it, without anything being averaged on its behalf.
 *
 * And one about *how* the chart shows it: the month-wide shape is drawn as the
 * ±MAE envelope (mean error magnitude, mirrored about zero) with the mean bias
 * line inside it. Plotting MAE as bars above a zero baseline would put
 * magnitudes and signed day-errors on the same axis meaning different things;
 * mirroring it keeps every mark on the chart in the same signed MW space. How
 * far the bias line sits from the middle of its own envelope is then readable
 * directly: a bias line hugging the envelope's edge means the error is
 * systematic over- or under-forecasting rather than noise.
 *
 * Hand-rolled SVG reading theme tokens, for the reasons set out at the top of
 * DayChart.tsx; the scale, path and sign maths is in lib/chart.ts.
 */

interface AccuracyPanelProps {
  /** Month-wide metrics for the selected cutoff (`GET /api/accuracy`). */
  accuracy: AccuracyResponse
  /** The delivery day on screen, overlaid as realised per-hour errors. The
   *  panel is complete without it — the overlay is an addition, not the
   *  subject. */
  overlayDay?: DayResponse
  /** True while a newer cutoff's figures are in flight; recedes rather than
   *  blanks, so nothing on the panel flashes empty between cutoffs. */
  busy?: boolean
}

/**
 * Deliberately the same gutters as DayChart, so the two charts' plot areas are
 * built to the same rules even though their panels are different widths.
 */
const PAD = { top: 30, right: 16, bottom: 30, left: 60 }

/**
 * The five headline figures, in the order a desk reads them.
 *
 * MAE leads — it is the figure a buffer gets sized from — and takes the full
 * width of the tile grid (see `.metric-row--lead`). `bias` is the only one
 * whose sign carries a position, so it is the only one that gets a tone.
 */
const TILES: {
  key: string
  label: string
  sub: string
  value: (accuracy: AccuracyResponse) => string
  tone?: (accuracy: AccuracyResponse) => string
}[] = [
  {
    key: 'mae',
    label: 'MAE',
    sub: 'mean absolute error',
    value: (accuracy) => formatMW(accuracy.mae),
  },
  {
    key: 'rmse',
    label: 'RMSE',
    sub: 'penalises large misses',
    value: (accuracy) => formatMW(accuracy.rmse),
  },
  {
    key: 'bias',
    label: 'Bias',
    sub: 'signed, actual − forecast',
    value: (accuracy) => formatSignedMW(accuracy.bias),
    tone: (accuracy) => signedTone(accuracy.bias),
  },
  {
    key: 'p90',
    label: 'P90 |error|',
    sub: 'buffer for 9 days in 10',
    value: (accuracy) => formatMW(accuracy.p90_abs_error),
  },
  {
    key: 'pct',
    label: 'Error / mean',
    // `pct_of_mean` arrives already scaled to a percentage, so it is the one
    // figure here that must not go through formatMW.
    sub: 'as % of mean output',
    value: (accuracy) => formatPercent(accuracy.pct_of_mean),
  },
]

/** `31 days` — or the range, if the backend ever returns uneven buckets. */
function describeSamples(counts: number[]): string {
  if (counts.length === 0) return 'no days'

  const low = Math.min(...counts)
  const high = Math.max(...counts)
  return low === high ? `${low} days` : `${low}–${high} days`
}

function AccuracyPanel({ accuracy, overlayDay, busy = false }: AccuracyPanelProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const { width, height } = useBoxSize(boxRef)
  const [activeHour, setActiveHour] = useState<number | null>(null)

  const byHour = accuracy.by_hour
  const plotWidth = Math.max(width - PAD.left - PAD.right, 0)
  const plotHeight = Math.max(height - PAD.top - PAD.bottom, 0)

  const overlay = useMemo(
    () => (overlayDay ? overlayErrors(overlayDay.hours) : []),
    [overlayDay],
  )

  // From the hour values, not the array lengths: a sparse `by_hour` must still
  // land each point at its true hour of delivery.
  const lastHour = Math.max(
    ...byHour.map((entry) => entry.hour),
    ...overlay.map((point) => point.hour),
    1,
  )

  const geometry = useMemo(() => {
    const scale = errorScale([
      ...byHour.flatMap((entry) => [entry.mae, -entry.mae, entry.bias]),
      ...overlay.map((point) => point.error),
    ])

    const x = (hour: number) => PAD.left + (hour / lastHour) * plotWidth
    const y = (value: number) =>
      PAD.top + (1 - (value - scale.low) / (scale.high - scale.low)) * plotHeight

    // `by_hour` omits hours with no samples, so walk the axis rather than the
    // array: a missing hour has to break the envelope and the bias line, not
    // be bridged across.
    const at = new Map(byHour.map((entry) => [entry.hour, entry]))
    const slots = Array.from({ length: lastHour + 1 }, (_, hour) => at.get(hour) ?? null)

    return {
      scale,
      x,
      y,
      at,
      envelope: runsOf(
        slots.map((entry): BandPoint | null =>
          entry === null
            ? null
            : { x: x(entry.hour), low: y(-entry.mae), high: y(entry.mae) },
        ),
      ),
      bias: runsOf(
        slots.map((entry): Point | null =>
          entry === null ? null : { x: x(entry.hour), y: y(entry.bias) },
        ),
      ),
      points: overlay.map((point) => ({
        ...point,
        cx: x(point.hour),
        cy: y(point.error),
      })),
    }
  }, [byHour, overlay, lastHour, plotWidth, plotHeight])

  const activeMonth = activeHour === null ? null : (geometry.at.get(activeHour) ?? null)
  const activeDay =
    activeHour === null ? null : (overlay.find((point) => point.hour === activeHour) ?? null)

  const samples = describeSamples(byHour.map((entry) => entry.n))
  const summary =
    `Mean absolute error and mean bias of the decision-time forecast by hour of ` +
    `delivery, across ${byHour.length} hours, each pooling ${samples} of January. ` +
    (overlay.length > 0
      ? `The selected day's ${overlay.length} realised hourly errors are overlaid. `
      : '') +
    `Use the arrow keys to read a single hour.`

  function hourFromPointer(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return hourAtRatio((event.clientX - bounds.left - PAD.left) / plotWidth, lastHour)
  }

  function onKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0

    if (step !== 0) {
      event.preventDefault()
      setActiveHour((current) => stepHour(current, step, lastHour))
    } else if (event.key === 'Home') {
      setActiveHour(0)
    } else if (event.key === 'End') {
      setActiveHour(lastHour)
    } else if (event.key === 'Escape') {
      setActiveHour(null)
    }
  }

  return (
    <>
      <div className={`metric-row metric-row--lead${busy ? ' is-busy' : ''}`}>
        {TILES.map((tile) => {
          const tone = tile.tone?.(accuracy)

          return (
            <div className="metric" key={tile.key}>
              <span className="label-micro">{tile.label}</span>
              <span className={tone ? `metric__value ${tone}` : 'metric__value'}>
                {tile.value(accuracy)}
              </span>
              <span className="metric__sub">{tile.sub}</span>
            </div>
          )
        })}
      </div>

      <div className="subhead">
        {/* A micro label rather than a second panel title: inside a panel that
            already has one, the chart's name is a caption, not a heading. */}
        <h3 className="label-micro">Error by hour of delivery</h3>
        <ul className="legend">
          <li className="legend__item">
            <span className="legend__swatch legend__swatch--band" />± mean |error|
          </li>
          <li className="legend__item">
            <span className="legend__swatch legend__swatch--forecast" />
            Mean bias
          </li>
          {overlay.length > 0 && (
            <li className="legend__item">
              <span className="legend__swatch legend__swatch--point" />
              Selected day
            </li>
          )}
        </ul>
      </div>

      {byHour.length === 0 ? (
        <p className="chart-state">No hour-of-delivery breakdown for this cutoff.</p>
      ) : (
        <div className={`chart${busy ? ' is-busy' : ''}`} ref={boxRef}>
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
              {/* Error gridlines. Zero carries the axis weight, not the
                  gridline weight: it is the reference, not a value. */}
              {geometry.scale.ticks.map((tick) => (
                <g key={tick}>
                  <line
                    className={tick === 0 ? 'chart__zero' : 'chart__grid'}
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

              {/* The month's mean error magnitude, mirrored about zero. */}
              {geometry.envelope.map((run) => (
                <g key={`envelope-${run[0].x}`}>
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

              {activeMonth && (
                <line
                  className="chart__crosshair"
                  x1={geometry.x(activeMonth.hour)}
                  x2={geometry.x(activeMonth.hour)}
                  y1={PAD.top}
                  y2={PAD.top + plotHeight}
                />
              )}

              {geometry.bias.map((run) => (
                <path
                  className="chart__line chart__line--forecast"
                  key={`bias-${run[0].x}`}
                  d={linePath(run)}
                />
              ))}

              {/* The selected day's realised errors. */}
              {geometry.points.map((point) => (
                <circle
                  className="chart__point"
                  key={`error-${point.hour}`}
                  cx={point.cx}
                  cy={point.cy}
                  r={2.5}
                />
              ))}

              {/* Hour-of-delivery axis, along the bottom frame. */}
              <line
                className="chart__axis"
                x1={PAD.left}
                x2={PAD.left + plotWidth}
                y1={PAD.top + plotHeight}
                y2={PAD.top + plotHeight}
              />
              {byHour
                .filter((entry) => entry.hour % HOUR_LABEL_EVERY === 0)
                .map((entry) => (
                  <text
                    className="chart__tick"
                    key={`hour-${entry.hour}`}
                    x={geometry.x(entry.hour)}
                    y={PAD.top + plotHeight + 18}
                    textAnchor="middle"
                  >
                    {String(entry.hour).padStart(2, '0')}:00
                  </text>
                ))}

              {/* Transparent target so pointer events cover the whole plot. */}
              <rect
                x={PAD.left}
                y={PAD.top}
                width={plotWidth}
                height={plotHeight}
                fill="transparent"
              />
            </svg>
          )}

          {activeMonth && (
            <div
              className={`readout readout--${activeMonth.hour <= lastHour / 2 ? 'right' : 'left'}`}
              role="status"
            >
              <span className="readout__hour label-micro">
                {String(activeMonth.hour).padStart(2, '0')}:00–
                {String(activeMonth.hour + 1).padStart(2, '0')}:00 UTC
              </span>
              <div className="readout__rows">
                <span className="readout__label">Mean |error|</span>
                <span className="readout__value">{formatMW(activeMonth.mae)}</span>

                <span className="readout__label">Mean bias</span>
                <span className={`readout__value ${signedTone(activeMonth.bias)}`}>
                  {formatSignedMW(activeMonth.bias)}
                </span>

                <span className="readout__label">Selected day</span>
                <span
                  className={`readout__value ${activeDay ? signedTone(activeDay.error) : ''}`}
                >
                  {activeDay === null ? EM_DASH : formatSignedMW(activeDay.error)}
                </span>

                <span className="readout__label">Pooled from</span>
                <span className="readout__value">{activeMonth.n} days</span>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="panel__note">
        Signed error is metered − forecast, so below the zero line the forecast ran high. Each
        hour of delivery pools {samples} of January at this cutoff.
      </p>
    </>
  )
}

export default AccuracyPanel
