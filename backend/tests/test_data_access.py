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
