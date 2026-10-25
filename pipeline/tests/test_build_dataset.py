"""Tests for the decision-forecast selection logic in pipeline.build_dataset."""

from pipeline.build_dataset import select_decision_forecast, hourly_actual
from pipeline.tests import fixtures


def test_excludes_leaked_rows():
    result = select_decision_forecast(
        fixtures.WINDFOR_WITH_LEAK, "2026-01-05T09:00:00Z", "2026-01-04T11:30:00Z"
    )
    assert result == fixtures.EXPECTED_NON_LEAKED_VALUE


def test_picks_latest_eligible_publish_including_off_grid():
    result = select_decision_forecast(
        fixtures.WINDFOR_OFF_GRID, "2026-01-15T13:00:00Z", "2026-01-15T12:30:00Z"
    )
    assert result == fixtures.EXPECTED_OFF_GRID_VALUE


def test_hourly_actual_averages_half_hours():
    result = hourly_actual(fixtures.FUELHH_PAIR, "2026-01-05T09:00:00Z")
    assert result == fixtures.EXPECTED_HOURLY_AVERAGE


def test_hourly_actual_handles_zero_generation():
    result = hourly_actual(fixtures.FUELHH_ZERO_HOUR, "2026-01-28T15:00:00Z")
    assert result == 0.0
