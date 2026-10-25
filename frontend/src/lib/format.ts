/**
 * Display formatting for the trading-desk UI.
 *
 * Convention: every power quantity renders in MW — Elexon's native unit — with
 * thousands separators and no decimals (never auto-switching to GW), so a
 * forecast ("12,345 MW"), an MAE ("948 MW") and a risk-band width ("2,104 MW")
 * can be compared by eye without a mental unit conversion.
 *
 * Note for signed quantities (e.g. mean bias): `formatMW` preserves a negative
 * sign but does not add a leading "+" — use `formatSignedMW` where the
 * direction is the point. Do not inline `.toFixed()` at a call site, or the
 * units drift apart across panels.
 */

const MW_FORMATTER = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

/** One decimal, always — a fixed width so the figure does not jitter as the
 *  cutoff selector changes it. */
const PERCENT_FORMATTER = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** Shown wherever a value is missing (null actual/forecast, undefined metric). */
export const EM_DASH = '—'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** `12345` → `"12,345 MW"`; non-finite input → `"—"`. */
export function formatMW(value: number): string {
  if (!Number.isFinite(value)) return EM_DASH
  const rounded = Math.round(value)
  // `rounded === 0` is also true for -0, which would otherwise render "-0 MW".
  return `${MW_FORMATTER.format(rounded === 0 ? 0 : rounded)} MW`
}

/**
 * `1806` → `"+1,806 MW"`; `-1806` → `"-1,806 MW"`; `0` → `"0 MW"`.
 *
 * For quantities where the direction carries the meaning — mean bias, or a
 * single hour's `metered − forecast` — a bare "1,806 MW" reads as a magnitude
 * and loses half the information. The sign is decided *after* rounding, so a
 * value that rounds to zero is left unsigned rather than claiming a direction
 * the displayed figure cannot support.
 */
export function formatSignedMW(value: number): string {
  if (!Number.isFinite(value)) return EM_DASH

  const rounded = Math.round(value)
  // formatMW already guards the "-0" case for the non-positive branch.
  return rounded > 0 ? `+${formatMW(rounded)}` : formatMW(rounded)
}

/**
 * `17.4248` → `"17.4%"`.
 *
 * Takes a value that is *already* a percentage, which is how the backend sends
 * `pct_of_mean` (17.42 means 17.4%) — it is not multiplied by 100 here.
 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return EM_DASH

  // Round before formatting so a tiny negative cannot render as "-0.0%".
  const rounded = Math.round(value * 10) / 10
  return `${PERCENT_FORMATTER.format(rounded === 0 ? 0 : rounded)}%`
}

/**
 * `"2026-01-05"` → `"Mon 5 Jan 2026"`.
 *
 * The weekday is part of the label on purpose: wind output and the demand it is
 * traded against both behave differently at weekends, so a trader reading a
 * single day's chart wants to know which kind of day it was.
 *
 * Computed from the ISO parts in UTC rather than via `new Date(iso)` +
 * `toLocaleDateString()`, which would render the previous day in any negative
 * UTC-offset timezone. Returns the input unchanged if it is not an ISO date.
 */
export function formatDate(iso: string): string {
  const match = ISO_DATE.exec(iso)
  if (!match) return iso

  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (Number.isNaN(date.getTime())) return iso

  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}
