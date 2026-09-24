# SmartBreath

SmartBreath is an AI-powered School & Child Safe Air Early-Warning System. Its purpose is to monitor hyperlocal particulate exposure around schools, forecast possible PM2.5 spikes, and provide clear protective-action guidance to configured school personnel and families. SmartBreath is not a medical diagnostic system and is not an emergency dispatcher.

## Phase 1 architecture

Phase 1 is intentionally local and AWS-free. The Express API and dashboard remain the working MVP, while a separate `domain/` layer establishes validated entities, school policy configuration, safety rules, deterministic risk evaluation, and demo data.

The domain layer is designed to become the contract used by later ingestion, prediction, persistence, and notification services. No AWS calls, credentials, deployment resources, or cloud infrastructure are present in Phase 1.

## Domain entities

- `SensorReading` — school and sensor identity, timestamp, location, PM2.5, PM10, weather fields, source, and simulation state.
- `Prediction` — three-hour-capable prediction timestamps, predicted PM2.5, model version, confidence, and features used.
- `RiskEvaluation` — current and predicted risk, severity, reason, confidence, and policy version.
- `Alert` — pollutant values, threshold, safe message, recommended actions, lifecycle status, and simulation state.
- `AuditEvent` — immutable event identity, actor/source, related alert, details, timestamp, and simulation state.
- `SchoolConfiguration` — school location, child count, thresholds, protective-action policies, notification settings, escalation settings, and contacts.
- `Contact` — administrators, responsible staff, parents/guardians, and institution-verified escalation contacts.

Runtime validators in `domain/schemas/` reject malformed records before later persistence or orchestration layers are added.

## Safety rules

- User-facing language describes environmental risk and protective actions, never a medical diagnosis.
- The system does not claim to be an emergency dispatcher and never autonomously contacts police or ambulance services.
- Serious-event escalation requires enabled, institution-verified escalation contacts.
- Recommendations are limited to protective actions such as indoor activity, filtered ventilation, outdoor-activity restriction, appropriate institution-approved mask guidance, and contacting configured responsible personnel.
- Every created alert can be paired with an `AuditEvent`; Phase 2 will add durable audit persistence.
- Simulated readings, alerts, and audit events are explicitly marked with `simulated: true` and demo messages are prefixed with `[SIMULATED DEMO]`.

## Deterministic policy engine

`domain/policy.js` evaluates current PM2.5 and PM10 independently from any model. A prediction is used only when its confidence meets the school's configured minimum. Current critical readings remain critical even when a prediction is missing or low-confidence. Child-sensitive policies and school-specific thresholds are configuration inputs, not hidden constants in the evaluator.

## Demo mode

`createSeverePM25DemoReading()` creates a deterministic reading with PM2.5 set to `285`, PM10 set to `340`, and `simulated: true`. The local endpoint is:

```text
GET /api/demo/severe-pm25?schoolId=greenfield
```

The endpoint currently returns the validated demo reading. The domain layer also creates safe alert and audit records so a later AWS pipeline can pass this same event through ingestion, prediction, risk evaluation, notification, and audit persistence without changing the domain contract.

## How the local MVP currently works

```bash
npm install
npm start
```

Open http://localhost:3000. The dashboard is served by Express and fetches the existing `/api/dashboard` and `/api/recommendations` endpoints. The existing MVP still uses the five-record `data/schools.json` fixture for its dashboard summary; it is not yet a continuous sensor feed.

Additional Phase 1 API behavior:

- `GET /api/health` — local health response
- `GET /api/alerts` — current fixture-based alert view
- `GET /api/demo/severe-pm25` — validated simulated severe reading
- `POST /api/risk/evaluate` — deterministic risk evaluation using a configured school's thresholds

Example request body:

```json
{
  "schoolId": "greenfield",
  "currentPM25": 285,
  "currentPM10": 340,
  "predictedPM25": 180,
  "predictionConfidence": 0.9
}
```

## Project structure

- `backend/` — Express API and existing local dashboard logic
- `domain/` — Phase 1 schemas, safety rules, deterministic policy engine, record factories, and demo mode
- `frontend/` — existing local dashboard UI
- `data/schools.json` — existing dashboard fixture
- `data/school-configurations.json` — Phase 1 school, threshold, policy, and contact configuration
- `docs/` — reserved for future architecture and operations documentation

## Phase 2 architecture: ingestion and persistence backbone

Phase 2 adds AWS-ready infrastructure definitions and Lambda-boundary code without deploying resources or making AWS calls locally:

```text
EventBridge schedule
  -> Step Functions
  -> ingestion Lambda (normalize + Phase 1 validation)
  -> persistence Lambda (immutable S3 raw object + DynamoDB reading)
  -> audit Lambda (DynamoDB audit event)
```

The state machine has explicit retry policies for transient Lambda failures and explicit failure states for validation, persistence, and audit. SageMaker, notifications, API Gateway, Cognito, WebSockets, and production web delivery are intentionally not part of Phase 2.

### AWS service responsibilities

- **EventBridge** — starts the development-friendly scheduled workflow (`rate(15 minutes)` by default). It is intentionally not a high-frequency telemetry schedule.
- **Step Functions** — orchestrates ingestion, persistence, and audit with retries and failure paths.
- **Lambda** — performs validation/normalization, S3/DynamoDB persistence, and audit writes.
- **S3** — stores immutable raw readings with SSE-S3 encryption, versioning, and public-access blocking.
- **DynamoDB** — stores high-volume readings and audit records using a school partition and time-oriented sort keys.
- **Aurora PostgreSQL Serverless v2** — stores relational school, policy, threshold, notification, and contact configuration.
- **CloudWatch Logs** — retains focused Lambda and Step Functions logs for 30 days; X-Ray tracing is enabled in the SAM definition.

Infrastructure is in `infra/template.yaml` and uses AWS SAM/CloudFormation. The template requires an existing VPC, private database subnet IDs, and a database security group as deployment parameters. It does not contain credentials. Aurora uses RDS-managed master-password handling.

### S3 storage strategy

Raw objects use:

```text
raw-readings/{schoolId}/{year}/{month}/{day}/{hour}/{sensorId}/{readingId}.json
```

The object contains the normalized reading and deterministic `readingId`. The bucket is private, encrypted, versioned, retained on stack deletion, and written with `IfNoneMatch: '*'` so a retry cannot overwrite an existing raw event.

### DynamoDB key design

`ReadingsTable` uses:

- `pk = SCHOOL#{schoolId}`
- Sensor reading `sk = READING#{timestamp}#{sensorId}#{readingId}`
- Audit event `sk = AUDIT#{timestamp}#{eventId}`

This supports school-scoped time-range queries without scans. The reading record carries sensor identity, timestamp, pollutants, weather, source, simulation state, and `readingId`. The same table is reserved for future prediction, risk, alert, and audit entity types; future access patterns should use explicit key prefixes and indexes rather than scans. PAY_PER_REQUEST, encryption, and point-in-time recovery are enabled.

### Aurora/RDS relational design

`infra/aurora-schema.sql` separates lower-volume, relational configuration from telemetry:

- `schools` — school identity, location, and child count
- `contacts` — administrators, staff, parents/guardians, and verified escalation contacts
- `school_policies` — thresholds, child-sensitive settings, protective actions, notification settings, and escalation settings

Destinations are represented by `destination_secret_ref`, not real contact information. Contact verification remains an institution-controlled field. Aurora is appropriate for relational configuration and joins; DynamoDB is appropriate for high-volume, append-oriented readings and event records.

### Idempotency strategy

`readingId` is a SHA-256 hash of the canonical tuple:

```text
schoolId | sensorId | normalized timestamp | data source
```

The ID is reused in the S3 key and DynamoDB reading sort key. S3 uses conditional creation, and DynamoDB uses conditional `PutItem` operations. Existing-object and conditional-write conflicts are treated as successful retries, while other errors are rethrown for Step Functions retry handling. Audit IDs are deterministic per reading and event type.

### Failure handling

- Invalid normalized readings fail in the ingestion Lambda and route to `ValidationFailed`.
- Transient Lambda/service errors retry with exponential backoff.
- S3 or DynamoDB failures route to `PersistenceFailed` after retries.
- Audit failures route to `AuditFailed`; the workflow does not report success without an audit write.
- No notification queue or dead-letter queue is added yet because notification delivery is Phase 3+ scope.

### Local testing and demo event

No AWS credentials or local AWS emulator are required for local tests. The pure ingestion contracts and storage mappings are tested without network calls:

```bash
npm test
```

The Phase 1 demo remains available:

```text
GET /api/demo/severe-pm25?schoolId=greenfield
```

It returns PM2.5 `285` with `simulated: true`. The same normalized event can be supplied to the ingestion Lambda/state-machine contract later. No SMS, WhatsApp, or other notification is sent.

### AWS deployment prerequisites

Phase 2 is not deployed by this repository change. A future deployment will require:

1. AWS SAM CLI and CloudFormation permissions.
2. An AWS account and target region selected by the operator.
3. An existing VPC, private subnets, and restricted Aurora security group.
4. An approved deployment role with least-privilege permissions.
5. Review of retention, encryption, database sizing, and log-retention settings.

Credentials must be supplied through the operator's approved AWS credential chain or deployment environment, never source code.

## Phase 3 architecture: forecasting and AI risk evaluation

Phase 3 adds a local, AWS-ready forecasting layer without deploying SageMaker or changing the Phase 2 persistence infrastructure:

```text
validated sensor reading + recent history
  -> feature preparation
  -> chronological training/evaluation
  -> baseline persistence model comparison
  -> explainable gradient-boosting-stump model
  -> 3-hour PM2.5 prediction contract
  -> deterministic Phase 1 risk policy
  -> prediction/risk DynamoDB mappings + audit records
```

The ML output describes environmental risk only. It does not diagnose illness, dispatch emergency services, contact police or ambulance services, or independently choose protective actions. Protective actions continue to come from the deterministic school policy engine.

### Training data and feature schema

`model/training/data.js` defines the training-example contract. Each example contains:

- Timestamp and school ID
- Current PM2.5 and PM10
- Temperature, humidity, wind speed, and wind direction
- UTC hour and day of week
- PM2.5 lags 1–3 and PM10 lags 1–3
- Future PM2.5 target approximately three hours ahead
- `dataSourceType` (`synthetic` or `sensor`)
- Data-quality label

`createSyntheticDataset()` exists only for deterministic local development and tests. It is explicitly labeled `synthetic-development-only`; its metrics must not be presented as real environmental accuracy.

### Feature-quality guardrails

`model/features.js` rejects:

- Missing or non-finite sensor values
- Negative or physically implausible pollutant values
- Future, invalid, or stale current readings
- Fewer than three historical PM2.5/PM10 lag readings

The current local freshness limit is two hours. This is a development policy and should be reviewed against actual sensor cadence before production.

### Models and evaluation

The first model is a persistence baseline: future PM2.5 equals current PM2.5. The explainable local ML model is gradient boosting over shallow decision stumps. It was selected because it is tabular, interpretable enough for a baseline system, dependency-free for local testing, and does not require deep learning.

`model/training/train.js` compares the models using:

- MAE
- RMSE
- R²

The dataset is split chronologically into training, validation, and test segments. Complete random shuffling is intentionally avoided because it can leak future environmental patterns into training features.

The reported confidence is an uncertainty heuristic derived from held-out model error, not a calibrated probability. It must be replaced or calibrated with real sensor data and an approved validation method before operational decisions rely on it.

### Prediction contract and quality

`model/predict.js` emits the existing Phase 1 `Prediction` contract with:

- Three-hour `predictionHorizonHours`
- Prediction and target timestamps
- Predicted PM2.5
- Model version
- Features used
- Explicit validity and rejection reason metadata

Outputs outside the expected PM2.5 range are marked invalid with zero confidence. Invalid or low-confidence predictions do not downgrade a currently critical deterministic risk.

### SageMaker readiness

- `model/training/train.py` defines a future SageMaker training entry-point boundary and artifact output contract.
- `model/inference/inference.py` defines the future `model_fn`, `input_fn`, `predict_fn`, and `output_fn` boundary.
- `model/training/requirements.txt` and `model/inference/requirements.txt` document future image dependencies.
- No SageMaker endpoint, AWS SDK call, credential, or deployment is present.

The local implementation in `model/inference/local.js` is the testable inference adapter. It trains on labeled synthetic data by default and identifies that limitation in its result.

### Risk and persistence integration

`model/risk.js` passes the prediction into the existing deterministic policy engine. Current PM2.5/PM10 values remain authoritative for current risk; a prediction is considered only when valid and above the school-configured confidence threshold. Child-sensitive mode and configured protective-action policy are passed into the evaluator and included in the risk rationale; they cannot be bypassed by the model.

`model/records.js` maps predictions and risk evaluations to the Phase 2 school/time-oriented DynamoDB design with deterministic IDs. It also creates audit records for prediction requests, generation, rejection/low-confidence conditions, and risk evaluation. No notification delivery is included.

The Phase 2 Step Functions definition now contains explicit future contract states for feature preparation, prediction, risk evaluation, prediction/risk persistence, and audit. They are `Pass` states until the AWS adapters are approved; the existing ingestion and persistence path remains intact.

### Phase 3 limitations

- No real historical sensor/provider dataset is currently included.
- Synthetic metrics do not demonstrate real-world deployment accuracy.
- No model drift, calibration, or production monitoring exists yet.
- The local gradient-boosting implementation is a transparent baseline, not a production-trained SageMaker artifact.
- Prediction confidence is a documented heuristic, not a calibrated probability.
- No AWS SageMaker invocation or endpoint deployment occurs in Phase 3.

## Phase 4 architecture: secure APIs and alert delivery

Phase 4 adds identity, authorization, queue, provider, alert-lifecycle, and escalation boundaries without deploying production infrastructure or sending real notifications:

```text
Client -> API Gateway + Cognito JWT authorizer -> tenant/role authorization -> protected APIs
Risk evaluation -> SQS notification queue -> Notification Lambda -> provider abstraction -> audit
```

### Cognito roles and tenant isolation

`infra/template.yaml` defines a Cognito User Pool, an app client without a client secret, and groups:

- `school-administrator`
- `school-staff`
- `parent-guardian`

Users are associated with a school through the `schoolId` claim/custom attribute. `security/authorization.js` requires the claim school ID to match the URL school ID before allowing access. Policy/contact-management writes require administrators. Alert acknowledgement is limited to administrators and staff.

The local mock uses an `x-local-user` JSON header only during non-production development. Production requests are expected to arrive through API Gateway Cognito JWT authorization; the local application rejects bearer tokens in production unless managed gateway verification is in place.

### Protected API routes

`infra/phase4-api.yaml` documents:

- `GET /api/health` — public health endpoint
- `GET /api/schools/{schoolId}/readings`
- `GET /api/schools/{schoolId}/predictions`
- `GET /api/schools/{schoolId}/alerts`
- `GET /api/schools/{schoolId}/audit`
- `POST /api/schools/{schoolId}/alerts/{alertId}/acknowledge`
- `GET /api/schools/{schoolId}/contacts`
- `POST /api/schools/{schoolId}/contacts`
- `POST /api/schools/{schoolId}/demo/severe-pm25`

Protected routes require Cognito authorization plus application-level tenant and role checks. Local reading, prediction, and audit routes return empty results until persistent query adapters are added; they do not expose unrestricted database access.

### SQS and DLQ architecture

The SAM template defines a notification queue and dead-letter queue. The queue uses a 180-second visibility timeout and moves messages after five receives. Jobs contain alert/school identity, severity, pollutant values, actions, configured recipient references, allowed channels, simulation state, creation time, and policy version.

The idempotency key is:

```text
alertId:schoolId:severity
```

The Notification Lambda ignores a job already delivered under the same key. Production should persist this key in DynamoDB with a conditional write; the local adapter uses an in-memory set for safe tests.

### Notification providers

`notifications/providers.js` defines provider boundaries. Local providers are labeled `LOCAL_MOCK` and never send SMS, email, or WhatsApp. SNS SMS/email are future provider boundaries whose regional availability must be verified. WhatsApp is a separately configured provider interface; no AWS-native WhatsApp behavior or credentials are assumed.

### Recipient routing

Routing uses institution-configured contacts. A recipient must belong to the target school, be enabled, and use an enabled channel. Escalation recipients must also be institution-verified. No emergency contact is invented and no police or ambulance contact is generated.

### Alert lifecycle and acknowledgement

`notifications/lifecycle.js` enforces:

```text
CREATED -> QUEUED -> DELIVERY_ATTEMPTED -> DELIVERED
                                      -> DELIVERY_FAILED
DELIVERED/ACKNOWLEDGED/ESCALATED -> RESOLVED
```

Invalid transitions are rejected. Acknowledgement records actor, timestamp, alert ID, and an audit event. Parents cannot acknowledge school-wide operational alerts.

### Escalation and audit

Escalation is policy-driven and requires enabled, institution-verified escalation contacts. It never calls police or ambulance services and does not make medical decisions. Missing verified contacts block escalation and create an audit event. The local service creates audit records for alert creation, acknowledgement, escalation, and blocked escalation. Production persistence should add notification attempt and delivery events without storing secrets.

### Local mock testing

The project remains runnable without AWS credentials:

```bash
npm test
npm start
```

The safe demo request requires a local mock user:

```text
POST /api/schools/greenfield/demo/severe-pm25
x-local-user: {"sub":"demo-admin","schoolId":"greenfield","groups":["school-administrator"]}
```

It creates PM2.5 `285`, `simulated: true`, a critical alert, a queued job, and local audit records. Providers are mocks only.

### Phase 4 deployment prerequisites

Deployment is intentionally not performed. Future deployment requires an approved AWS account/region, least-privilege IAM review, Cognito/API Gateway review, SQS/SNS regional delivery approval, durable notification-idempotency persistence, provider configuration through Secrets Manager or an approved equivalent, throttling/WAF decisions, and non-production recipient integration tests.

## Phase 5 architecture: live product experience and web delivery

Phase 5 adds the production-oriented frontend and live-update structure without deploying AWS resources, changing DNS, or sending real notifications:

```text
Next.js frontend
  -> Cognito authentication boundary
  -> API Gateway / existing protected APIs

Risk and alert events
  -> ECS Fargate WebSocket server
  -> school-isolated dashboard channel
```

### Next.js frontend

The new application lives under `frontend/`:

- `app/` — App Router layout and dashboard page
- `components/` — sign-in panel, metrics, alert center, audit timeline, and connection status
- `lib/` — API client, authentication boundary, and WebSocket hook
- `styles/` — responsive accessible dashboard styles
- `public/` — reserved for static assets

The previous static MVP files remain in place and are not deleted. The Next.js app is a separate local frontend and uses the existing Express/API contracts.

Run it locally with:

```bash
cd frontend
npm install
npm run dev
```

Expected environment variables are documented in `frontend/.env.example`:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_AUTH_MODE`

The local mode uses a clearly labeled demo administrator. Production Cognito sign-in is an integration boundary and does not contain credentials or real users.

### Dashboard and alert UX

The dashboard includes:

- School identity
- Current PM2.5 and PM10 presentation
- Temperature, humidity, and wind
- Current risk
- Three-hour forecast placeholder state
- Child-sensitive safety status
- Active alerts
- Protective recommendations
- Alert acknowledgement for administrators/staff only
- Audit timeline
- Simulated-event labels
- `LIVE`, `RECONNECTING`, and `OFFLINE` WebSocket state

The dashboard does not claim live updates while the socket is offline. Protective language is action-oriented and non-diagnostic. The demo control is visible only to authorized local administrators/staff and uses PM2.5 `285` with `simulated: true`.

### Frontend API layer

`frontend/lib/api-client.js` centralizes dashboard, readings, predictions, alerts, audit, contacts, acknowledgement, and demo operations. It handles non-2xx responses and preserves unauthorized errors for the UI boundary. Fetch calls are not scattered through components.

### WebSocket architecture

`containers/websocket-server/` contains:

- Node.js HTTP health endpoint
- WebSocket server using `ws`
- Connection and disconnection handling
- School channel binding
- Alert/risk/acknowledgement event publishing boundary
- Reconnect-compatible client protocol
- Production authentication boundary

The server never broadcasts across school channels. Local mode is explicitly marked `LOCAL_MOCK`; production mode requires a token verifier boundary that binds Cognito claims to the requested school.

Run locally with:

```bash
cd containers/websocket-server
npm install
npm start
```

### ECS Fargate architecture

`infra/ecs-websocket.yaml` defines the deferred ECS structure:

- ECS cluster with Container Insights
- Fargate task definition
- 256 CPU / 512 MiB memory baseline
- Private subnet networking
- Supplied security group
- Container health check on `/health`
- CloudWatch logging
- Non-public task networking
- Least-privilege task execution role

The image is built from `containers/websocket-server/Dockerfile`. No image is pushed and no ECS service is deployed.

### Amplify Hosting

The Next.js app is configured with `frontend/next.config.js` and standalone output. Amplify Hosting should later connect to the frontend project using the documented environment variables. No Amplify project is created or deployed in Phase 5.

### CloudFront and Route 53

`infra/web-delivery.yaml` is documentation-only metadata:

- CloudFront should provide HTTPS and distribution for the approved frontend/API origins.
- Immutable static assets may be cached.
- Authenticated API responses should not be cached publicly.
- Cache invalidation should be reserved for releases or explicit invalidation events.
- Route 53 should alias the approved SmartBreath domain to the reviewed CloudFront distribution.

No CloudFront distribution, hosted zone, DNS record, or real domain change is created.

### Local versus AWS production

| Area | Local Phase 5 | Future AWS production |
|---|---|---|
| Authentication | Local demo user | Cognito JWT sign-in |
| API | Existing Express APIs | API Gateway + Cognito |
| WebSocket | Local Node server | ECS Fargate |
| Notifications | Existing local mocks | SNS/provider configuration |
| Hosting | Next.js local dev server | Amplify Hosting |
| TLS/DNS | Local URLs | CloudFront + Route 53 |
| Secrets | None | Approved secret/configuration system |

## Phase 6 architecture: local integration hardening

Phase 6 connects the local contracts end to end without deploying or contacting AWS:

```text
reading -> prediction/risk -> alert -> local notification job -> audit
                                      -> live event subscribers/WebSocket boundary
                                      -> Next.js dashboard
```

`data/repositories.js` contains the local repository implementation and explicit
fail-closed adapter boundaries for DynamoDB, Aurora PostgreSQL, and S3. The
deterministic `POST /api/schools/greenfield/demo/severe-pm25` flow uses PM2.5
`285`, stores the reading/risk/alert/audit records, queues a local mock
notification, and publishes a school-scoped live event. Alert transitions
remain validated; invalid transitions are rejected.

### Local demo (safe and offline)

Run `npm install` and `npm start`, then use the dashboard's local demo sign-in.
All notification providers are `LOCAL_MOCK`; no message, contact, credential,
or AWS resource is used. Local protected requests use the deterministic
`x-local-user` header. The WebSocket client reconnects with heartbeat support,
and local mode must be explicit.

### AWS production boundary (not deployed)

Production requests must arrive through API Gateway/Cognito. The application
fails closed without a verified Cognito adapter, accepts only trusted
`sub`, `schoolId`/`custom:schoolId`, and group/role claims, and never trusts an
arbitrary URL school ID. WebSocket ECS tasks explicitly run in production mode;
tokens are not accepted in query strings. SAM now declares the protected API
routes, explicit frontend CORS, and KMS-encrypted notification queues/DLQ.
The repository contains no deployment credentials and Phase 6 does not deploy
or create AWS resources.

Remaining production work is intentionally deferred: implement and review the
real Cognito verifier, DynamoDB/Aurora/S3 adapters, API Lambda adapter,
WebSocket event transport, TLS termination, and operational throttling before
deployment.
