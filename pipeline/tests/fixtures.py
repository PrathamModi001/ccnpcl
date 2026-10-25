"""Hand-built fixture rows for pipeline.build_dataset tests.

Row shapes mirror the real Elexon rows (see pipeline/raw/windfor.json),
abstracted to what build_dataset actually reads:
- WINDFOR: {"publishTime": str, "startTime": str, "generation": float}
- FUELHH:  {"startTime": str, "generation": float}
All timestamps are ISO 8601 UTC strings, e.g. "2026-01-05T09:00:00Z".
"""

# --- WINDFOR fixtures -------------------------------------------------

# Target hour 2026-01-05T09:00:00Z: two valid pre-cutoff candidates plus
# one leaked row (published after its own startTime already passed).
# Selection must return the later valid candidate's value and must never
# return the leaked row's 9999.0, however "recent" its publishTime looks.
WINDFOR_WITH_LEAK = [
    {
        "publishTime": "2026-01-04T07:30:00Z",
        "startTime": "2026-01-05T09:00:00Z",
        "generation": 1100.0,
    },
    {
        "publishTime": "2026-01-04T09:30:00Z",
        "startTime": "2026-01-05T09:00:00Z",
        "generation": 1200.0,
    },
    {
        # Leaked: publishTime > startTime - published after the target
        # hour it forecasts had already happened.
        "publishTime": "2026-01-05T10:00:00Z",
        "startTime": "2026-01-05T09:00:00Z",
        "generation": 9999.0,
    },
]
EXPECTED_NON_LEAKED_VALUE = 1200.0

# Target hour 2026-01-15T13:00:00Z, standing in for the real 2026-01-15
# anomaly where the 11:30 WINDFOR snapshot was actually published at
# 12:25 (off the normal 8-slot publish grid). Selection must pick this
# 12:25 row over the earlier 11:30 one by comparing real timestamps, not
# by matching publishTime against the fixed CUTOFF_TIMES grid.
WINDFOR_OFF_GRID = [
    {
        "publishTime": "2026-01-15T09:30:00Z",
        "startTime": "2026-01-15T13:00:00Z",
        "generation": 2000.0,
    },
    {
        "publishTime": "2026-01-15T11:30:00Z",
        "startTime": "2026-01-15T13:00:00Z",
        "generation": 2100.0,
    },
    {
        # Off-grid anomaly: published 12:25, not on the 8-slot grid.
        "publishTime": "2026-01-15T12:25:00Z",
        "startTime": "2026-01-15T13:00:00Z",
        "generation": 2250.0,
    },
    {
        # After both the cutoff and the target hour - excluded.
        "publishTime": "2026-01-15T15:30:00Z",
        "startTime": "2026-01-15T13:00:00Z",
        "generation": 9999.0,
    },
]
EXPECTED_OFF_GRID_VALUE = 2250.0

# Target hour 2026-01-20T09:00:00Z with a cutoff AFTER the target hour
# (2026-01-20T11:00:00Z), unlike WINDFOR_WITH_LEAK above where the
# cutoff predates the target hour. There, the leaked row's publishTime
# is automatically excluded by the cutoff clause alone (publishTime >
# cutoff), so the leak clause (publishTime <= startTime) never gets
# independently exercised - deleting it wouldn't make that test fail.
# Here the leaked row's publishTime (09:15) is <= cutoff (11:00) but
# still > startTime (09:00), so only the leak clause excludes it; it
# would otherwise be the max-publishTime (and therefore winning)
# candidate. This isolates the leak clause from the cutoff clause.
WINDFOR_LEAK_WITHIN_CUTOFF = [
    {
        "publishTime": "2026-01-20T07:30:00Z",
        "startTime": "2026-01-20T09:00:00Z",
        "generation": 800.0,
    },
    {
        # Leaked (publishTime > startTime) but still <= cutoff, and its
        # publishTime is later than the valid row's above - without the
        # leak clause this would be the winning candidate.
        "publishTime": "2026-01-20T09:15:00Z",
        "startTime": "2026-01-20T09:00:00Z",
        "generation": 9999.0,
    },
]
EXPECTED_LEAK_WITHIN_CUTOFF_VALUE = 800.0

# --- FUELHH fixtures --------------------------------------------------

# A normal hour: two half-hour settlement periods that should average.
FUELHH_PAIR = [
    {"startTime": "2026-01-05T09:00:00Z", "generation": 1000.0},
    {"startTime": "2026-01-05T09:30:00Z", "generation": 1200.0},
]
EXPECTED_HOURLY_AVERAGE = 1100.0

# A genuine zero-generation hour: both half-hours report 0.0 (not
# missing data) - hourly_actual must return 0.0, not None.
FUELHH_ZERO_HOUR = [
    {"startTime": "2026-01-28T15:00:00Z", "generation": 0.0},
    {"startTime": "2026-01-28T15:30:00Z", "generation": 0.0},
]

# --- Task 4 fixtures: build_day_records / build_dataset lookback -----

# A single Dec-31 WINDFOR snapshot (published 09:30, before the
# "11:30" D-1 cutoff used by the lookback test) that covers all 24
# target hours of 2026-01-01. This is the lookback scenario: Jan 1's
# decision-time forecast comes from a D-1 (Dec 31) snapshot, same as
# any other day - there's nothing special in the selection logic, this
# fixture just has to actually supply full 24h coverage for that one
# publish/cutoff combination. generation = 1000.0 + hour*5.0, a plain
# formula (not reverse-engineered from the implementation) chosen only
# so each row has a distinct, traceable value.
WINDFOR_WITH_LOOKBACK = [
    {
        "publishTime": "2025-12-31T09:30:00Z",
        "startTime": f"2026-01-01T{hour:02d}:00:00Z",
        "generation": 1000.0 + hour * 5.0,
    }
    for hour in range(24)
]

# FUELHH half-hourly actuals covering all 24 hours of 2026-01-01 and
# 2026-01-02 (two full days, 48 half-hour rows each). Both half-hours
# of a given hour carry the same value so hourly_actual's average is
# just that value - generation = 500.0 + hour*10.0 for Jan 1,
# 1500.0 + hour*10.0 for Jan 2 (offset so the two days are
# distinguishable), both plain formulas chosen for traceability, not
# derived from the implementation.
FUELHH_JAN = [
    {
        "startTime": f"2026-01-01T{hour:02d}:{minute:02d}:00Z",
        "generation": 500.0 + hour * 10.0,
    }
    for hour in range(24)
    for minute in (0, 30)
] + [
    {
        "startTime": f"2026-01-02T{hour:02d}:{minute:02d}:00Z",
        "generation": 1500.0 + hour * 10.0,
    }
    for hour in range(24)
    for minute in (0, 30)
]

# --- Task 4 fixtures: compute_metrics pct_of_mean ---------------------

# Three hand-picked {date, hour, actual, forecast} records, one with a
# genuine zero-generation actual (0.0) - this would make a per-point
# MAPE blow up (division by zero), which is exactly why pct_of_mean
# must be mae / mean(actuals) * 100 using one constant denominator
# instead. Hand-computed below:
#   mean(actuals) = (0.0 + 100.0 + 200.0) / 3 = 100.0
#   abs errors    = |0-10|, |100-70|, |200-220| = 10.0, 30.0, 20.0
#   mae           = (10.0 + 30.0 + 20.0) / 3 = 20.0
#   pct_of_mean   = mae / mean(actuals) * 100 = 20.0 / 100.0 * 100 = 20.0
RECORDS_WITH_ZERO_GENERATION_HOUR = [
    {"date": "2026-01-01", "hour": 0, "actual": 0.0, "forecast": 10.0},
    {"date": "2026-01-01", "hour": 1, "actual": 100.0, "forecast": 70.0},
    {"date": "2026-01-01", "hour": 2, "actual": 200.0, "forecast": 220.0},
]
EXPECTED_PCT_OF_MEAN = 20.0

# --- Task 4 fixtures: compute_risk_band hour-only bucketing -----------

# Records spanning exactly two distinct hour-of-delivery values (5 and
# 10) across three/two different dates respectively. Proves
# compute_risk_band buckets by hour-of-delivery only: the resulting
# band dict must have exactly the keys {5, 10}, regardless of how many
# distinct dates contributed to each bucket.
RECORDS_TWO_HOURS_MULTIPLE_DAYS = [
    {"date": "2026-01-01", "hour": 5, "actual": 100.0, "forecast": 90.0},
    {"date": "2026-01-02", "hour": 5, "actual": 110.0, "forecast": 100.0},
    {"date": "2026-01-03", "hour": 5, "actual": 90.0, "forecast": 95.0},
    {"date": "2026-01-01", "hour": 10, "actual": 200.0, "forecast": 210.0},
    {"date": "2026-01-02", "hour": 10, "actual": 205.0, "forecast": 200.0},
]
