"""Local Streamlit demonstration client for Smart Breath.

This app is intentionally a thin UI over the existing local backend. It does
not implement risk evaluation, alert transitions, or notification delivery.
"""

from __future__ import annotations

import os
import json
from datetime import datetime, timezone
from typing import Any

import requests
import streamlit as st


DEMO_MODE = os.getenv("SMARTBREATH_DEMO_MODE", "public").strip().lower()
if DEMO_MODE not in {"public", "local"}:
    DEMO_MODE = "public"
BACKEND_URL = os.getenv("SMARTBREATH_BACKEND_URL", "http://localhost:3000").rstrip("/")
SCHOOL_ID = os.getenv("SMARTBREATH_SCHOOL_ID", "greenfield")
LOCAL_USER = {
    "sub": os.getenv("SMARTBREATH_LOCAL_SUB", "local-admin"),
    "schoolId": SCHOOL_ID,
    "groups": ["school-administrator"],
}
REQUEST_TIMEOUT = 5
SIMULATED_RECOMMENDATIONS = [
    {
        "priority": "High",
        "title": "Keep children indoors and suspend outdoor activities.",
        "detail": "Follow the configured school protective-action plan.",
    },
    {
        "priority": "High",
        "title": "Activate filtered ventilation.",
        "detail": "Keep filtration systems running during the simulated event.",
    },
    {
        "priority": "Medium",
        "title": "Notify school communication channels.",
        "detail": "Use institution-approved communication procedures.",
    },
]

st.set_page_config(
    page_title="Smart Breath | Local Demo",
    page_icon="🌬️",
    layout="wide",
)


def backend_request(method: str, path: str, **kwargs: Any) -> Any:
    """Call the existing backend and raise a useful local-demo error."""
    headers = kwargs.pop("headers", {})
    headers["x-local-user"] = json.dumps(LOCAL_USER)
    response = requests.request(
        method,
        f"{BACKEND_URL}{path}",
        headers=headers,
        timeout=REQUEST_TIMEOUT,
        **kwargs,
    )
    response.raise_for_status()
    return response.json()


def simulated_demo_response() -> dict[str, Any]:
    """Return a fixed public-demo payload; no risk calculation is performed here."""
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    alert_id = "public-demo-alert-greenfield-285"
    return {
        "reading": {
            "schoolId": SCHOOL_ID,
            "sensorId": "public-demo-sensor-001",
            "timestamp": timestamp,
            "pm25": 285,
            "pm10": 340,
            "temperature": 29,
            "humidity": 67,
            "windSpeed": 3,
            "windDirection": 180,
            "dataSource": "streamlit-public-demo",
            "simulated": True,
        },
        "risk": {
            "schoolId": SCHOOL_ID,
            "currentRisk": "critical",
            "predictedRisk": "critical",
            "severity": "critical",
            "reason": "Public demo scenario: PM2.5 is 285, so the configured scenario is critical.",
            "confidence": 1,
            "policyVersion": "public-demo",
            "evaluatedAt": timestamp,
            "simulated": True,
        },
        "alert": {
            "alertId": alert_id,
            "schoolId": SCHOOL_ID,
            "severity": "critical",
            "pollutant": "PM2.5",
            "currentValue": 285,
            "threshold": 150,
            "message": "[SIMULATED DEMO] Critical air-quality scenario. Follow the school protective-action plan.",
            "recommendedActions": [
                item["title"] for item in SIMULATED_RECOMMENDATIONS
            ],
            "status": "DELIVERED",
            "createdAt": timestamp,
            "queuedAt": timestamp,
            "deliveryAttemptedAt": timestamp,
            "deliveredAt": timestamp,
            "acknowledgedAt": None,
            "simulated": True,
        },
        "job": {
            "alertId": alert_id,
            "schoolId": SCHOOL_ID,
            "simulated": True,
            "localProviderMode": "LOCAL_MOCK",
        },
        "localProviderMode": "LOCAL_MOCK",
        "simulated": True,
    }


def simulated_audit(alert: dict[str, Any]) -> list[dict[str, Any]]:
    timestamp = alert.get("createdAt", datetime.now(timezone.utc).isoformat())
    return [
        {
            "eventId": f"public-demo-created-{alert['alertId']}",
            "schoolId": SCHOOL_ID,
            "eventType": "alert.created",
            "timestamp": timestamp,
            "actorSource": "streamlit-public-demo",
            "relatedAlertId": alert["alertId"],
            "details": {"status": "CREATED"},
            "simulated": True,
        },
        {
            "eventId": f"public-demo-queued-{alert['alertId']}",
            "schoolId": SCHOOL_ID,
            "eventType": "alert.queued",
            "timestamp": timestamp,
            "actorSource": "streamlit-public-demo",
            "relatedAlertId": alert["alertId"],
            "details": {"status": "QUEUED"},
            "simulated": True,
        },
        {
            "eventId": f"public-demo-delivered-{alert['alertId']}",
            "schoolId": SCHOOL_ID,
            "eventType": "alert.delivered",
            "timestamp": timestamp,
            "actorSource": "streamlit-public-demo",
            "relatedAlertId": alert["alertId"],
            "details": {"status": "DELIVERED", "notification": "LOCAL_MOCK"},
            "simulated": True,
        },
    ]


def load_backend_state() -> None:
    """Refresh read-only dashboard state from the existing API."""
    state = st.session_state
    state["backend_error"] = None
    try:
        state["health"] = backend_request("GET", "/api/health")
        state["dashboard"] = backend_request("GET", "/api/dashboard")
        state["recommendations"] = backend_request("GET", "/api/recommendations")
        state["alerts"] = backend_request(
            "GET", f"/api/schools/{SCHOOL_ID}/alerts"
        )
        state["audit"] = backend_request(
            "GET", f"/api/schools/{SCHOOL_ID}/audit"
        )
        readings = backend_request(
            "GET", f"/api/schools/{SCHOOL_ID}/readings"
        )
        if readings:
            state["reading"] = readings[-1]
    except requests.RequestException as error:
        state["backend_error"] = str(error)


def initialize_state() -> None:
    defaults = {
        "reading": None,
        "risk": None,
        "alert": None,
        "job": None,
        "demo_response": None,
        "audit": [],
        "alerts": [],
        "recommendations": [],
        "dashboard": {},
        "health": None,
        "backend_error": None,
        "demo_error": None,
        "ack_error": None,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)
    if not st.session_state.get("health") and not st.session_state.get("backend_error"):
        if DEMO_MODE == "public":
            st.session_state["health"] = {"status": "ok", "service": "public-demo"}
            st.session_state["reading"] = {
                "schoolId": SCHOOL_ID,
                "pm25": 18,
                "pm10": 31,
                "temperature": 26,
                "humidity": 58,
                "windSpeed": 2,
                "simulated": True,
            }
            st.session_state["recommendations"] = SIMULATED_RECOMMENDATIONS
        else:
            load_backend_state()


def risk_label(risk: dict[str, Any] | None, reading: dict[str, Any] | None) -> str:
    if risk and risk.get("currentRisk"):
        return str(risk["currentRisk"]).upper()
    if reading and isinstance(reading.get("pm25"), (int, float)):
        pm25 = reading["pm25"]
        if pm25 >= 150:
            return "CRITICAL"
        if pm25 >= 75:
            return "HIGH"
        if pm25 >= 35:
            return "ELEVATED"
    return "NORMAL"


def metric_value(reading: dict[str, Any] | None, key: str, fallback: str = "—") -> Any:
    if not reading or reading.get(key) is None:
        return fallback
    return reading[key]


def run_demo() -> None:
    st.session_state["demo_error"] = None
    if DEMO_MODE == "public":
        result = simulated_demo_response()
        st.session_state["reading"] = result["reading"]
        st.session_state["risk"] = result["risk"]
        st.session_state["alert"] = result["alert"]
        st.session_state["job"] = result["job"]
        st.session_state["demo_response"] = result
        st.session_state["alerts"] = [result["alert"]]
        st.session_state["audit"] = simulated_audit(result["alert"])
        return
    try:
        result = backend_request(
            "POST",
            f"/api/schools/{SCHOOL_ID}/demo/severe-pm25",
            json={},
        )
        st.session_state["reading"] = result.get("reading")
        st.session_state["risk"] = result.get("risk")
        st.session_state["alert"] = result.get("alert")
        st.session_state["job"] = result.get("job")
        st.session_state["demo_response"] = result
        st.session_state["alerts"] = [result["alert"]]
        st.session_state["audit"] = backend_request(
            "GET", f"/api/schools/{SCHOOL_ID}/audit"
        )
        st.session_state["demo_error"] = None
    except requests.RequestException as error:
        st.session_state["demo_error"] = str(error)


def acknowledge_alert() -> None:
    alert = st.session_state.get("alert")
    if not alert:
        return
    st.session_state["ack_error"] = None
    if DEMO_MODE == "public":
        updated = dict(alert)
        updated["status"] = "ACKNOWLEDGED"
        updated["acknowledgedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        st.session_state["alert"] = updated
        st.session_state["alerts"] = [updated]
        st.session_state["audit"] = [
            *st.session_state.get("audit", []),
            {
                "eventId": f"public-demo-acknowledged-{alert['alertId']}",
                "schoolId": SCHOOL_ID,
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
            f"/api/schools/{SCHOOL_ID}/alerts/{alert['alertId']}/acknowledge",
            json={},
        )
        st.session_state["alert"] = updated
        st.session_state["alerts"] = [updated]
        st.session_state["audit"] = backend_request(
            "GET", f"/api/schools/{SCHOOL_ID}/audit"
        )
    except requests.RequestException as error:
        st.session_state["ack_error"] = str(error)


initialize_state()

st.title("🌬️ Smart Breath")
st.subheader("School & Child Safe Air Early-Warning System")
if DEMO_MODE == "public":
    st.caption("PUBLIC SIMULATED DEMO  •  No backend or credentials required")
else:
    st.caption(f"LOCAL DEMO  •  {SCHOOL_ID} school context  •  Backend: {BACKEND_URL}")

if DEMO_MODE == "public":
    st.info("Public demo mode • all readings, alerts, audit events, and notifications are simulated.")
elif st.session_state["backend_error"]:
    st.error(
        "Backend unavailable. Start the existing backend with "
        "`npm start` from the project root, then use Refresh."
    )
    st.code(st.session_state["backend_error"])
else:
    st.success("Backend connected • local authenticated demo mode")

reading = st.session_state.get("reading")
risk = st.session_state.get("risk")
alert = st.session_state.get("alert")
current_risk = risk_label(risk, reading)

st.divider()
st.header("Current environmental conditions")
metric_columns = st.columns(5)
metrics = [
    ("PM2.5", metric_value(reading, "pm25"), "µg/m³"),
    ("PM10", metric_value(reading, "pm10"), "µg/m³"),
    ("Temperature", metric_value(reading, "temperature"), "°C"),
    ("Humidity", metric_value(reading, "humidity"), "%"),
    ("Wind", metric_value(reading, "windSpeed"), "m/s"),
]
for column, (label, value, unit) in zip(metric_columns, metrics):
    with column:
        st.metric(label, f"{value} {unit}" if value != "—" else value)

risk_colors = {
    "NORMAL": "🟢",
    "ELEVATED": "🟡",
    "HIGH": "🟠",
    "CRITICAL": "🔴",
}
st.markdown(f"### Current risk: {risk_colors.get(current_risk, '⚪')} {current_risk}")
if risk and risk.get("reason"):
    st.info(risk["reason"])

demo_column, refresh_column = st.columns([3, 1])
with demo_column:
    if st.button(
        "Run Severe Air Quality Demo",
        type="primary",
        use_container_width=True,
        disabled=DEMO_MODE == "local" and bool(st.session_state["backend_error"]),
    ):
        run_demo()
with refresh_column:
    if st.button("Refresh", use_container_width=True):
        load_backend_state()
        st.rerun()

if st.session_state["demo_error"]:
    st.error(f"Demo request failed: {st.session_state['demo_error']}")
if st.session_state.get("demo_response"):
    with st.expander("Actual backend demo response"):
        st.json(st.session_state["demo_response"])

if alert:
    st.divider()
    st.header("Critical alert center")
    st.warning(f"Alert status: **{alert.get('status', 'UNKNOWN')}**")
    st.write(alert.get("message", "No alert message returned."))
    st.caption("Notification delivery: **SIMULATED** (LOCAL_MOCK)")
    recommendations = alert.get("recommendedActions", [])
    if recommendations:
        st.markdown("**Protective recommendations**")
        for recommendation in recommendations:
            st.markdown(f"- {recommendation}")
    lifecycle = [
        "CREATED",
        "QUEUED",
        "DELIVERY_ATTEMPTED",
        "DELIVERED",
        "ACKNOWLEDGED",
    ]
    current_status = alert.get("status", "")
    current_index = lifecycle.index(current_status) if current_status in lifecycle else -1
    st.markdown("**Alert lifecycle**")
    st.write(" → ".join(
        f"**{item}**" if index <= current_index else item
        for index, item in enumerate(lifecycle)
    ))
    if current_status == "DELIVERED":
        if st.button("Acknowledge alert"):
            acknowledge_alert()
    if st.session_state["ack_error"]:
        st.error(f"Acknowledgement failed: {st.session_state['ack_error']}")

st.divider()
left, right = st.columns(2)
with left:
    st.header("Audit and events")
    audit_events = st.session_state.get("audit", [])
    if audit_events:
        for event in reversed(audit_events[-10:]):
            timestamp = event.get("timestamp", "")
            label = event.get("eventType", "event").replace(".", " ").title()
            st.write(f"**{label}** — {timestamp}")
    else:
        st.caption("No local audit events yet. Run the demo to create one.")
with right:
    st.header("Recommendations")
    for recommendation in st.session_state.get("recommendations", []):
        st.write(f"**{recommendation.get('priority', 'Info')}** — {recommendation.get('title', '')}")
        st.caption(recommendation.get("detail", ""))

st.divider()
st.info(
    "Safety notice: this interface uses simulated demo data and simulated "
    "notifications. It is not a medical diagnostic system and does not "
    "autonomously dispatch police, ambulance, or other emergency services."
)
st.caption(f"Last viewed: {datetime.now().astimezone().isoformat(timespec='seconds')}")
