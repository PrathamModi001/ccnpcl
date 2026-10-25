"""One-off network fetch script for Elexon BMRS data.

Pulls the two whitelisted datasets for the wind-forecast-accuracy app:
- FUELHH (fuelType=WIND): half-hourly wind generation actuals for Jan 2026.
- WINDFOR: hourly wind generation forecasts, Dec 29 2025 - Feb 1 2026
  (the Dec 29-31 lookback covers decisions made on early January dates).

No API key is required for these public BMRS endpoints. This script only
calls the two whitelisted Elexon `stream` routes named above - no other
dataset - per the project's Global Constraints.

Not unit tested: this is a thin network I/O wrapper, validated by running
it against the live API and checking the resulting row counts.
"""

import json
from pathlib import Path

import requests

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
RAW_DIR = Path(__file__).parent / "raw"


def fetch_fuelhh() -> list[dict]:
    """Fetch half-hourly WIND generation actuals for January 2026."""
    url = f"{BASE_URL}/FUELHH/stream"
    params = {
        "fuelType": "WIND",
        "settlementDateFrom": "2026-01-01",
        "settlementDateTo": "2026-01-31",
    }
    response = requests.get(url, params=params)
    if response.status_code != 200:
        raise RuntimeError(
            f"FUELHH fetch failed: {response.status_code} {response.text}"
        )
    return response.json()


def fetch_windfor() -> list[dict]:
    """Fetch hourly wind generation forecasts, Dec 29 2025 - Feb 1 2026."""
    url = f"{BASE_URL}/WINDFOR/stream"
    params = {
        "publishDateTimeFrom": "2025-12-29T00:00:00Z",
        "publishDateTimeTo": "2026-02-01T00:00:00Z",
    }
    response = requests.get(url, params=params)
    if response.status_code != 200:
        raise RuntimeError(
            f"WINDFOR fetch failed: {response.status_code} {response.text}"
        )
    return response.json()


if __name__ == "__main__":
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    fuelhh_rows = fetch_fuelhh()
    (RAW_DIR / "fuelhh_jan2026.json").write_text(json.dumps(fuelhh_rows))
    print(f"Wrote {len(fuelhh_rows)} FUELHH rows to {RAW_DIR / 'fuelhh_jan2026.json'}")

    windfor_rows = fetch_windfor()
    (RAW_DIR / "windfor.json").write_text(json.dumps(windfor_rows))
    print(f"Wrote {len(windfor_rows)} WINDFOR rows to {RAW_DIR / 'windfor.json'}")
