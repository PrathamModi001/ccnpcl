"""Tests for backend.app.data_access."""

from app import data_access


def test_get_day_returns_24_hours_with_risk_band():
    result = data_access.get_day("2026-01-05", "11:30")
    assert len(result["hours"]) == 24
    assert all("risk_low" in h and "risk_high" in h for h in result["hours"])


def test_get_day_out_of_range_date_returns_none():
    assert data_access.get_day("2026-02-01", "11:30") is None


def test_get_day_invalid_cutoff_returns_none():
    assert data_access.get_day("2026-01-05", "13:00") is None


def test_get_accuracy_returns_month_wide_metrics():
    result = data_access.get_accuracy("11:30")
    assert "mae" in result and "by_hour" in result and len(result["by_hour"]) == 24


def test_get_day_missing_risk_band_key_returns_none_for_risk(monkeypatch):
    """If an hour has a forecast but no risk_band entry (e.g. every date's
    actual was null for that hour-of-delivery, so compute_risk_band never
    populated it), get_day must not raise -- it should treat risk_low/
    risk_high as None for that hour, same as the forecast-is-None case.
    """

    def fake_load_dataset():
        return {
            "cutoffs": {
                "11:30": {
                    "days": {
                        "2026-01-05": [
                            {"hour": 0, "actual": 100.0, "forecast": 200.0},
                        ]
                    },
                    "accuracy": {},
                    "risk_band": {},  # no "0" key, even though hour 0 has a forecast
                }
            }
        }

    monkeypatch.setattr(data_access, "load_dataset", fake_load_dataset)

    result = data_access.get_day("2026-01-05", "11:30")

    assert result is not None
    assert result["hours"][0]["forecast"] == 200.0
    assert result["hours"][0]["risk_low"] is None
    assert result["hours"][0]["risk_high"] is None
