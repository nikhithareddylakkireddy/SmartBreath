"""Dependency-free development forecasting pipeline for the Streamlit dashboard.

This module mirrors the repository's JavaScript ML contracts without claiming
production accuracy. It only operates on explicitly labeled development or
simulated records and fails closed when data is invalid or insufficient.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


class ForecastDataError(ValueError):
    """Raised when a reading/history set cannot safely be forecast."""


def _number(value: Any, name: str, minimum: float | None = None, maximum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ForecastDataError(f"{name} is missing or non-numeric.")
    if minimum is not None and value < minimum:
        raise ForecastDataError(f"{name} cannot be below {minimum}.")
    if maximum is not None and value > maximum:
        raise ForecastDataError(f"{name} cannot exceed {maximum}.")
    return float(value)


def _timestamp(value: Any, name: str, now: datetime) -> datetime:
    if not isinstance(value, str):
        raise ForecastDataError(f"{name} is missing or invalid.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ForecastDataError(f"{name} is missing or invalid.") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    if parsed > now:
        raise ForecastDataError(f"{name} cannot be in the future.")
    return parsed.astimezone(timezone.utc)


def validate_reading(reading: dict[str, Any], now: datetime | None = None, max_age_hours: int | None = 48) -> dict[str, Any]:
    """Validate one environmental record and return normalized values."""
    now = now or datetime.now(timezone.utc)
    if not isinstance(reading, dict):
        raise ForecastDataError("Reading must be an object.")
    timestamp = _timestamp(reading.get("timestamp"), "timestamp", now)
    if max_age_hours is not None and (now - timestamp).total_seconds() > max_age_hours * 3600:
        raise ForecastDataError("Reading timestamp is stale.")
    normalized = dict(reading)
    normalized["timestamp"] = timestamp.isoformat().replace("+00:00", "Z")
    normalized["pm25"] = _number(reading.get("pm25"), "pm25", 0, 1000)
    normalized["pm10"] = _number(reading.get("pm10"), "pm10", 0, 2000)
    normalized["temperature"] = _number(reading.get("temperature"), "temperature", -60, 70)
    normalized["humidity"] = _number(reading.get("humidity"), "humidity", 0, 100)
    normalized["windSpeed"] = _number(reading.get("windSpeed"), "windSpeed", 0, 150)
    normalized["windDirection"] = _number(reading.get("windDirection"), "windDirection", 0, 360)
    return normalized


def validate_history(history: list[dict[str, Any]], now: datetime | None = None) -> list[dict[str, Any]]:
    if not isinstance(history, list):
        raise ForecastDataError("History must be a list.")
    validated = [validate_reading(item, now=now, max_age_hours=None) for item in history]
    ordered = sorted(validated, key=lambda item: item["timestamp"])
    if len({item["timestamp"] for item in ordered}) != len(ordered):
        raise ForecastDataError("History contains duplicate timestamps.")
    return ordered


def _features(reading: dict[str, Any], history: list[dict[str, Any]]) -> dict[str, float]:
    recent = [item["pm25"] for item in history[-3:]][::-1]
    recent_pm10 = [item["pm10"] for item in history[-3:]][::-1]
    if len(recent) < 3 or len(recent_pm10) < 3:
        raise ForecastDataError("Insufficient history: at least three prior readings are required.")
    timestamp = datetime.fromisoformat(reading["timestamp"].replace("Z", "+00:00"))
    return {
        "pm25": reading["pm25"],
        "pm10": reading["pm10"],
        "temperature": reading["temperature"],
        "humidity": reading["humidity"],
        "windSpeed": reading["windSpeed"],
        "hour": timestamp.hour,
        "dayOfWeek": timestamp.weekday(),
        "pm25Lag1": recent[0],
        "pm25Lag2": recent[1],
        "pm25Lag3": recent[2],
        "pm25RollingMean3": sum(recent) / 3,
        "pm25RollingStd3": math.sqrt(sum((value - sum(recent) / 3) ** 2 for value in recent) / 3),
        "pm10Lag1": recent_pm10[0],
        "pm10Lag2": recent_pm10[1],
        "pm10Lag3": recent_pm10[2],
    }


def build_training_rows(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = validate_history(history)
    rows = []
    for index in range(3, len(ordered) - 1):
        reading = ordered[index]
        features = _features(reading, ordered[:index])
        rows.append({
            "timestamp": reading["timestamp"],
            "features": features,
            "targetPM25": ordered[index + 1]["pm25"],
            "dataSourceType": reading.get("dataSourceType", "unknown"),
            "dataQuality": reading.get("dataQuality", "unclassified"),
        })
    if len(rows) < 6:
        raise ForecastDataError("Insufficient history for chronological train/validation/test data.")
    return rows


def chronological_split(rows: list[dict[str, Any]], train_ratio: float = 0.6, validation_ratio: float = 0.2) -> dict[str, list[dict[str, Any]]]:
    ordered = sorted(rows, key=lambda row: row["timestamp"])
    train_end = max(1, int(len(ordered) * train_ratio))
    validation_end = train_end + max(1, int(len(ordered) * validation_ratio))
    if validation_end >= len(ordered):
        raise ForecastDataError("Insufficient rows for chronological train/validation/test split.")
    return {"train": ordered[:train_end], "validation": ordered[train_end:validation_end], "test": ordered[validation_end:]}


def regression_metrics(actual: list[float], predicted: list[float]) -> dict[str, float]:
    if not actual or len(actual) != len(predicted):
        raise ForecastDataError("Metrics require equal non-empty actual and predicted values.")
    errors = [prediction - observed for observed, prediction in zip(actual, predicted)]
    mae = sum(abs(error) for error in errors) / len(errors)
    rmse = math.sqrt(sum(error * error for error in errors) / len(errors))
    mean_actual = sum(actual) / len(actual)
    total = sum((value - mean_actual) ** 2 for value in actual)
    r2 = 1 - (sum(error * error for error in errors) / total) if total else 0.0
    return {"mae": round(mae, 4), "rmse": round(rmse, 4), "r2": round(r2, 4)}


@dataclass
class PersistenceBaseline:
    model_name: str = "persistence-baseline"

    def predict(self, features: dict[str, float]) -> float:
        return features["pm25Lag1"]


@dataclass
class StumpBoostingModel:
    initial: float
    learning_rate: float
    stumps: list[dict[str, float | str]]
    model_name: str = "gradient-boosting-stumps-v1"

    def predict(self, features: dict[str, float]) -> float:
        value = self.initial
        for stump in self.stumps:
            branch = "leftValue" if features[stump["feature"]] <= stump["threshold"] else "rightValue"
            value += self.learning_rate * float(stump[branch])
        return max(0.0, min(1000.0, value))


def train_stump_model(rows: list[dict[str, Any]], rounds: int = 12, learning_rate: float = 0.08) -> StumpBoostingModel:
    if not rows:
        raise ForecastDataError("Model training requires rows.")
    names = list(rows[0]["features"])
    initial = sum(row["targetPM25"] for row in rows) / len(rows)
    predictions = [initial] * len(rows)
    stumps: list[dict[str, float | str]] = []
    for _ in range(rounds):
        residuals = [row["targetPM25"] - prediction for row, prediction in zip(rows, predictions)]
        best = None
        for name in names:
            values = sorted({row["features"][name] for row in rows})
            for left_threshold, right_threshold in zip(values, values[1:]):
                threshold = (left_threshold + right_threshold) / 2
                left = [residual for row, residual in zip(rows, residuals) if row["features"][name] <= threshold]
                right = [residual for row, residual in zip(rows, residuals) if row["features"][name] > threshold]
                if not left or not right:
                    continue
                left_value, right_value = sum(left) / len(left), sum(right) / len(right)
                error = sum(
                    (residual - (left_value if row["features"][name] <= threshold else right_value)) ** 2
                    for row, residual in zip(rows, residuals)
                )
                if best is None or error < best["error"]:
                    best = {"feature": name, "threshold": threshold, "leftValue": left_value, "rightValue": right_value, "error": error}
        if best is None:
            break
        stumps.append({key: value for key, value in best.items() if key != "error"})
        predictions = [
            prediction + learning_rate * (best["leftValue"] if row["features"][best["feature"]] <= best["threshold"] else best["rightValue"])
            for row, prediction in zip(rows, predictions)
        ]
    return StumpBoostingModel(initial, learning_rate, stumps)


def train_development_forecaster(history: list[dict[str, Any]]) -> dict[str, Any]:
    rows = build_training_rows(history)
    split = chronological_split(rows)
    baseline = PersistenceBaseline()
    model = train_stump_model(split["train"])
    return {
        "model": model,
        "baseline": baseline,
        "split": {key: len(value) for key, value in split.items()},
        "baselineMetrics": regression_metrics(
            [row["targetPM25"] for row in split["test"]],
            [baseline.predict(row["features"]) for row in split["test"]],
        ),
        "modelMetrics": regression_metrics(
            [row["targetPM25"] for row in split["test"]],
            [model.predict(row["features"]) for row in split["test"]],
        ),
        "dataStatus": "SYNTHETIC DEVELOPMENT DATA",
        "limitations": "Development metrics are from synthetic data and do not establish real-world accuracy.",
    }


def forecast_three_hours(current: dict[str, Any], history: list[dict[str, Any]], trained: dict[str, Any]) -> list[dict[str, Any]]:
    current = validate_reading(current)
    ordered = validate_history(history)
    if not isinstance(trained, dict) or not isinstance(trained.get("model"), StumpBoostingModel):
        raise ForecastDataError("Model artifact is missing or has an unsupported type.")
    values = []
    working = ordered + [current]
    for horizon in range(4):
        if horizon == 0:
            value = current["pm25"]
        else:
            future_timestamp = datetime.fromisoformat(working[-1]["timestamp"].replace("Z", "+00:00")) + timedelta(hours=1)
            next_reading = dict(current)
            next_reading["timestamp"] = future_timestamp.isoformat().replace("+00:00", "Z")
            next_reading["pm25"] = values[-1]["pm25"]
            next_reading["pm10"] = current["pm10"]
            features = _features(next_reading, working)
            value = trained["model"].predict(features)
            working.append(next_reading)
        values.append({"horizon": "Current" if horizon == 0 else f"+{horizon} hour{'s' if horizon > 1 else ''}", "pm25": round(value, 2), "modelName": trained["model"].model_name, "dataStatus": trained["dataStatus"], "simulated": True})
    return values


def create_synthetic_history(count: int = 96, school_id: str = "greenfield", start: datetime | None = None) -> list[dict[str, Any]]:
    start = start or datetime.now(timezone.utc) - timedelta(hours=count)
    history = []
    for index in range(count):
        timestamp = start + timedelta(hours=index)
        hour = timestamp.hour
        pm25 = 30 + (index % 12) * 2 + (18 if 7 <= hour <= 10 else 0) + (index % 5)
        history.append({
            "schoolId": school_id,
            "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
            "pm25": pm25,
            "pm10": round(pm25 * 1.25, 2),
            "temperature": round(22 + hour / 3, 2),
            "humidity": 55 + timestamp.weekday() % 4,
            "windSpeed": 2 + index % 4,
            "windDirection": (index * 30) % 360,
            "dataSourceType": "synthetic",
            "dataQuality": "synthetic-development-only",
            "simulated": True,
        })
    return history


__all__ = [
    "ForecastDataError",
    "create_synthetic_history",
    "forecast_three_hours",
    "regression_metrics",
    "train_development_forecaster",
    "validate_history",
    "validate_reading",
]
