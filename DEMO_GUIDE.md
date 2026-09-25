# SmartBreath Hackathon Demo Guide

## Project overview

SmartBreath is a School & Child Safe Air Early-Warning System. It turns
school-level particulate readings into explainable environmental risk,
protective-action guidance, alerts, simulated notifications, and an auditable
live dashboard.

## Problem

Schools need a clear way to recognize worsening particulate exposure, understand
what action their configured policy recommends, and communicate that status
without presenting environmental information as a medical diagnosis or
emergency-dispatch service.

## Solution and key features

- Validated sensor-reading, prediction, risk, alert, audit, school, and contact
  domain contracts.
- Deterministic policy evaluation with child-sensitive school configuration.
- Local PM2.5 `285` severe-air-quality demonstration.
- Critical alert lifecycle: created, queued, delivery attempted, delivered,
  acknowledged, escalated, and resolved where policy permits.
- Local-only simulated notification routing with no real recipients.
- School-scoped WebSocket events and reconnect/heartbeat handling.
- Responsive dashboard with live metrics, recommendations, critical alert
  center, event feed, audit timeline, and acknowledgement.
- Fail-closed production boundaries for Cognito and AWS data adapters.

## Architecture

### Implemented locally

```text
Next.js dashboard
  -> Express API + local auth mock
  -> local repository and deterministic domain policy
  -> local notification mock + audit events
  -> WebSocket event relay -> school dashboard channel
```

### AWS architecture prepared but not deployed

| Service | Prepared role |
|---|---|
| EventBridge | Start scheduled ingestion |
| Step Functions | Orchestrate ingestion, persistence, and audit |
| Lambda | Ingestion, persistence, audit, notification, and API boundaries |
| S3 | Immutable raw-reading storage |
| SageMaker | Future model training/inference boundary |
| DynamoDB | High-volume readings, predictions, risks, alerts, and audit records |
| RDS/Aurora | Relational schools, policies, notification settings, and contacts |
| SQS | Notification queue and dead-letter handling |
| SNS | Future provider boundary; not used by the demo |
| API Gateway | Protected HTTP API boundary |
| Cognito | Identity, tenant claims, and role groups |
| ECS Fargate | Deferred production WebSocket service |
| EC2 | VPC/network substrate for AWS resources |
| Amplify | Deferred Next.js hosting |
| CloudFront | Deferred HTTPS delivery and caching boundary |
| Route 53 | Deferred DNS/domain routing |
| CloudWatch | Logs, metrics, retention, and operational visibility |

No AWS resources are created or contacted by the local demo.

## Technology stack

Node.js, Express 5, Next.js 14, React 18, `ws`, Node test runner,
JavaScript domain contracts, local JSON fixtures, AWS SAM/CloudFormation
architecture definitions, and Python SageMaker boundary stubs.

## Safety design

The dashboard describes environmental risk and protective actions only. It is
not a medical diagnostic system and does not autonomously dispatch police,
ambulance, hospitals, or other emergency services. Demo readings, alerts,
notifications, and audit events are marked simulated. Escalation is limited to
institution-configured, verified contacts in the domain policy; the local
provider never sends to them.

## Local setup

Requirements: Node.js, npm, and three terminals. The backend and WebSocket
services use safe localhost defaults. The frontend environment file points the
browser to those local services.

### Exact startup commands

**Terminal 1 — backend API (`http://localhost:3000`)**

```powershell
cd D:\SmartBreath
npm install
$env:AUTH_MODE="local"
npm start
```

**Terminal 2 — WebSocket server (`ws://localhost:8080`, health at `/health`)**

```powershell
cd D:\SmartBreath\containers\websocket-server
npm install
$env:AUTH_MODE="local"
npm start
```

**Terminal 3 — Next.js frontend (`http://localhost:3001`)**

```powershell
cd D:\SmartBreath\frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3001` and choose **Sign in with local demo**.

## Exact demo sequence

1. Start all three services.
2. Open the dashboard.
3. Show the normal air-quality state and `LOCAL DEMO` context.
4. Explain PM2.5, PM10, temperature, humidity, wind, risk, and the three-hour prediction horizon.
5. Click **Run Severe Air Quality Demo**.
6. Show PM2.5 becoming `285`.
7. Show the `CRITICAL` state and reason.
8. Show the protective recommendations.
9. Show the `SIMULATED` local notification status.
10. Show the live WebSocket events: risk created, queued, and delivered.
11. Show the audit timeline.
12. Click **Acknowledge alert**.
13. Show the `ACKNOWLEDGED` alert lifecycle.
14. Use **Reset Demo** only to clear the current browser view for another presentation run.

## Judge Demo Script (3–5 minutes)

1. **Context (30 seconds):** “SmartBreath helps schools turn particulate
   exposure into clear, explainable protective-action guidance. It is not a
   medical or emergency-dispatch system.”
2. **Normal state (45 seconds):** Point out the school context, live
   connection, environmental metrics, child-sensitive policy, and three-hour
   horizon.
3. **Trigger (45 seconds):** Click the severe-air-quality demo and explain that
   PM2.5 `285` is deterministic, validated, and explicitly simulated.
4. **Response (90 seconds):** Walk through critical risk, recommendations,
   alert lifecycle, simulated notification, and ordered WebSocket events.
5. **Traceability (30 seconds):** Show the audit timeline and acknowledge the
   alert.
6. **Boundary (30 seconds):** Explain that AWS services and real notification
   providers are architecture-ready but not deployed or contacted.

## What is simulated

- Notification delivery is simulated through `LOCAL_MOCK`.
- The PM2.5 `285` reading and associated weather values are simulated demo data.
- AWS services are architecture-ready but not deployed.
- No police, ambulance, hospital, or emergency service is contacted.
- No real parent contacts, phone numbers, or email destinations are used.

## Troubleshooting

### Port already in use

Check ports `3000`, `3001`, and `8080`. Stop the process using the port or
change the local process port and matching frontend environment URL.

### Backend unavailable

Confirm Terminal 1 is running and open `http://localhost:3000/api/health`.
The dashboard displays a backend error instead of hiding the failure.

### WebSocket disconnected

Open `http://localhost:8080/health`, confirm Terminal 2 is running, and verify
the frontend has `NEXT_PUBLIC_WS_URL=ws://localhost:8080`. The dashboard shows
`RECONNECTING` or `OFFLINE` and retries while the session remains active.

### Frontend cannot reach backend

Verify `.env.local` contains:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:8080
NEXT_PUBLIC_AUTH_MODE=local
```

Restart `npm run dev` after changing environment variables.

### npm install problems

Use the Node.js version supported by the repository, run `npm install` in the
root, `frontend`, and `containers/websocket-server` directories separately,
and retry without changing application source or adding credentials.

### Docker problems

Docker is not required for the local demo. Run the Node.js WebSocket server
directly from `containers/websocket-server`.

## Security & Safety

- No credentials, API keys, passwords, or secrets are stored in source.
- No real contacts are stored or used by the demo.
- Tenant isolation binds requests and WebSocket channels to the school claim.
- Role-based access controls demo and acknowledgement actions.
- Escalation requires institution-configured, verified contacts.
- No autonomous police or ambulance dispatch exists.
- SmartBreath is not a medical diagnostic system.

## Hackathon Highlights

- End-to-end local path from reading to risk, alert, notification mock, audit,
  and live dashboard event.
- Deterministic PM2.5 `285` scenario suitable for repeatable judging.
- Explainable risk reason and configured protective recommendations.
- School-isolated WebSocket updates with ordered lifecycle events.
- Alert acknowledgement and audit traceability.
- Explicit local/AWS boundary with no deployment or real-world side effects.

