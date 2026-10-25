import { expect, test } from 'vitest'

import { errorTone, linePath, niceScale, ribbonPath, runsOf } from './chart'

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
