/**
 * Pure geometry and value semantics for the hand-rolled SVG charts.
 *
 * Split out from the components so it can be asserted on directly rather than
 * eyeballed in a screenshot — the axis-domain rules in particular encode
 * domain judgements (generation is never negative; a band that genuinely dips
 * below zero must not be clipped) that are easy to regress silently.
 *
 * Everything here is pure: no React, no DOM, no formatting. Display formatting
 * lives in lib/format.ts.
 */

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
 * The semantic class for a signed `metered − forecast` error.
 *
 * Positive means metered beat the forecast — the forecast was too low, so a
 * desk that sold to it is short, which the design system colours with
 * `--c-under`. Negative is the mirror image. An exact hit is neither: a zero
 * error is not a position, so it stays neutral.
 */
export function errorTone(actual: number | null, forecast: number | null): string {
  if (actual === null || forecast === null) return ''

  const error = actual - forecast
  if (error === 0) return '' // also catches -0
  return error > 0 ? 'value--under' : 'value--over'
}
