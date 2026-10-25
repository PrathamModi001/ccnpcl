import { expect, test } from 'vitest'

import {
  errorScale,
  errorTone,
  hourAtRatio,
  linePath,
  niceScale,
  overlayErrors,
  ribbonPath,
  runsOf,
  signedTone,
  stepHour,
} from './chart'

/* ── niceScale ──────────────────────────────────────────────────────── */

test('niceScale falls back to a neutral axis when there is no finite data', () => {
  // Math.min/Math.max of an empty series yield ±Infinity.
  const scale = niceScale(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)

  expect(scale).toEqual({ low: 0, high: 1000, ticks: [0, 500, 1000] })
})

test('niceScale falls back when either bound is NaN', () => {
  expect(niceScale(Number.NaN, 100).ticks).toEqual([0, 500, 1000])
  expect(niceScale(0, Number.NaN).ticks).toEqual([0, 500, 1000])
})

test('niceScale never pads the floor below zero (generation cannot be negative)', () => {
  // The regression that shipped a labelled "-2,500 MW" gridline.
  const scale = niceScale(400, 10_000)

  expect(scale.low).toBe(0)
  expect(Math.min(...scale.ticks)).toBeGreaterThanOrEqual(0)
})

test('niceScale keeps a genuinely negative minimum visible without clipping it', () => {
  // The backend's risk_low is an unclamped forecast + error percentile.
  const scale = niceScale(-8.75, 10_000)

  expect(scale.low).toBeLessThan(-8.75)
  expect(scale.high).toBeGreaterThanOrEqual(10_000)
})

test('niceScale does not buy a whole extra gridline for a barely-negative value', () => {
  const scale = niceScale(-8.75, 10_000)

  // The floor follows the data down, but ticks stay on whole steps, so the
  // lowest *label* is 0 rather than -2,500.
  expect(Math.min(...scale.ticks)).toBe(0)
})

test('niceScale never labels a tick "-0"', () => {
  const scale = niceScale(-8.75, 10_000)

  for (const tick of scale.ticks) {
    expect(Object.is(tick, -0)).toBe(false)
  }
  expect(scale.ticks.map((t) => t.toLocaleString('en-GB'))).not.toContain('-0')
})

test('niceScale handles a flat series (min === max) without collapsing', () => {
  const scale = niceScale(10_000, 10_000)

  expect(scale.high).toBeGreaterThan(scale.low)
  expect(scale.low).toBeLessThanOrEqual(10_000)
  expect(scale.high).toBeGreaterThanOrEqual(10_000)
  expect(scale.ticks.length).toBeGreaterThan(1)
})

test('niceScale handles a flat series at zero', () => {
  const scale = niceScale(0, 0)

  expect(scale.low).toBe(0)
  expect(scale.high).toBeGreaterThan(0)
})

test('niceScale brackets the data and keeps ticks inside the domain', () => {
  const scale = niceScale(13_814.5, 21_242.25)

  expect(scale.low).toBeLessThanOrEqual(13_814.5)
  expect(scale.high).toBeGreaterThanOrEqual(21_242.25)
  for (const tick of scale.ticks) {
    expect(tick).toBeGreaterThanOrEqual(scale.low)
    expect(tick).toBeLessThanOrEqual(scale.high)
  }
})

test('niceScale produces evenly spaced, round ticks', () => {
  const { ticks } = niceScale(13_814.5, 21_242.25)
  const gaps = ticks.slice(1).map((tick, i) => tick - ticks[i])

  expect(new Set(gaps).size).toBe(1)
  expect(ticks.every((tick) => Number.isInteger(tick))).toBe(true)
})

test('niceScale still produces a usable axis for a span wider than the step ladder', () => {
  const scale = niceScale(0, 5_000_000)

  expect(scale.high).toBeGreaterThanOrEqual(5_000_000)
  expect(scale.ticks.length).toBeGreaterThan(1)
})

/* ── runsOf ─────────────────────────────────────────────────────────── */

test('runsOf keeps a fully present series as one run', () => {
  expect(runsOf([1, 2, 3])).toEqual([[1, 2, 3]])
})

test('runsOf drops leading nulls', () => {
  expect(runsOf([null, null, 1, 2])).toEqual([[1, 2]])
})

test('runsOf drops trailing nulls', () => {
  expect(runsOf([1, 2, null, null])).toEqual([[1, 2]])
})

test('runsOf splits on an interior gap rather than bridging it', () => {
  expect(runsOf([1, 2, null, 3, 4])).toEqual([
    [1, 2],
    [3, 4],
  ])
})

test('runsOf splits on a multi-point interior gap', () => {
  expect(runsOf([1, null, null, 2])).toEqual([[1], [2]])
})

test('runsOf returns no runs for an all-null or empty series', () => {
  expect(runsOf([null, null])).toEqual([])
  expect(runsOf([])).toEqual([])
})

test('runsOf preserves object identity for the points it keeps', () => {
  const a = { x: 0, y: 1 }
  const b = { x: 1, y: 2 }

  expect(runsOf([a, null, b])).toEqual([[a], [b]])
})

/* ── path builders ──────────────────────────────────────────────────── */

test('linePath moves to the first point and lines to the rest', () => {
  expect(
    linePath([
      { x: 0, y: 10 },
      { x: 5, y: 20 },
      { x: 10, y: 15 },
    ]),
  ).toBe('M0 10 L5 20 L10 15')
})

test('ribbonPath traces the high edge then returns along the low edge', () => {
  expect(
    ribbonPath([
      { x: 0, low: 90, high: 10 },
      { x: 5, low: 80, high: 20 },
    ]),
  ).toBe('M0 10 L5 20 L5 80 L0 90 Z')
})

/* ── hourAtRatio / stepHour (shared pointer + keyboard addressing) ──── */

test('hourAtRatio snaps to the nearest hour of delivery', () => {
  expect(hourAtRatio(0, 23)).toBe(0)
  expect(hourAtRatio(1, 23)).toBe(23)
  expect(hourAtRatio(0.5, 23)).toBe(12) // 11.5 rounds up
})

test('hourAtRatio clamps a pointer in the axis gutters to the plotted range', () => {
  expect(hourAtRatio(-0.4, 23)).toBe(0)
  expect(hourAtRatio(1.4, 23)).toBe(23)
})

test('hourAtRatio survives a zero-width plot', () => {
  // The first paint, before the ResizeObserver has measured the box.
  expect(hourAtRatio(Number.POSITIVE_INFINITY, 23)).toBe(0)
  expect(hourAtRatio(Number.NaN, 23)).toBe(0)
})

test('stepHour enters from the near end when nothing is selected yet', () => {
  expect(stepHour(null, 1, 23)).toBe(0)
  expect(stepHour(null, -1, 23)).toBe(23)
})

test('stepHour steps one hour at a time and stops at the ends', () => {
  expect(stepHour(5, 1, 23)).toBe(6)
  expect(stepHour(5, -1, 23)).toBe(4)
  expect(stepHour(0, -1, 23)).toBe(0)
  expect(stepHour(23, 1, 23)).toBe(23)
})

/* ── errorScale ─────────────────────────────────────────────────────── */

test('errorScale keeps zero inside the domain even when every error is negative', () => {
  // January over-forecasts at every hour, so the bias series never crosses
  // zero — but the zero reference still has to be on the chart.
  const scale = errorScale([-6861, -2357])

  expect(scale.low).toBeLessThan(-6861)
  expect(scale.high).toBeGreaterThan(0)
})

test('errorScale does not round out to the next whole step', () => {
  // The panel is short and this month's errors sit heavily below zero.
  // Rounding the top out to the next 2,500 MW step (as the generation axis
  // does) would spend a third of the plot height on empty axis.
  const scale = errorScale([-6861, 2423])

  // niceScale would have rounded the top out to 5,000 MW. This stays just
  // above the data on both sides.
  expect(scale.high).toBeGreaterThan(2423)
  expect(scale.high).toBeLessThan(3000)
  expect(scale.low).toBeLessThan(-6861)
  expect(scale.low).toBeGreaterThan(-7500)
})

test('errorScale always labels zero — it is the reference, not a value', () => {
  expect(errorScale([-6861, 3652]).ticks).toContain(0)
  expect(errorScale([120, 300]).ticks).toContain(0)
})

test('errorScale brackets the widest error in either direction', () => {
  const scale = errorScale([-6861, 3652])

  expect(scale.low).toBeLessThan(-6861)
  expect(scale.high).toBeGreaterThan(3652)
})

test('errorScale keeps ticks on whole steps, evenly spaced, inside the domain', () => {
  const { low, high, ticks } = errorScale([-6861, 3652])
  const gaps = ticks.slice(1).map((tick, i) => tick - ticks[i])

  expect(new Set(gaps).size).toBe(1)
  expect(ticks.every((tick) => Number.isInteger(tick))).toBe(true)
  for (const tick of ticks) {
    expect(tick).toBeGreaterThanOrEqual(low)
    expect(tick).toBeLessThanOrEqual(high)
  }
})

test('errorScale never labels a tick "-0"', () => {
  for (const tick of errorScale([-6861, 3652]).ticks) {
    expect(Object.is(tick, -0)).toBe(false)
  }
})

test('errorScale falls back to a neutral axis with no finite data', () => {
  // A cutoff whose by_hour array is empty, or a day with no overlaid errors.
  expect(errorScale([])).toEqual({ low: -1000, high: 1000, ticks: [-1000, -500, 0, 500, 1000] })
  expect(errorScale([Number.NaN, Number.POSITIVE_INFINITY])).toEqual({
    low: -1000,
    high: 1000,
    ticks: [-1000, -500, 0, 500, 1000],
  })
})

test('errorScale does not collapse on an all-zero series', () => {
  const scale = errorScale([0, 0])

  expect(scale.high).toBeGreaterThan(0)
  expect(scale.low).toBeLessThan(0)
  expect(scale.ticks.length).toBeGreaterThan(1)
})

test('errorScale still produces a readable axis beyond the step ladder', () => {
  const scale = errorScale([-5_000_000, 5_000_000])

  expect(scale.high).toBeGreaterThanOrEqual(5_000_000)
  // A derived step, not the coarsest rung repeated — which would be 500 ticks.
  expect(scale.ticks.length).toBeGreaterThan(1)
  expect(scale.ticks.length).toBeLessThan(12)
  expect(scale.ticks.every((tick) => Number.isInteger(tick))).toBe(true)
})

/* ── overlayErrors ──────────────────────────────────────────────────── */

const hour = (h: number, actual: number | null, forecast: number | null) => ({
  hour: h,
  actual,
  forecast,
  risk_low: null,
  risk_high: null,
})

test('overlayErrors computes the signed metered − forecast error per hour', () => {
  expect(overlayErrors([hour(0, 16_000, 19_000), hour(1, 9_000, 8_000)])).toEqual([
    { hour: 0, error: -3000 },
    { hour: 1, error: 1000 },
  ])
})

test('overlayErrors drops an hour with no metered value rather than treating it as zero', () => {
  // The alternative would plot a fictitious -19,000 MW error.
  expect(overlayErrors([hour(0, null, 19_000), hour(1, 9_000, 8_000)])).toEqual([
    { hour: 1, error: 1000 },
  ])
})

test('overlayErrors drops an hour with no decision forecast', () => {
  expect(overlayErrors([hour(0, 16_000, null)])).toEqual([])
})

test('overlayErrors keeps the hour of delivery, not the array index', () => {
  // A short or non-contiguous day must still land each point at its true hour.
  expect(overlayErrors([hour(22, 1000, 900), hour(23, 1000, 1100)])).toEqual([
    { hour: 22, error: 100 },
    { hour: 23, error: -100 },
  ])
})

test('overlayErrors returns nothing for an empty day', () => {
  expect(overlayErrors([])).toEqual([])
})

/* ── signedTone ─────────────────────────────────────────────────────── */

test('signedTone marks a positive error as short (metered beat the forecast)', () => {
  expect(signedTone(1200)).toBe('value--under')
})

test('signedTone marks a negative error as long (the forecast ran high)', () => {
  expect(signedTone(-1806.23)).toBe('value--over')
})

test('signedTone leaves zero, negative zero and a missing value neutral', () => {
  expect(signedTone(0)).toBe('')
  expect(signedTone(-0)).toBe('')
  expect(signedTone(null)).toBe('')
})

/* ── errorTone ──────────────────────────────────────────────────────── */

test('errorTone marks metered above forecast as short', () => {
  expect(errorTone(16_000, 15_000)).toBe('value--under')
})

test('errorTone marks metered below forecast as long', () => {
  expect(errorTone(15_000, 16_000)).toBe('value--over')
})

test('errorTone leaves an exact hit neutral', () => {
  // A zero error is not a position; colouring it coral read as "short".
  expect(errorTone(15_000, 15_000)).toBe('')
})

test('errorTone leaves a missing value neutral', () => {
  expect(errorTone(null, 15_000)).toBe('')
  expect(errorTone(15_000, null)).toBe('')
  expect(errorTone(null, null)).toBe('')
})
