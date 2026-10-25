/**
 * The methodology panel: what the two charts above actually mean, and where
 * they stop being trustworthy.
 *
 * It exists because the hard part of this app is not the charting — it is the
 * handful of market- and data-mechanics decisions behind the forecast series
 * (which snapshot a desk really had, which rows have to be thrown away, how
 * the risk band was estimated and how thin that estimate is). A reader who
 * cannot see those decisions has to take the chart on trust, so they are
 * written down next to it rather than left in a README.
 *
 * Static copy on purpose. Every figure the app has measured is already on
 * screen above; repeating any of it here would be a second, drifting data
 * display. The only numbers below are fixed properties of the dataset — the
 * eight publish times, the one anomaly, the 31 days of January.
 */
function HowThisWorksPanel() {
  return (
    <section className="panel" aria-labelledby="how-this-works">
      <div className="panel__head">
        <h2 className="panel__title" id="how-this-works">
          How this works
        </h2>
        <p className="panel__note">Method, and the limits of it</p>
      </div>

      <div className="notes">
        <article className="note">
          <h3 className="note__title">The question it answers</h3>
          <p>
            Not “how good is wind forecasting”, but{' '}
            <em>
              what forecast did this desk actually have in front of it at the decision point?
            </em>{' '}
            For delivery on day D, the app looks only at <code>WINDFOR</code>{' '}
            rows published on D−1 at or before the selected cutoff, and takes the latest
            publication for each hour of D. Anything published after the cutoff is information
            the desk did not have.
          </p>
          <p>
            Rows published <em>after the hour they forecast</em> are also excluded. Each
            snapshot carries a long window of hours, and some of those hours have already been
            delivered by the time it is published; keeping them would leak the outcome into the
            input, and the forecast would look far better than anything a desk could have
            acted on. That exclusion is the single most important condition in the pipeline.
          </p>
        </article>

        <article className="note">
          <h3 className="note__title">Why the cutoff is a control</h3>
          <p>
            All eight cutoffs above are times on D−1, so every one of them is a genuine
            day-ahead decision — moving the selector never turns this into a same-day forecast.
            What it changes is lead time: 02:30 is a much longer reach to the same delivery
            hours than 22:30 is. Sweeping it is the lead-time sensitivity study, done by hand —
            step towards 22:30 and the headline MAE falls, because there is less of the day
            left to be wrong about. Over the sweep, not necessarily at every click: two
            adjacent snapshots can carry nearly the same view of the next day.
          </p>
          <p>
            Only the real publish times are offered, because any clock time between two of them
            resolves to the earlier snapshot: a desk gating at 10:00 and one gating at 11:00
            are both working from the 09:30 forecast. Where exactly gate closure sits therefore
            does not change the answer — which is why this is a selector of eight real times
            rather than a continuous slider.
          </p>
        </article>

        <article className="note">
          <h3 className="note__title">The data underneath</h3>
          <p>
            Metered output is <code>FUELHH</code> (fuel type{' '}
            <code>WIND</code>), which is half-hourly, so each delivery hour is
            the mean of its two settlement periods. <code>WINDFOR</code> is
            hourly — not half-hourly, despite how it is often described — and is published in
            exactly eight snapshots a day: the eight times in the selector above.
          </p>
          <p>
            With one real exception. The “11:30” snapshot on 15 January was actually published
            at 12:25. Everything here is driven by each row’s own{' '}
            <code>publishTime</code> rather than by an assumed schedule, so
            that day is handled like any other — which is the point of mentioning it.
          </p>
        </article>

        <article className="note">
          <h3 className="note__title">The risk band, and what it is not</h3>
          <p>
            For each hour of delivery, the band is the empirical 5th and 95th percentile of
            (metered − forecast) at that hour across the whole of January, added to the hour’s
            forecast. It is bucketed by hour of delivery only, deliberately: once the cutoff is
            fixed, the forecast horizon is a function of the delivery hour anyway, so splitting
            by both would only fragment an already-thin month.
          </p>
          <p className="caveat">
            Based on 31 days, in-sample — illustrative of forecast risk, not a calibrated
            probabilistic model. The same January it is measured on is the January it is drawn
            over, so it cannot be read as a forward-looking confidence interval.
          </p>
          <p>
            Two consequences worth seeing rather than hiding. The band is{' '}
            <strong>not clamped at zero</strong>: it is a forecast plus an error percentile, so
            on low-wind hours its lower edge can fall below zero, which no wind farm can
            deliver. Clipping it would make the band look narrower than the evidence says it
            is.
          </p>
          <p>
            And a day can show <strong>many more “outside band” hours than one in ten</strong>.
            The percentiles pool every day in the month for that hour, so they describe a
            typical day, not this one. On a persistently windy or persistently becalmed day the
            whole profile sits off to one side and hour after hour falls outside — a run of
            breaches is usually one unusual day, not a forecast that failed twenty times.
          </p>
        </article>
      </div>
    </section>
  )
}

export default HowThisWorksPanel
