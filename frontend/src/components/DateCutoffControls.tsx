import { formatDate } from '../lib/format'

/**
 * The controls strip: which delivery day, and which decision point.
 *
 * Deliberately not a generic filter bar. The cutoff is a segmented control
 * rather than a second dropdown because the 8 WINDFOR publish times are a
 * fixed, meaningful set a desk learns by heart — they want to see all of them
 * at once and feel which one they are standing on, not open a menu to find out.
 *
 * Markup is the `.field` / `.select` / `.chip-row` / `.label-micro` primitives
 * from styles/primitives.css; nothing is styled locally.
 */
interface DateCutoffControlsProps {
  /** Selectable delivery days, ISO `YYYY-MM-DD`, from `fetchMeta().dates`. */
  dates: string[]
  /** The real WINDFOR publish times, `HH:MM` UTC, from `fetchMeta().cutoffs`. */
  cutoffs: string[]
  selectedDate: string
  selectedCutoff: string
  onDateChange: (date: string) => void
  onCutoffChange: (cutoff: string) => void
}

function DateCutoffControls({
  dates,
  cutoffs,
  selectedDate,
  selectedCutoff,
  onDateChange,
  onCutoffChange,
}: DateCutoffControlsProps) {
  // Before `fetchMeta` lands there is nothing to choose from; keep the strip's
  // shape (so the page doesn't jump) but make the empty state explicit.
  const pending = dates.length === 0

  return (
    <section className="controls" aria-label="Delivery day and decision cutoff">
      <div className="field">
        <label className="label-micro" htmlFor="date">
          Delivery day
        </label>
        <select
          className="select"
          id="date"
          value={selectedDate}
          disabled={pending}
          onChange={(event) => onDateChange(event.target.value)}
        >
          {pending ? (
            <option value="">Loading…</option>
          ) : (
            dates.map((option) => (
              <option key={option} value={option}>
                {formatDate(option)}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="field">
        <span className="label-micro" id="cutoff-label">
          Decision cutoff (D−1, UTC)
        </span>
        <div className="chip-row" role="group" aria-labelledby="cutoff-label">
          {cutoffs.map((option) => (
            <button
              key={option}
              className="chip"
              type="button"
              aria-pressed={option === selectedCutoff}
              onClick={() => onCutoffChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <p className="panel__note">
        {selectedDate ? (
          <>
            Showing {formatDate(selectedDate)} as decided at {selectedCutoff} the day before.
            Only the 8 real WINDFOR publish times are selectable — there is no forecast to
            choose between them.
          </>
        ) : (
          'Loading the available delivery days…'
        )}
      </p>
    </section>
  )
}

export default DateCutoffControls
