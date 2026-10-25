"""Tests for the decision-forecast selection logic in pipeline.build_dataset."""

import pytest

from pipeline.build_dataset import (
    CUTOFF_TIMES,
    build_dataset,
    build_day_records,
    compute_metrics,
    compute_risk_band,
    hourly_actual,
    select_decision_forecast,
)
from pipeline.tests import fixtures


def test_excludes_leaked_rows():
    result = select_decision_forecast(
        fixtures.WINDFOR_WITH_LEAK, "2026-01-05T09:00:00Z", "2026-01-04T11:30:00Z"
    )
    assert result == fixtures.EXPECTED_NON_LEAKED_VALUE


def test_excludes_leaked_row_even_when_published_before_cutoff():
    # Isolates the leak clause (publishTime <= startTime) from the
    # cutoff clause: the leaked row here is NOT excluded by the cutoff
    # check alone (its publishTime is before the cutoff), so this test
    # fails if the leak clause is ever removed.
    result = select_decision_forecast(
        fixtures.WINDFOR_LEAK_WITHIN_CUTOFF, "2026-01-20T09:00:00Z", "2026-01-20T11:00:00Z"
    )
    assert result == fixtures.EXPECTED_LEAK_WITHIN_CUTOFF_VALUE


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


def test_build_day_records_jan1_has_full_coverage_from_lookback():
    records = build_day_records(
        fixtures.FUELHH_JAN, fixtures.WINDFOR_WITH_LOOKBACK, ["2026-01-01"], "11:30"
    )
    assert len(records) == 24
    assert all(r["forecast"] is not None for r in records)


def test_compute_metrics_uses_pct_of_mean_not_per_point_mape():
    records = fixtures.RECORDS_WITH_ZERO_GENERATION_HOUR
    metrics = compute_metrics(records)
    assert metrics["pct_of_mean"] == pytest.approx(fixtures.EXPECTED_PCT_OF_MEAN)


def test_compute_risk_band_buckets_by_hour_only():
    band = compute_risk_band(fixtures.RECORDS_TWO_HOURS_MULTIPLE_DAYS)
    assert set(band.keys()) == {
        h for r in fixtures.RECORDS_TWO_HOURS_MULTIPLE_DAYS for h in [r["hour"]]
    }


def test_build_dataset_has_all_eight_cutoffs():
    dataset = build_dataset(
        fixtures.FUELHH_JAN, fixtures.WINDFOR_WITH_LOOKBACK, ["2026-01-01", "2026-01-02"]
    )
    assert set(dataset["cutoffs"].keys()) == set(CUTOFF_TIMES)
