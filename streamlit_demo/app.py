"""Smart Breath's additional local/public Streamlit demonstration dashboard."""

from __future__ import annotations

import csv
import io
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from model.forecasting import (  # noqa: E402
    ForecastDataError,
    create_synthetic_history,
    forecast_three_hours,
    train_development_forecaster,
)


DEMO_MODE = os.getenv("SMARTBREATH_DEMO_MODE", "public").strip().lower()
if DEMO_MODE not in {"public", "local"}:
    DEMO_MODE = "public"
BACKEND_URL = os.getenv("SMARTBREATH_BACKEND_URL", "http://localhost:3000").rstrip("/")
REQUEST_TIMEOUT = 5
CONFIG_PATH = Path(__file__).resolve().parents[1] / "data" / "school-configurations.json"
RISK_LEVELS = ("NORMAL", "ELEVATED", "HIGH", "CRITICAL")
RISK_COLORS = {
    "NORMAL": "🟢",
    "ELEVATED": "🟡",
    "HIGH": "🟠",
    "CRITICAL": "🔴",
}
SCENARIOS = {
    "NORMAL": {"pm25": 18, "pm10": 31, "temperature": 26, "humidity": 58, "windSpeed": 2},
    "ELEVATED": {"pm25": 42, "pm10": 64, "temperature": 27, "humidity": 60, "windSpeed": 2},
    "HIGH": {"pm25": 82, "pm10": 118, "temperature": 28, "humidity": 63, "windSpeed": 3},
    "CRITICAL": {"pm25": 285, "pm10": 340, "temperature": 29, "humidity": 67, "windSpeed": 3},
}
SIMULATED_RECOMMENDATIONS = [
    {
        "priority": "High",
        "title": "Shift outdoor activities indoors",
        "detail": "Move recess and physical activity indoors while air quality is elevated.",
    },
    {
        "priority": "High",
        "title": "Activate filtered ventilation windows",
        "detail": "Keep filtration systems running during the simulated event.",
    },
    {
        "priority": "Medium",
        "title": "Notify parent communication channels",
        "detail": "Use institution-approved communication procedures only.",
    },
    {
        "priority": "Medium",
        "title": "Review bus-idling protocols",
        "detail": "Reduce concentrated pollution around school entrances.",
    },
]

st.set_page_config(page_title="Smart Breath | Advanced Demo", page_icon="🌬️", layout="wide")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_school_configurations() -> list[dict[str, Any]]:
    try:
        with CONFIG_PATH.open(encoding="utf-8") as config_file:
            configurations = json.load(config_file)
        return configurations if isinstance(configurations, list) else []
    except (OSError, json.JSONDecodeError):
        return []


SCHOOL_CONFIGURATIONS = load_school_configurations()
SCHOOL_BY_ID = {item.get("schoolId"): item for item in SCHOOL_CONFIGURATIONS}
DEFAULT_SCHOOL_ID = os.getenv("SMARTBREATH_SCHOOL_ID", "greenfield")
if DEFAULT_SCHOOL_ID not in SCHOOL_BY_ID and SCHOOL_BY_ID:
    DEFAULT_SCHOOL_ID = next(iter(SCHOOL_BY_ID))


def school_name(school_id: str) -> str:
    return SCHOOL_BY_ID.get(school_id, {}).get("schoolName", school_id.replace("-", " ").title())


def local_user(school_id: str) -> dict[str, Any]:
    return {
        "sub": os.getenv("SMARTBREATH_LOCAL_SUB", "local-admin"),
        "schoolId": school_id,
        "groups": ["school-administrator"],
    }


def backend_request(method: str, path: str, school_id: str, **kwargs: Any) -> Any:
    headers = kwargs.pop("headers", {})
    headers["x-local-user"] = json.dumps(local_user(school_id))
    response = requests.request(
        method,
        f"{BACKEND_URL}{path}",
        headers=headers,
        timeout=REQUEST_TIMEOUT,
        **kwargs,
    )
    response.raise_for_status()
    return response.json()


def scenario_reading(school_id: str, level: str, timestamp: str | None = None) -> dict[str, Any]:
    values = SCENARIOS[level]
    return {
        "schoolId": school_id,
        "sensorId": "streamlit-demo-sensor-001",
        "timestamp": timestamp or now_iso(),
        **values,
        "windDirection": 180,
        "dataSource": "streamlit-public-demo",
        "simulated": True,
    }


def forecast_for(level: str, current_pm25: int) -> list[dict[str, Any]]:
    if level == "CRITICAL":
        values = [current_pm25, 280, 265, 240]
    elif level == "HIGH":
        values = [current_pm25, 78, 73, 68]
    elif level == "ELEVATED":
        values = [current_pm25, 40, 38, 35]
    else:
        values = [current_pm25, 17, 16, 16]
    return [{"horizon": label, "pm25": value, "simulated": True}
            for label, value in zip(("Current", "+1 hour", "+2 hours", "+3 hours"), values)]


def fallback_forecast(level: str, current_pm25: int) -> list[dict[str, Any]]:
    return [
        {**item, "modelName": "deterministic-demo-fallback", "dataStatus": "FALLBACK"}
        for item in forecast_for(level, current_pm25)
    ]


def build_development_forecast(reading: dict[str, Any], history: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    try:
        trained = train_development_forecaster(history)
        return forecast_three_hours(reading, history, trained), {
            "modelName": trained["model"].model_name,
            "baselineMetrics": trained["baselineMetrics"],
            "modelMetrics": trained["modelMetrics"],
            "split": trained["split"],
            "dataStatus": trained["dataStatus"],
            "limitations": trained["limitations"],
        }
    except ForecastDataError as error:
        return fallback_forecast(risk_label(None, reading), int(reading.get("pm25", 0))), {
            "modelName": "deterministic-demo-fallback",
            "baselineMetrics": None,
            "modelMetrics": None,
            "split": None,
            "dataStatus": "FALLBACK",
            "limitations": f"Forecast fallback: {error}",
        }


def simulated_demo_response(school_id: str, level: str) -> dict[str, Any]:
    timestamp = now_iso()
    reading = scenario_reading(school_id, level, timestamp)
    if level != "CRITICAL":
        return {
            "reading": reading,
            "risk": {
                "schoolId": school_id,
                "currentRisk": level.lower(),
                "predictedRisk": level.lower(),
                "severity": level.lower(),
                "reason": f"SIMULATED DEMO scenario selected: {level} monitoring state.",
                "confidence": 1,
                "policyVersion": "streamlit-demo",
                "evaluatedAt": timestamp,
                "simulated": True,
            },
            "recommendations": SIMULATED_RECOMMENDATIONS,
            "simulated": True,
        }

    alert_id = f"public-demo-alert-{school_id}-285"
    alert = {
        "alertId": alert_id,
        "schoolId": school_id,
        "severity": "critical",
        "pollutant": "PM2.5",
        "currentValue": 285,
        "threshold": 150,
        "message": "[SIMULATED DEMO] Critical air-quality scenario. Follow the school protective-action plan.",
        "recommendedActions": [item["title"] for item in SIMULATED_RECOMMENDATIONS],
        "status": "DELIVERED",
        "createdAt": timestamp,
        "queuedAt": timestamp,
        "deliveryAttemptedAt": timestamp,
        "deliveredAt": timestamp,
        "acknowledgedAt": None,
        "simulated": True,
    }
    return {
        "reading": reading,
        "risk": {
            "schoolId": school_id,
            "currentRisk": "critical",
            "predictedRisk": "critical",
            "severity": "critical",
            "reason": "SIMULATED DEMO scenario: PM2.5 is 285 and the school policy marks this as critical.",
            "confidence": 1,
            "policyVersion": "streamlit-demo",
            "evaluatedAt": timestamp,
            "simulated": True,
        },
        "alert": alert,
        "job": {"alertId": alert_id, "simulated": True, "localProviderMode": "LOCAL_MOCK"},
        "recommendations": SIMULATED_RECOMMENDATIONS,
        "localProviderMode": "LOCAL_MOCK",
        "simulated": True,
    }


def simulated_audit(alert: dict[str, Any]) -> list[dict[str, Any]]:
    timestamp = alert.get("createdAt", now_iso())
    return [
        {
            "eventId": f"streamlit-{status.lower()}-{alert['alertId']}",
            "schoolId": alert["schoolId"],
            "eventType": f"alert.{status.lower()}",
            "timestamp": timestamp,
            "actorSource": "streamlit-public-demo",
            "relatedAlertId": alert["alertId"],
            "details": {"status": status},
            "simulated": True,
        }
        for status in ("created", "queued", "delivered")
    ]


def risk_label(risk: dict[str, Any] | None, reading: dict[str, Any] | None) -> str:
    if risk and risk.get("currentRisk"):
        return str(risk["currentRisk"]).upper()
    if reading:
        pm25 = reading.get("pm25", 0)
        # Display-only fallback for a local reading when the backend has no risk record.
        thresholds = SCHOOL_BY_ID.get(reading.get("schoolId"), {}).get("thresholds", {})
        if pm25 >= thresholds.get("pm25Critical", 150):
            return "CRITICAL"
        if pm25 >= thresholds.get("pm25High", 55):
            return "HIGH"
        if pm25 >= thresholds.get("pm25Watch", 35):
            return "ELEVATED"
    return "NORMAL"


def load_local_state(school_id: str) -> None:
    state = st.session_state
    state["backend_error"] = None
    try:
        state["health"] = backend_request("GET", "/api/health", school_id)
        state["recommendations"] = backend_request("GET", "/api/recommendations", school_id)
        state["alerts"] = backend_request("GET", f"/api/schools/{school_id}/alerts", school_id)
        state["audit"] = backend_request("GET", f"/api/schools/{school_id}/audit", school_id)
        readings = backend_request("GET", f"/api/schools/{school_id}/readings", school_id)
        if readings:
            state["history"] = readings[:-1]
            state["reading"] = readings[-1]
            state["forecast"], state["model_info"] = build_development_forecast(
                state["reading"], state["history"]
            )
    except requests.RequestException as error:
        state["backend_error"] = str(error)


def initialize_state() -> None:
    defaults = {
        "school_id": DEFAULT_SCHOOL_ID,
        "scenario": "NORMAL",
        "reading": None,
        "risk": None,
        "alert": None,
        "audit": [],
        "alerts": [],
        "recommendations": [],
        "forecast": [],
        "history": [],
        "model_info": {},
        "demo_response": None,
        "health": None,
        "backend_error": None,
        "demo_error": None,
        "ack_error": None,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)
    if st.session_state["health"] is not None:
        return
    if DEMO_MODE == "public":
        st.session_state["health"] = {"status": "ok", "service": "public-demo"}
        st.session_state["history"] = create_synthetic_history(school_id=st.session_state["school_id"])
        st.session_state["reading"] = scenario_reading(st.session_state["school_id"], "NORMAL")
        st.session_state["recommendations"] = SIMULATED_RECOMMENDATIONS
        st.session_state["forecast"], st.session_state["model_info"] = build_development_forecast(
            st.session_state["reading"], st.session_state["history"]
        )
    else:
        load_local_state(st.session_state["school_id"])


def apply_simulated_scenario(level: str) -> None:
    response = simulated_demo_response(st.session_state["school_id"], level)
    st.session_state["scenario"] = level
    st.session_state["reading"] = response["reading"]
    st.session_state["risk"] = response["risk"]
    st.session_state["recommendations"] = response["recommendations"]
    if level == "CRITICAL":
        st.session_state["forecast"] = fallback_forecast(level, response["reading"]["pm25"])
        st.session_state["model_info"] = {
            "modelName": "deterministic-demo-fallback",
            "baselineMetrics": None,
            "modelMetrics": None,
            "split": None,
            "dataStatus": "SIMULATED DEMO",
            "limitations": "Critical judge scenario remains deterministic and is not altered by model output.",
        }
    else:
        st.session_state["forecast"], st.session_state["model_info"] = build_development_forecast(
            response["reading"], st.session_state["history"]
        )
    st.session_state["demo_response"] = response
    st.session_state["demo_error"] = None
    if level == "CRITICAL":
        st.session_state["alert"] = response["alert"]
        st.session_state["alerts"] = [response["alert"]]
        st.session_state["audit"] = simulated_audit(response["alert"])
    else:
        st.session_state["alert"] = None
        st.session_state["alerts"] = []
        st.session_state["audit"] = []


def run_critical_demo() -> None:
    school_id = st.session_state["school_id"]
    st.session_state["demo_error"] = None
    if DEMO_MODE == "public":
        apply_simulated_scenario("CRITICAL")
        return
    try:
        result = backend_request(
            "POST", f"/api/schools/{school_id}/demo/severe-pm25", school_id, json={}
        )
        st.session_state["scenario"] = "CRITICAL"
        st.session_state["reading"] = result.get("reading")
        st.session_state["risk"] = result.get("risk")
        st.session_state["alert"] = result.get("alert")
        st.session_state["demo_response"] = result
        st.session_state["forecast"] = fallback_forecast("CRITICAL", result["reading"]["pm25"])
        st.session_state["model_info"] = {
            "modelName": "deterministic-demo-fallback",
            "baselineMetrics": None,
            "modelMetrics": None,
            "split": None,
            "dataStatus": "SIMULATED DEMO",
            "limitations": "Critical judge scenario remains deterministic and is not altered by model output.",
        }
        st.session_state["history"] = st.session_state.get("history", [])
        st.session_state["recommendations"] = [
            {"priority": "Action", "title": item, "detail": "Configured protective action."}
            for item in result["alert"].get("recommendedActions", [])
        ]
        st.session_state["alerts"] = [result["alert"]]
        st.session_state["audit"] = backend_request(
            "GET", f"/api/schools/{school_id}/audit", school_id
        )
    except (requests.RequestException, KeyError) as error:
        st.session_state["demo_error"] = str(error)


def acknowledge_alert() -> None:
    alert = st.session_state.get("alert")
    if not alert:
        return
    st.session_state["ack_error"] = None
    if DEMO_MODE == "public":
        updated = dict(alert)
        updated["status"] = "ACKNOWLEDGED"
        updated["acknowledgedAt"] = now_iso()
        st.session_state["alert"] = updated
        st.session_state["alerts"] = [updated]
        st.session_state["audit"] = [
            *st.session_state["audit"],
            {
                "eventId": f"streamlit-acknowledged-{alert['alertId']}",
                "schoolId": alert["schoolId"],
                "eventType": "alert.acknowledged",
                "timestamp": updated["acknowledgedAt"],
                "actorSource": "streamlit-public-demo",
                "relatedAlertId": alert["alertId"],
                "details": {"status": "ACKNOWLEDGED"},
                "simulated": True,
            },
        ]
        return
    try:
        updated = backend_request(
            "POST",
            f"/api/schools/{alert['schoolId']}/alerts/{alert['alertId']}/acknowledge",
            alert["schoolId"],
            json={},
        )
        st.session_state["alert"] = updated
        st.session_state["alerts"] = [updated]
        st.session_state["audit"] = backend_request(
            "GET", f"/api/schools/{alert['schoolId']}/audit", alert["schoolId"]
        )
    except requests.RequestException as error:
        st.session_state["ack_error"] = str(error)


def report_csv(reading: dict[str, Any], forecast: list[dict[str, Any]], school_id: str) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["school_id", "school_name", "record_type", "horizon", "pm25", "pm10",
                     "temperature", "humidity", "wind_speed", "risk", "simulated", "timestamp"])
    risk = risk_label(st.session_state.get("risk"), reading)
    writer.writerow([
        school_id, school_name(school_id), "reading", "Current", reading.get("pm25"),
        reading.get("pm10"), reading.get("temperature"), reading.get("humidity"),
        reading.get("windSpeed"), risk, reading.get("simulated", True), reading.get("timestamp", ""),
    ])
    for item in forecast[1:]:
        writer.writerow([
            school_id, school_name(school_id), "forecast", item["horizon"], item["pm25"],
            "", "", "", "", risk, item.get("simulated", True), reading.get("timestamp", ""),
        ])
    return output.getvalue().encode("utf-8")


initialize_state()
school_ids = list(SCHOOL_BY_ID) or [DEFAULT_SCHOOL_ID]
selected_school = st.sidebar.selectbox(
    "School context",
    school_ids,
    index=school_ids.index(st.session_state["school_id"]) if st.session_state["school_id"] in school_ids else 0,
    format_func=school_name,
)
if selected_school != st.session_state["school_id"]:
    st.session_state["school_id"] = selected_school
    st.session_state["health"] = None
    st.session_state["reading"] = None
    st.session_state["risk"] = None
    st.session_state["alert"] = None
    st.session_state["audit"] = []
    st.rerun()

st.sidebar.caption("Public mode is simulated and backend-free." if DEMO_MODE == "public"
                   else f"Local backend: {BACKEND_URL}")
if st.sidebar.button("Refresh dashboard"):
    if DEMO_MODE == "public":
        st.session_state["health"] = None
        initialize_state()
    else:
        load_local_state(st.session_state["school_id"])
    st.rerun()

school_id = st.session_state["school_id"]
school = SCHOOL_BY_ID.get(school_id, {})
reading = st.session_state.get("reading") or scenario_reading(school_id, st.session_state["scenario"])
risk = st.session_state.get("risk")
alert = st.session_state.get("alert")
current_risk = risk_label(risk, reading)

st.title("🌬️ Smart Breath")
st.subheader("School & Child Safe Air Early-Warning System")
st.caption(f"{'PUBLIC SIMULATED DEMO' if DEMO_MODE == 'public' else 'LOCAL BACKEND DEMO'}  •  {school_name(school_id)}")
if DEMO_MODE == "public":
    st.info("SIMULATED DEMO • Readings, forecasts, alerts, audit events, and LOCAL_MOCK notifications are presentation data.")
elif st.session_state["backend_error"]:
    st.error("Backend unavailable. Start the existing backend, then refresh.")
    st.code(st.session_state["backend_error"])
else:
    st.success("Backend connected • local authenticated demo mode")

st.header("Current Air Quality")
st.caption(f"School: **{school_name(school_id)}**  •  Simulation status: **SIMULATED DEMO**")
metric_columns = st.columns(5)
for column, (label, key, unit) in zip(
    metric_columns,
    (("PM2.5", "pm25", "µg/m³"), ("PM10", "pm10", "µg/m³"),
     ("Temperature", "temperature", "°C"), ("Humidity", "humidity", "%"),
     ("Wind speed", "windSpeed", "m/s")),
):
    with column:
        st.metric(label, f"{reading.get(key, '—')} {unit}")
st.markdown(f"### {RISK_COLORS.get(current_risk, '⚪')} Current risk: {current_risk}")
st.caption(f"Last updated: {reading.get('timestamp', 'not available')}")

st.header("Demo Sensor Simulator")
st.caption("SIMULATED DEMO • This control is not a real sensor.")
scenario_columns = st.columns(4)
for column, level in zip(scenario_columns, RISK_LEVELS):
    with column:
        if st.button(level, use_container_width=True, key=f"scenario-{level}"):
            if level == "CRITICAL":
                run_critical_demo()
            else:
                apply_simulated_scenario(level)
            st.rerun()
if st.button("Run Severe Air Quality Demo", type="primary", use_container_width=True):
    run_critical_demo()
    st.rerun()
if st.session_state["demo_error"]:
    st.error(f"Demo request failed: {st.session_state['demo_error']}")

st.header("3-Hour PM2.5 Forecast")
forecast = st.session_state.get("forecast") or forecast_for(current_risk, reading.get("pm25", 0))
model_info = st.session_state.get("model_info", {})
st.caption(
    f"Result status: **{model_info.get('dataStatus', 'FALLBACK')}** • "
    f"Model: **{model_info.get('modelName', 'not available')}**"
)
forecast_columns = st.columns(4)
for column, item in zip(forecast_columns, forecast):
    with column:
        st.metric(item["horizon"], f"{item['pm25']} µg/m³")

st.header("Air Quality Trends")
history = st.session_state.get("history", [])
chart_rows = [
    {"PM2.5": item.get("pm25"), "PM10": item.get("pm10"), "Predicted PM2.5": None}
    for item in history[-24:]
]
chart_rows.append({"PM2.5": reading.get("pm25"), "PM10": reading.get("pm10"), "Predicted PM2.5": reading.get("pm25")})
chart_rows.extend(
    {"PM2.5": None, "PM10": None, "Predicted PM2.5": item["pm25"]}
    for item in forecast[1:]
)
st.caption(
    f"Historical source: **{model_info.get('dataStatus', 'FALLBACK')}**. "
    "Predictions are development/demo outputs and are not real sensor measurements."
)
st.line_chart(chart_rows, y=["PM2.5", "PM10", "Predicted PM2.5"])

if model_info.get("modelMetrics"):
    st.subheader("Model evaluation")
    metric_columns = st.columns(3)
    for column, metric_name in zip(metric_columns, ("mae", "rmse", "r2")):
        with column:
            st.metric(f"Test {metric_name.upper()}", model_info["modelMetrics"][metric_name])
    st.caption(
        f"Chronological split • train {model_info['split']['train']}, "
        f"validation {model_info['split']['validation']}, test {model_info['split']['test']}. "
        "Metrics are development-only and not production accuracy."
    )
    with st.expander("Baseline comparison"):
        st.write({"persistence-baseline": model_info["baselineMetrics"], "model": model_info["modelMetrics"]})
else:
    st.warning(f"Model unavailable: {model_info.get('limitations', 'Using safe fallback output.')}")

st.header("Air Quality Risk Assessment")
risk_column, summary_column = st.columns([1, 2])
with risk_column:
    st.metric("Current risk", f"{RISK_COLORS.get(current_risk, '⚪')} {current_risk}")
    st.write(f"Child-sensitive monitoring: **{'ACTIVE' if school.get('protectiveActions', {}).get('childSensitiveMode', True) else 'CONFIGURED'}**")
with summary_column:
    st.write(f"Forecast trend: **{forecast[0]['pm25']} → {forecast[-1]['pm25']} µg/m³** over 3 hours")
    st.write((risk or {}).get("reason", "Monitoring state is based on the selected simulated scenario."))
    st.markdown("**Recommended protective actions**")
    for item in st.session_state.get("recommendations", SIMULATED_RECOMMENDATIONS):
        st.write(f"- **{item.get('priority', 'Action')}** — {item.get('title', '')}")
        if item.get("detail"):
            st.caption(item["detail"])

if alert:
    st.header("Operational Alert Center")
    st.warning(f"{RISK_COLORS['CRITICAL']} Severity: **{alert.get('severity', '').upper()}** • Status: **{alert.get('status', '')}**")
    st.write(alert.get("message", ""))
    alert_columns = st.columns(3)
    alert_columns[0].metric("PM2.5", f"{alert.get('currentValue', '—')} µg/m³")
    alert_columns[1].metric("Notification", "SIMULATED")
    alert_columns[2].metric("Acknowledgement", "YES" if alert.get("status") == "ACKNOWLEDGED" else "PENDING")
    st.caption(f"LOCAL_MOCK notification • Created: {alert.get('createdAt', 'not available')}")
    lifecycle = ["CREATED", "QUEUED", "DELIVERY_ATTEMPTED", "DELIVERED", "ACKNOWLEDGED"]
    current_index = lifecycle.index(alert["status"]) if alert.get("status") in lifecycle else -1
    st.write(" → ".join(f"**{item}**" if index <= current_index else item for index, item in enumerate(lifecycle)))
    if alert.get("status") == "DELIVERED" and st.button("Acknowledge alert"):
        acknowledge_alert()
        st.rerun()
    if st.session_state["ack_error"]:
        st.error(f"Acknowledgement failed: {st.session_state['ack_error']}")

st.header("Audit Timeline")
audit_events = st.session_state.get("audit", [])
if audit_events:
    for event in reversed(audit_events[-10:]):
        st.write(f"**{event.get('eventType', 'event')}**  •  {event.get('timestamp', '')}  •  {'SIMULATED' if event.get('simulated', True) else 'LOCAL'}")
else:
    st.caption("No alert lifecycle events yet. Select a simulator state or run the critical demo.")

st.header("Reports")
st.download_button(
    "Download Air Quality Report",
    data=report_csv(reading, forecast, school_id),
    file_name=f"smartbreath-{school_id}-air-quality.csv",
    mime="text/csv",
)
if st.session_state.get("demo_response"):
    with st.expander("Actual demo response"):
        st.json(st.session_state["demo_response"])

st.divider()
st.info(
    "Safety notice: this dashboard uses simulated demo data and LOCAL_MOCK notifications. "
    "It is not a medical diagnostic system, does not provide treatment advice, and "
    "does not autonomously dispatch police, ambulance, hospitals, or emergency services."
)
