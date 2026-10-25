/**
 * Pure geometry and value semantics for the hand-rolled SVG charts.
 *
 * Split out from the components so it can be asserted on directly rather than
 * eyeballed in a screenshot — the axis-domain rules in particular encode
 * domain judgements (generation is never negative; a band that genuinely dips
 * below zero must not be clipped) that are easy to regress silently.
 *
 * Everything here is pure: no React, no DOM, no formatting (the one import is
 * a response *type*, for the day-overlay helper). Display formatting lives in
 * lib/format.ts.
 */

import type { DayHour } from '../api'

/** Axis steps in MW, ascending. See `niceScale` for how one is chosen. */
const TICK_STEPS = [250, 500, 1000, 2000, 2500, 5000, 10_000, 20_000]

/** Preferred upper bound on the number of tick intervals on the MW axis. */
const TARGET_TICKS = 5

/** A point in SVG user space. */
export interface Point {
  x: number
  y: number
}

/** One hour of the risk band, already projected into SVG user space. */
export interface BandPoint {
  x: number
  low: number
  high: number
}

export interface Scale {
  /** Bottom of the plotted domain, in MW. */
  low: number
  /** Top of the plotted domain, in MW. */
  high: number
  /** Whole-step values to label and rule, all within [low, high]. */
  ticks: number[]
}

/**
 * A y-axis domain for MW values, plus the tick values to label.
 *
 * Rules, in order of priority:
 *  - A domain with no finite data falls back to a neutral 0–1000 axis.
 *  - Padding never pushes the floor below zero: generation cannot be negative,
 *    and a sub-zero gridline on a power chart destroys credibility.
 *  - A genuinely negative value is never clipped. The backend's `risk_low` is
 *    an unclamped forecast + error percentile and does dip below zero; hiding
 *    that would misrepresent the band's width. In that case the floor follows
 *    the data down *without* rounding out to the next step, so a single hour at
 *    -9 MW does not buy a labelled -2,500 MW gridline.
 *  - Ticks are always whole steps, so the lowest tick may float above the floor.
 */
export function niceScale(min: number, max: number): Scale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { low: 0, high: 1000, ticks: [0, 500, 1000] }
  }

  // Breathing room so the lines never sit exactly on the frame. The fallback
  // covers a flat series (min === max), where the proportional pad is 0.
  const pad = (max - min) * 0.05 || Math.max(Math.abs(max) * 0.05, 100)

  // The smallest step that keeps the axis to roughly TARGET_TICKS intervals.
  // Falls back to the coarsest step for ranges wider than the ladder covers.
  const span = max + pad - (min - pad)
  const step = TICK_STEPS.find((candidate) => span / candidate <= TARGET_TICKS)
  const chosen = step ?? TICK_STEPS[TICK_STEPS.length - 1]

  const high = Math.ceil((max + pad) / chosen) * chosen
  const low = min >= 0 ? Math.max(Math.floor((min - pad) / chosen) * chosen, 0) : min - pad

  const ticks: number[] = []
  for (let value = Math.ceil(low / chosen) * chosen; value <= high + chosen / 2; value += chosen) {
    // `value === 0` is also true for -0, which would otherwise label itself
    // "-0" (the same trap lib/format.ts guards against).
    ticks.push(value === 0 ? 0 : value)
  }

  return { low, high, ticks }
}

/**
 * Hour-of-delivery labels every 3 hours: 8 labels, which is as many as the
 * narrowest chart in the app can fit without colliding. Shared so the day
 * chart and the error chart tick the same hours and can be read against each
 * other.
 */
export const HOUR_LABEL_EVERY = 3

/**
 * The hour of delivery a pointer is over, from its position across the plot
 * area as a 0–1 fraction.
 *
 * Snaps to the nearest hour (the series are hourly, so there is nothing
 * between two hours to address) and clamps into range, so a pointer in the
 * axis gutters reads the end hour rather than one that does not exist. A
 * non-finite fraction — the first paint, before the plot has been measured —
 * reads as hour 0.
 */
export function hourAtRatio(ratio: number, lastHour: number): number {
  if (!Number.isFinite(ratio)) return 0
  return Math.min(Math.max(Math.round(ratio * lastHour), 0), lastHour)
}

/**
 * Keyboard stepping across hours of delivery.
 *
 * With nothing selected yet, the first keypress enters from the end the step
 * is travelling away from — ArrowRight starts at hour 0, ArrowLeft at the last
 * hour — rather than jumping to the middle. Steps stop at the ends instead of
 * wrapping: a day has a first and a last hour, and silently teleporting across
 * midnight would misread as data.
 */
export function stepHour(current: number | null, step: number, lastHour: number): number {
  if (current === null) return step > 0 ? 0 : lastHour
  return Math.min(Math.max(current + step, 0), lastHour)
}

/**
 * A y-axis domain for *signed error* values.
 *
 * Different rules from `niceScale`, because an error is a different quantity
 * from a generation level:
 *  - Zero is the reference the whole chart is read against, so it is always
 *    inside the domain and always a labelled gridline — even for a month that
 *    over-forecasts at every hour, where no series crosses it.
 *  - Negative is first-class here, not the anomaly `niceScale` tolerates.
 *  - Neither bound rounds out to the next whole step. The error chart is the
 *    short one, and January's errors sit heavily on one side of zero; rounding
 *    out would spend a third of the plot height on empty axis. Ticks still sit
 *    on whole steps, so the outermost label floats inside the domain.
 */
export function errorScale(values: number[]): Scale {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) {
    return { low: -1000, high: 1000, ticks: [-1000, -500, 0, 500, 1000] }
  }

  // Zero joins the data, so the domain always straddles the reference.
  const min = Math.min(0, ...finite)
  const max = Math.max(0, ...finite)

  // Breathing room so a point never sits on the frame. The fallback covers an
  // all-zero series (a perfect forecast), where the proportional pad is 0.
  const pad = (max - min) * 0.05 || 500
  const low = min - pad
  const high = max + pad

  // Beyond the ladder, derive a step rather than repeating its coarsest rung,
  // which would put hundreds of gridlines on the chart.
  const span = high - low
  const step =
    TICK_STEPS.find((candidate) => span / candidate <= TARGET_TICKS) ??
    Math.ceil(span / TARGET_TICKS)

  const ticks: number[] = []
  for (let i = Math.ceil(low / step); i <= Math.floor(high / step); i += 1) {
    // `i === 0` rather than `i * step === 0`, which is also true for -0.
    ticks.push(i === 0 ? 0 : i * step)
  }

  return { low, high, ticks }
}

/** One hour of delivery and its realised signed error, in MW. */
export interface HourError {
  hour: number
  error: number
}

/**
 * The selected day's realised `metered − forecast` error, hour by hour.
 *
 * Used to overlay one day's actual outcomes on the month-wide error chart.
 * An hour missing either side is dropped rather than contributing a zero —
 * treating a missing metered value as 0 MW would plot a fictitious error the
 * size of the whole forecast.
 */
export function overlayErrors(hours: DayHour[]): HourError[] {
  const errors: HourError[] = []

  for (const hour of hours) {
    if (hour.actual === null || hour.forecast === null) continue
    errors.push({ hour: hour.hour, error: hour.actual - hour.forecast })
  }

  return errors
}

/**
 * Splits a sparse series into the runs of consecutive present points.
 *
 * Each run becomes its own path, so a missing hour renders as a gap in the
 * line rather than being plotted as zero.
 */
export function runsOf<T>(points: (T | null)[]): T[][] {
  const runs: T[][] = []
  let current: T[] = []

  for (const point of points) {
    if (point) {
      current.push(point)
    } else if (current.length > 0) {
      runs.push(current)
      current = []
    }
  }
  if (current.length > 0) runs.push(current)

  return runs
}

/** An open polyline through every point. */
export function linePath(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
}

/** Closed ribbon: out along the P95 edge, back along the P5 edge. */
export function ribbonPath(points: BandPoint[]): string {
  const top = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.high}`).join(' ')
  const bottom = points
    .slice()
    .reverse()
    .map((p) => `L${p.x} ${p.low}`)
    .join(' ')
  return `${top} ${bottom} Z`
}

/**
 * The semantic class for an already-computed signed error, in MW.
 *
 * Positive means metered output beat the forecast — the forecast was too low,
 * so a desk that sold to it is short, which the design system colours with
 * `--c-under`. Negative is the mirror image. An exact hit is neither: a zero
 * error is not a position, so it stays neutral.
 *
 * Takes the error rather than its two sides so that aggregates which only ever
 * exist as a difference (month-wide mean bias, an hour-of-delivery bias) use
 * exactly the same sign semantics as a single hour's miss.
 */
export function signedTone(error: number | null): string {
  if (error === null || error === 0) return '' // `=== 0` also catches -0
  return error > 0 ? 'value--under' : 'value--over'
}

/** `signedTone` for a metered/forecast pair, either of which may be missing. */
export function errorTone(actual: number | null, forecast: number | null): string {
  if (actual === null || forecast === null) return ''
  return signedTone(actual - forecast)
}
