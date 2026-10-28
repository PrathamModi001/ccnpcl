"""Data access layer for the wind forecast dataset artifact.

Reads backend/app/data/dataset.json (written by pipeline/build_dataset.py,
Task 4) and exposes it through small accessor functions consumed by the
FastAPI routes in backend/app/main.py.

Note: this module defines its own CUTOFF_TIMES constant rather than
importing it from pipeline.build_dataset. backend/ deploys as its own
standalone Vercel project (root directory "backend") and cannot import
from the sibling pipeline/ package at runtime, so the 8 cutoff times are
intentionally duplicated here.
"""

import json
from functools import lru_cache
from pathlib import Path

CUTOFF_TIMES = [
    "02:30",
    "04:30",
    "07:30",
    "09:30",
    "11:30",
    "15:30",
    "18:30",
    "22:30",
]

DATA_PATH = Path(__file__).parent / "data" / "dataset.json"


def _resolve_data_path() -> Path:
    if DATA_PATH.exists():
        return DATA_PATH
    fallbacks = [
        Path(__file__).resolve().parent.parent.parent / "backend" / "app" / "data" / "dataset.json",
        Path.cwd() / "backend" / "app" / "data" / "dataset.json",
        Path.cwd() / "app" / "data" / "dataset.json",
        Path.cwd() / "data" / "dataset.json",
    ]
    for p in fallbacks:
        if p.exists():
            return p
    return DATA_PATH


@lru_cache(maxsize=1)
def load_dataset() -> dict:
    """Load and cache the dataset artifact from disk."""
    path = _resolve_data_path()
    with open(path) as f:
        return json.load(f)


def get_day(date: str, cutoff: str) -> dict | None:
    """Return the 24-hour view for one date/cutoff combination.

    Returns None if the cutoff is not a known cutoff time or the date is
    not present in the dataset's days for that cutoff.
    """
    if cutoff not in CUTOFF_TIMES:
        return None

    dataset = load_dataset()
    cutoff_block = dataset["cutoffs"].get(cutoff)
    if cutoff_block is None:
        return None

    days = cutoff_block["days"]
    if date not in days:
        return None

    risk_band = cutoff_block["risk_band"]
    hours = []
    for entry in days[date]:
        hour = entry["hour"]
        forecast = entry["forecast"]
        actual = entry["actual"]

        band = None if forecast is None else risk_band.get(str(hour))

        if band is None:
            risk_low = None
            risk_high = None
        else:
            risk_low = forecast + band[0]
            risk_high = forecast + band[1]

        hours.append(
            {
                "hour": hour,
                "actual": actual,
                "forecast": forecast,
                "risk_low": risk_low,
                "risk_high": risk_high,
            }
        )

    return {"date": date, "cutoff": cutoff, "hours": hours}


def get_accuracy(cutoff: str) -> dict | None:
    """Return the month-wide accuracy block for one cutoff."""
    if cutoff not in CUTOFF_TIMES:
        return None

    dataset = load_dataset()
    cutoff_block = dataset["cutoffs"].get(cutoff)
    if cutoff_block is None:
        return None

    return cutoff_block["accuracy"]


def get_meta() -> dict:
    """Return the set of dates and cutoffs available in the dataset."""
    dataset = load_dataset()

    dates: set[str] = set()
    for cutoff_block in dataset["cutoffs"].values():
        dates.update(cutoff_block["days"].keys())

    return {"dates": sorted(dates), "cutoffs": CUTOFF_TIMES}
