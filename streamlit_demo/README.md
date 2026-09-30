# Smart Breath Streamlit Demo

This is an additional hackathon interface for Smart Breath. It does not replace
the existing Next.js dashboard or change the backend, risk, alert, notification,
WebSocket, or AWS logic.

The app has two explicit modes:

- **Public simulated demo (default):** runs independently on Streamlit
  Community Cloud. It presents the deterministic PM2.5 `285` scenario,
  lifecycle, audit events, and `LOCAL_MOCK` notification labels without
  contacting a backend.
- **Local backend mode:** uses the existing authenticated backend at
  `http://localhost:3000` and the real
  `POST /api/schools/greenfield/demo/severe-pm25` endpoint.

The dashboard opens on a judge-friendly Command Center with live status KPIs,
school network context, selected-school air quality, the explainable forecast,
protective actions, sensor status, alert lifecycle, audit timeline, and report
export. Raw reading/risk/alert payloads are hidden inside the collapsed
**Developer Diagnostics** expander. These are presentation features over the
existing contracts; the Streamlit app does not replace the backend risk engine.

The **Demo Control Center** is in the main page content rather than only in the
sidebar. It provides large START LIVE SIMULATION, STOP SIMULATION, ADVANCE TICK,
scenario, and **SIMULATE CRITICAL EVENT** controls. Simulation remains bounded
and user-driven; no background loop is created. The sidebar is reserved for
school and sensor context.

## Phase 14 simulated sensor network

Public mode includes three fictional demo schools and multiple deterministic
simulated sensors per school. Use the school and sensor selectors to keep
readings, history, forecast, alerts, and audit events scoped to the selected
context. The NORMAL, ELEVATED, HIGH, and CRITICAL controls use bounded
scenario values; CRITICAL preserves the judge flow at PM2.5 `285`.

**Start Live Simulation** advances one bounded simulated tick for the selected
sensor. Use **Advance tick** for another reading and **STOP SIMULATION** to
stop live controls. This is intentionally a Streamlit-safe, user-driven
simulation rather than an uncontrolled background process. Every record is
marked `SIMULATED SENSOR` or `SIMULATED DEMO`, and no real IoT feed,
notification, contact, or emergency service is used.

## Forecasting and data provenance

Public mode creates explicitly labeled synthetic development history with
PM2.5, PM10, weather, hour/day features, lagged pollutant values, and rolling
PM2.5 statistics. The dependency-free `model/forecasting.py` adapter uses a
chronological 60% train / 20% validation / 20% test split, compares a
persistence baseline with the existing project's explainable stump-boosting
approach, and reports MAE, RMSE, and R² on the test segment. These metrics are
development-only and do not establish real-world or production accuracy.

Invalid, future, stale, negative, non-numeric, physically implausible, or
insufficient data fails validation. If history or the model artifact is not
safe to use, the dashboard labels the result `FALLBACK` and keeps the
deterministic demo behavior. The PM2.5 `285` critical judge scenario remains
deterministic and is labeled `SIMULATED DEMO`; it never depends on model output
and cannot be downgraded by a missing or low-confidence prediction.

## Start locally

From the repository root:

```powershell
npm install
npm start
```

In a second terminal, start the Streamlit interface:

```powershell
python -m pip install -r streamlit_demo/requirements.txt
$env:SMARTBREATH_DEMO_MODE = "local"
python -m streamlit run streamlit_demo/app.py
```

Open <http://localhost:8501>. The backend remains at
<http://localhost:3000>; the existing Next.js frontend can still be run
independently.

Optional local configuration:

```powershell
$env:SMARTBREATH_BACKEND_URL = "http://localhost:3000"
$env:SMARTBREATH_SCHOOL_ID = "greenfield"
```

## Streamlit Community Cloud deployment

1. Push this repository to a GitHub repository (the deployment action itself is
   outside this code change).
2. In Streamlit Community Cloud, create an app for this repository.
3. Set the main file path to `streamlit_demo/app.py`.
4. Keep the app on the repository's branch containing this directory.
5. Do not add secrets or credentials. No secrets are required.
6. Leave `SMARTBREATH_DEMO_MODE` unset, or set it to `public`.

Public mode must remain enabled on Community Cloud. Do not set
`SMARTBREATH_DEMO_MODE=local` there unless a separately hosted, authenticated
backend is intentionally provided. The public app has no dependency on
`localhost:3000`.

## Parent notification safety

The public dashboard displays email and WhatsApp notification status as
`LOCAL_MOCK`. It never accepts arbitrary parent addresses or phone numbers and
never sends real messages. The backend notification service supports opt-in
provider boundaries, but real delivery requires institution-approved SMTP or
WhatsApp Business Cloud configuration plus active, verified, consented
parent contacts for the matching school. Provider failures and duplicate-send
prevention remain auditable; credentials are never displayed in the dashboard.

## Final hackathon demo sequence

1. Open the app and leave it on the Command Center.
2. Select **Greenfield Academy** and sensor **GF-01**.
3. In **Demo Control Center**, click **CRITICAL** or **SIMULATE CRITICAL EVENT**.
4. Show PM2.5 `285 µg/m³`, `CRITICAL`, the **ACTION NEEDED** explanation,
   protective recommendations, and the three-hour forecast.
5. Show the operational alert, `LOCAL_MOCK` notification, and alert timeline.
6. Click **Acknowledge alert** and show the `ACKNOWLEDGED` status.
7. If technical details are requested, expand **Developer Diagnostics** only then.

The **Demo Sensor Simulator** has NORMAL, ELEVATED, HIGH, and CRITICAL
controls. CRITICAL uses the existing deterministic PM2.5 `285` scenario.
All simulator readings and forecast/chart values are labeled `SIMULATED DEMO`.
Use **Download Air Quality Report** to export the currently displayed reading
and forecast rows; exported rows include a `simulated` marker.

In local mode, the demo uses the existing `POST
/api/schools/greenfield/demo/severe-pm25` endpoint. In public mode, the button
uses a fixed simulated response matching the existing PM2.5 `285` scenario;
this is a presentation-only public demo and does not duplicate or replace the
production risk engine. Refresh only reloads read-only state and never deletes
persistent data.

## Safety boundaries

- Demo readings and notification delivery are simulated and marked by the
  backend as local demo behavior.
- No real parent contacts or notification providers are used.
- This is not a medical diagnostic system.
- The system does not autonomously dispatch police, ambulance, or other
  emergency services.
