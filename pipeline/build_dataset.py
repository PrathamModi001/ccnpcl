"""Decision-forecast selection logic for the wind-forecast-accuracy pipeline.

Given a day-ahead trading decision cutoff, this module answers the core
domain question: which WINDFOR forecast would a trader actually have
seen for a given target hour as of that cutoff, and what did FUELHH
actually record for that hour?

Pure logic over plain dicts/lists - no file I/O, no Elexon calls. (Task 4
adds dataset assembly, metrics, risk bands and a CLI to this module.)
"""

from datetime import datetime, timedelta

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
