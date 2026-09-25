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

## Demo sequence

1. Confirm the backend health connection is shown.
2. Click **Run Severe Air Quality Demo**.
3. Verify the backend response displays PM2.5 `285`, `CRITICAL` risk, a
   simulated notification, protective recommendations, and the alert lifecycle.
4. Review the audit events.
5. Acknowledge the delivered alert when demonstrating the lifecycle.

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
