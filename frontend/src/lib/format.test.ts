import { expect, test } from 'vitest'

import { formatDate, formatMW } from './format'

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
