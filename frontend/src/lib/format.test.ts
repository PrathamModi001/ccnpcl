import { expect, test } from 'vitest'

import { formatDate, formatMW, formatPercent, formatSignedMW } from './format'

test('formatMW renders a human-readable MW value', () => {
  expect(formatMW(12345)).toBe('12,345 MW')
})

test('formatMW rounds to whole MW and keeps the unit', () => {
  expect(formatMW(1234.56)).toBe('1,235 MW')
  expect(formatMW(42)).toBe('42 MW')
  expect(formatMW(0)).toBe('0 MW')
})

test('formatMW keeps the sign on negative values (bias is signed)', () => {
  expect(formatMW(-312.4)).toBe('-312 MW')
})

test('formatMW renders a dash for missing/non-finite values', () => {
  expect(formatMW(Number.NaN)).toBe('—')
  expect(formatMW(Number.POSITIVE_INFINITY)).toBe('—')
})

/* ── formatSignedMW ─────────────────────────────────────────────────── */

test('formatSignedMW marks a positive value with an explicit plus', () => {
  // Mean bias is useless without its direction, and "1,806 MW" reads as a
  // magnitude. The sign has to be on the number itself.
  expect(formatSignedMW(1806)).toBe('+1,806 MW')
})

test('formatSignedMW keeps a negative value negative', () => {
  expect(formatSignedMW(-1806.23)).toBe('-1,806 MW')
})

test('formatSignedMW leaves an exact zero unsigned', () => {
  expect(formatSignedMW(0)).toBe('0 MW')
})

test('formatSignedMW does not sign a value that rounds to zero', () => {
  // "+0 MW" and "-0 MW" both claim a direction the rounded figure cannot show.
  expect(formatSignedMW(0.4)).toBe('0 MW')
  expect(formatSignedMW(-0.4)).toBe('0 MW')
})

test('formatSignedMW renders a dash for missing/non-finite values', () => {
  expect(formatSignedMW(Number.NaN)).toBe('—')
  expect(formatSignedMW(Number.NEGATIVE_INFINITY)).toBe('—')
})

/* ── formatPercent ──────────────────────────────────────────────────── */

test('formatPercent renders one decimal place and the unit', () => {
  // The backend's pct_of_mean is already scaled: 17.4248 means 17.4%.
  expect(formatPercent(17.424809238691637)).toBe('17.4%')
})

test('formatPercent keeps the decimal place on whole numbers', () => {
  // Fixed precision so the figure does not change width as the cutoff moves.
  expect(formatPercent(18)).toBe('18.0%')
  expect(formatPercent(0)).toBe('0.0%')
})

test('formatPercent never renders a negative zero', () => {
  expect(formatPercent(-0.02)).toBe('0.0%')
})

test('formatPercent renders a dash for missing/non-finite values', () => {
  expect(formatPercent(Number.NaN)).toBe('—')
  expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('—')
})

test('formatDate renders an ISO date readably', () => {
  expect(formatDate('2026-01-05')).toBe('Mon 5 Jan 2026')
})

test('formatDate is timezone-independent at month boundaries', () => {
  expect(formatDate('2026-01-01')).toBe('Thu 1 Jan 2026')
  expect(formatDate('2026-01-31')).toBe('Sat 31 Jan 2026')
})

test('formatDate returns the input unchanged when it is not an ISO date', () => {
  expect(formatDate('not-a-date')).toBe('not-a-date')
  expect(formatDate('')).toBe('')
})
