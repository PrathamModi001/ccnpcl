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
