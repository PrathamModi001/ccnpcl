"""Tests for the FastAPI app in backend.app.main."""

import pytest
from fastapi.testclient import TestClient

from app import data_access
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_day_endpoint_happy_path(client):
    r = client.get("/api/day", params={"date": "2026-01-05", "cutoff": "11:30"})
    assert r.status_code == 200 and len(r.json()["hours"]) == 24


def test_day_endpoint_out_of_range_returns_404(client):
    r = client.get("/api/day", params={"date": "2026-02-01", "cutoff": "11:30"})
    assert r.status_code == 404


def test_accuracy_endpoint_invalid_cutoff_returns_404(client):
    r = client.get("/api/accuracy", params={"cutoff": "13:00"})
    assert r.status_code == 404


def test_meta_endpoint_lists_cutoffs(client):
    r = client.get("/api/meta")
    assert r.json()["cutoffs"] == data_access.CUTOFF_TIMES
