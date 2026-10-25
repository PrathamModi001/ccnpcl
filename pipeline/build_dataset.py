"""Decision-forecast selection logic for the wind-forecast-accuracy pipeline.

Given a day-ahead trading decision cutoff, this module answers the core
domain question: which WINDFOR forecast would a trader actually have
seen for a given target hour as of that cutoff, and what did FUELHH
actually record for that hour?

Pure logic over plain dicts/lists - no file I/O, no Elexon calls, except
for the ``__main__`` CLI entrypoint at the bottom, which reads the raw
Elexon JSON pulled by ``fetch_elexon.py`` and writes the assembled
dataset artifact consumed by the backend.
"""

import json
import math
import statistics
from datetime import datetime, timedelta
from pathlib import Path

# The 8 fixed UTC publish slots WINDFOR normally uses each day. This is
# NOT used to filter or validate rows in select_decision_forecast - real
# publish times occasionally fall off this grid (see the 2026-01-15
# anomaly), so eligibility is always decided by comparing actual
# timestamps. It exists for callers (Task 4) that need to enumerate the
# standard decision cutoffs to build a dataset.
CUTOFF_TIMES: list[str] = [
    "02:30",
    "04:30",
    "07:30",
    "09:30",
    "11:30",
    "15:30",
    "18:30",
    "22:30",
]


def select_decision_forecast(
    windfor_rows: list[dict], target_hour_iso: str, cutoff_iso: str
) -> float | None:
    """Return the generation value a trader would have seen for
    ``target_hour_iso`` as of ``cutoff_iso``, or ``None`` if no eligible
    forecast exists.

    A row is eligible only if all of:
    - it targets the requested hour (``startTime == target_hour_iso``)
    - it was published at or before the cutoff (``publishTime <= cutoff_iso``)
    - it was published at or before its own target hour started
      (``publishTime <= startTime``) - a row published after the hour it
      forecasts already happened ("leaked") can never be what a trader
      saw in advance, no matter how recent its publishTime looks.

    Among eligible rows, the one with the latest ``publishTime`` wins
    (the most recent forecast the trader would have had in hand).
    """
    eligible = [
        row
        for row in windfor_rows
        if row["startTime"] == target_hour_iso
        and row["publishTime"] <= cutoff_iso
        and row["publishTime"] <= row["startTime"]
    ]
    if not eligible:
        return None
    latest = max(eligible, key=lambda row: row["publishTime"])
    return latest["generation"]


def hourly_actual(fuelhh_rows: list[dict], target_hour_iso: str) -> float | None:
    """Return the mean of the two half-hour FUELHH actuals making up the
    hour starting at ``target_hour_iso``, or ``None`` if either
    half-hour settlement period is missing.

    A genuine zero-generation hour (both half-hours report 0.0) returns
    0.0, not None - zero is a real reading, not missing data.
    """
    target_dt = datetime.fromisoformat(target_hour_iso.replace("Z", "+00:00"))
    second_half_iso = (target_dt + timedelta(minutes=30)).isoformat().replace(
        "+00:00", "Z"
    )

    first = next(
        (row for row in fuelhh_rows if row["startTime"] == target_hour_iso), None
    )
    second = next(
        (row for row in fuelhh_rows if row["startTime"] == second_half_iso), None
    )

    if first is None or second is None:
        return None
    return (first["generation"] + second["generation"]) / 2


def _percentile(values: list[float], pct: float) -> float:
    """Return the ``pct``-th percentile (0-100) of ``values`` using
    linear interpolation between the two closest ranks (the common
    "linear"/Excel-style method - e.g. numpy's default), rather than
    nearest-rank, so the result isn't forced onto one of the raw data
    points. Used for both ``p90_abs_error`` and the risk-band p5/p95.
    """
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (pct / 100) * (len(ordered) - 1)
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return ordered[int(rank)]
    fraction = rank - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def build_day_records(
    fuelhh_rows: list[dict],
    windfor_rows: list[dict],
    dates: list[str],
    cutoff_time: str,
) -> list[dict]:
    """Build one record per hour (0-23) of each date in ``dates``, for
    the decision made at ``cutoff_time`` (bare "HH:MM") on the
    preceding calendar day (D-1). Each record is
    ``{"date": str, "hour": int, "actual": float|None, "forecast": float|None}``.
    """
    records = []
    for date_str in dates:
        day_before = (
            datetime.fromisoformat(date_str) - timedelta(days=1)
        ).date().isoformat()
        cutoff_iso = f"{day_before}T{cutoff_time}:00Z"
        for hour in range(24):
            target_hour_iso = f"{date_str}T{hour:02d}:00:00Z"
            records.append(
                {
                    "date": date_str,
                    "hour": hour,
                    "actual": hourly_actual(fuelhh_rows, target_hour_iso),
                    "forecast": select_decision_forecast(
                        windfor_rows, target_hour_iso, cutoff_iso
                    ),
                }
            )
    return records


def compute_metrics(records: list[dict]) -> dict:
    """Compute headline accuracy metrics over ``records``, restricted
    to records where both ``actual`` and ``forecast`` are present.

    ``pct_of_mean`` is MAE as a percentage of the whole record set's
    mean actual generation (one constant denominator), NOT a
    per-point MAPE - a per-point MAPE would blow up (division by
    near-zero) on low/zero-generation hours.
    """
    valid = [
        r for r in records if r["actual"] is not None and r["forecast"] is not None
    ]
    if not valid:
        # No overlapping actual/forecast data at all (e.g. an early
        # cutoff with no eligible WINDFOR snapshot yet) - every metric
        # is undefined; report zeros rather than raising.
        return {
            "mae": 0.0,
            "rmse": 0.0,
            "bias": 0.0,
            "p90_abs_error": 0.0,
            "pct_of_mean": 0.0,
            "by_hour": [],
        }

    errors = [r["actual"] - r["forecast"] for r in valid]
    abs_errors = [abs(error) for error in errors]
    mean_actual = statistics.mean(r["actual"] for r in valid)

    by_hour_errors: dict[int, list[float]] = {}
    for r, error in zip(valid, errors):
        by_hour_errors.setdefault(r["hour"], []).append(error)
    by_hour = [
        {
            "hour": hour,
            "mae": statistics.mean(abs(error) for error in hour_errors),
            "bias": statistics.mean(hour_errors),
            "n": len(hour_errors),
        }
        for hour, hour_errors in sorted(by_hour_errors.items())
    ]

    mae = statistics.mean(abs_errors)
    # mean_actual == 0.0 only if every valid actual in the set is a
    # genuine zero-generation reading - guard the division rather than
    # raising, since pct_of_mean is otherwise undefined in that case.
    pct_of_mean = (mae / mean_actual * 100) if mean_actual else 0.0
    return {
        "mae": mae,
        "rmse": math.sqrt(statistics.mean(error**2 for error in errors)),
        "bias": statistics.mean(errors),
        "p90_abs_error": _percentile(abs_errors, 90),
        "pct_of_mean": pct_of_mean,
        "by_hour": by_hour,
    }


def compute_risk_band(records: list[dict]) -> dict[int, tuple[float, float]]:
    """Empirical (p5, p95) of ``actual - forecast``, bucketed by
    hour-of-delivery only (0-23) across every date present in
    ``records`` for that hour. Restricted to records where both
    ``actual`` and ``forecast`` are present.
    """
    by_hour_errors: dict[int, list[float]] = {}
    for r in records:
        if r["actual"] is None or r["forecast"] is None:
            continue
        by_hour_errors.setdefault(r["hour"], []).append(r["actual"] - r["forecast"])
    return {
        hour: (_percentile(errors, 5), _percentile(errors, 95))
        for hour, errors in by_hour_errors.items()
    }


def build_dataset(
    fuelhh_rows: list[dict], windfor_rows: list[dict], dates: list[str]
) -> dict:
    """Assemble the full dataset artifact: for every standard decision
    cutoff, each date's per-hour actual/forecast rows, month-wide
    accuracy metrics, and the per-hour risk band - exactly the shape
    Task 5's backend loader expects once serialized to JSON.
    """
    cutoffs = {}
    for cutoff_time in CUTOFF_TIMES:
        records = build_day_records(fuelhh_rows, windfor_rows, dates, cutoff_time)

        days: dict[str, list[dict]] = {}
        for r in records:
            days.setdefault(r["date"], []).append(
                {
                    "hour": r["hour"],
                    "actual": r["actual"],
                    "forecast": r["forecast"],
                }
            )

        risk_band = compute_risk_band(records)
        cutoffs[cutoff_time] = {
            "days": days,
            "accuracy": compute_metrics(records),
            "risk_band": {
                str(hour): [p5, p95] for hour, (p5, p95) in risk_band.items()
            },
        }
    return {"cutoffs": cutoffs}


if __name__ == "__main__":
    raw_dir = Path(__file__).parent / "raw"
    fuelhh = json.loads((raw_dir / "fuelhh_jan2026.json").read_text())
    windfor = json.loads((raw_dir / "windfor.json").read_text())

    january_dates = [f"2026-01-{day:02d}" for day in range(1, 32)]
    dataset = build_dataset(fuelhh, windfor, january_dates)

    out_path = Path(__file__).parent.parent / "backend" / "app" / "data" / "dataset.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(dataset, indent=2))
    print(f"Wrote dataset for {len(january_dates)} days to {out_path}")
