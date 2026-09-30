"""Deterministic, dependency-free simulated sensor network for public demos."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

SCENARIO_VALUES = {
    "NORMAL": {"pm25": 18, "pm10": 31, "temperature": 26, "humidity": 58, "windSpeed": 2},
    "ELEVATED": {"pm25": 42, "pm10": 64, "temperature": 27, "humidity": 60, "windSpeed": 2},
    "HIGH": {"pm25": 82, "pm10": 118, "temperature": 28, "humidity": 63, "windSpeed": 3},
    "CRITICAL": {"pm25": 285, "pm10": 340, "temperature": 29, "humidity": 67, "windSpeed": 3},
}


def sensor_ids(configuration: dict[str, Any]) -> list[str]:
    return list(configuration.get("sensors") or [f"{configuration.get('schoolId', 'demo')}-01"])


def reading_for(
    configuration: dict[str, Any],
    sensor_id: str,
    scenario: str = "NORMAL",
    tick: int = 0,
    timestamp: datetime | None = None,
) -> dict[str, Any]:
    scenario = scenario if scenario in SCENARIO_VALUES else "NORMAL"
    values = dict(SCENARIO_VALUES[scenario])
    # Give each fictional sensor a stable, bounded offset without uncontrolled randomness.
    offset = (sum(ord(char) for char in sensor_id) % 3) - 1
    if scenario != "CRITICAL":
        values["pm25"] = max(0, values["pm25"] + offset + (tick % 2))
        values["pm10"] = max(0, values["pm10"] + offset + (tick % 2))
    stamp = timestamp or datetime.now(timezone.utc)
    return {
        "schoolId": configuration["schoolId"],
        "schoolName": configuration["schoolName"],
        "sensorId": sensor_id,
        "timestamp": stamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        **values,
        "windDirection": 180,
        "dataSource": "simulated-sensor",
        "dataSourceType": "synthetic",
        "simulated": True,
    }


def history_for(configuration: dict[str, Any], sensor_id: str, scenario: str = "NORMAL", count: int = 24) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    return [
        reading_for(configuration, sensor_id, scenario, tick=index, timestamp=now - timedelta(hours=count - index))
        for index in range(count)
    ]


def advance_scenario(scenario: str, tick: int) -> str:
    levels = ("NORMAL", "ELEVATED", "HIGH", "CRITICAL")
    return levels[min((levels.index(scenario) if scenario in levels else 0) + (tick % 4), 3)]
