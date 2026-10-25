/**
 * Thin typed client for the FastAPI backend (`backend/app/main.py`).
 *
 * Every response shape here mirrors a backend accessor in
 * `backend/app/data_access.py` exactly — if one changes, change both.
 */

/**
 * Falls back to the local Docker Compose backend so `npm run dev` works with
 * no `.env` file; `VITE_API_BASE` is set explicitly in Compose and on Vercel.
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(/\/+$/, '')

/** One hour of delivery: actual, the decision-time forecast, and its risk band. */
export interface DayHour {
  hour: number
  actual: number | null
  forecast: number | null
  risk_low: number | null
  risk_high: number | null
}

/** `GET /api/day` — the 24-hour view for one delivery date at one cutoff. */
export interface DayResponse {
  date: string
  cutoff: string
  hours: DayHour[]
}

/** Month-wide error for a single hour-of-delivery bucket. */
export interface AccuracyByHour {
  hour: number
  mae: number
  bias: number
  n: number
}

/** `GET /api/accuracy` — month-wide error metrics for one cutoff. */
export interface AccuracyResponse {
  mae: number
  rmse: number
  bias: number
  p90_abs_error: number
  pct_of_mean: number
  by_hour: AccuracyByHour[]
}

/** `GET /api/meta` — the selectable dates and the 8 real WINDFOR publish times. */
export interface MetaResponse {
  dates: string[]
  cutoffs: string[]
}

/**
 * Thrown for any non-2xx response. Carries the status so callers can tell a
 * 404 ("that date/cutoff isn't in the dataset") from a 500 or a network fault.
 */
export class ApiError extends Error {
  readonly status: number
  readonly url: string

  constructor(status: number, url: string, detail: string) {
    super(`${status} from ${url}${detail ? `: ${detail}` : ''}`)
    this.name = 'ApiError'
    this.status = status
    this.url = url
  }
}

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${new URLSearchParams(params)}` : ''
  const url = `${API_BASE}${path}${query}`

  const response = await fetch(url)
  if (!response.ok) {
    // The backend sends `{"error": "..."}` on 404; surface it if it's there.
    const detail = await response.text().catch(() => '')
    throw new ApiError(response.status, url, detail.slice(0, 200))
  }

  return (await response.json()) as T
}

export function fetchMeta(): Promise<MetaResponse> {
  return get<MetaResponse>('/api/meta')
}

export function fetchDay(date: string, cutoff: string): Promise<DayResponse> {
  return get<DayResponse>('/api/day', { date, cutoff })
}

export function fetchAccuracy(cutoff: string): Promise<AccuracyResponse> {
  return get<AccuracyResponse>('/api/accuracy', { cutoff })
}
