const express = require('express');
const path = require('path');
const { buildDashboard, getAlerts, getRecommendations } = require('./smartbreath');
const {
  createSeverePM25DemoReading,
  evaluateRisk,
  getSchoolConfiguration
} = require('../domain');
const { NotificationService } = require('../notifications/service');
const { authorize, bearerClaims } = require('../security/authorization');
const { LocalRepository } = require('../data/repositories');

const app = express();
const PORT = process.env.PORT || 3000;
const repository = new LocalRepository();
const eventSubscribers = new Set();
const notifications = new NotificationService({
  repository,
  publish: (event) => eventSubscribers.forEach((subscriber) => subscriber(event))
});

function protectedClaims(req) {
  return bearerClaims(req);
}

function handleError(error, res) {
  const status = error.message.startsWith('Unauthorized') ? 401
    : error.message.startsWith('Forbidden') ? 403
      : error.message.startsWith('No configuration') || error.message.startsWith('Alert not found') ? 404
        : 400;
  res.status(status).json({ error: error.message });
}

function healthHandler(_event) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ok', service: 'SmartBreath', timestamp: new Date().toISOString() })
  };
}

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'SmartBreath',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/dashboard', (req, res) => {
  try { protectedClaims(req); res.json(buildDashboard()); } catch (error) { handleError(error, res); }
});

app.get('/api/alerts', (req, res) => {
  try { protectedClaims(req); res.json(getAlerts()); } catch (error) { handleError(error, res); }
});

app.get('/api/recommendations', (req, res) => {
  try { protectedClaims(req); res.json(getRecommendations()); } catch (error) { handleError(error, res); }
});

app.get('/api/demo/severe-pm25', (req, res) => {
  try {
    const claims = protectedClaims(req);
    authorize({ claims, schoolId: req.query.schoolId || 'greenfield' });
    res.json(createSeverePM25DemoReading({ schoolId: req.query.schoolId || 'greenfield' }));
  } catch (error) { handleError(error, res); }
});

app.post('/api/risk/evaluate', (req, res) => {
  try {
    const claims = protectedClaims(req);
    const { schoolId, currentPM25, currentPM10, predictedPM25, predictionConfidence } = req.body || {};
    authorize({ claims, schoolId });
    if (typeof currentPM25 !== 'number' || typeof currentPM10 !== 'number') throw new Error('Invalid reading values.');
    const configuration = getSchoolConfiguration(schoolId);
    res.json(evaluateRisk({ schoolId, currentPM25, currentPM10, predictedPM25, predictionConfidence, thresholds: configuration.thresholds }));
  } catch (error) { handleError(error, res); }
});

app.get('/api/schools/:schoolId/alerts', (req, res) => {
  try {
    const claims = bearerClaims(req);
    authorize({ claims, schoolId: req.params.schoolId });
    res.json([...notifications.alerts.values()].filter((alert) => alert.schoolId === req.params.schoolId));
  } catch (error) { handleError(error, res); }
});

for (const resource of ['readings', 'predictions', 'audit']) {
  app.get(`/api/schools/:schoolId/${resource}`, (req, res) => {
    try {
      const claims = bearerClaims(req);
      authorize({ claims, schoolId: req.params.schoolId });
      const values = resource === 'readings' ? repository.getReadings(req.params.schoolId)
        : resource === 'predictions' ? repository.getPredictions(req.params.schoolId)
          : repository.getAudit(req.params.schoolId);
      res.json(values);
    } catch (error) { handleError(error, res); }
  });
}

app.get('/api/schools/:schoolId/contacts', (req, res) => {
  try {
    const claims = bearerClaims(req);
    authorize({ claims, schoolId: req.params.schoolId });
    res.json(getSchoolConfiguration(req.params.schoolId).contacts.map(({ destination, ...contact }) => contact));
  } catch (error) { handleError(error, res); }
});

app.post('/api/schools/:schoolId/contacts', (req, res) => {
  try {
    authorize({ claims: bearerClaims(req), schoolId: req.params.schoolId, action: 'write-policy' });
    res.status(201).json({ ...req.body, schoolId: req.params.schoolId, stored: false, note: 'Relational contact persistence is provided by the Phase 2 Aurora design.' });
  } catch (error) { handleError(error, res); }
});

app.post('/api/schools/:schoolId/alerts/:alertId/acknowledge', (req, res) => {
  try {
    const claims = bearerClaims(req);
    authorize({ claims, schoolId: req.params.schoolId, action: 'acknowledge', allowedRoles: ['school-administrator', 'school-staff'] });
    res.json(notifications.acknowledge(req.params.schoolId, req.params.alertId, claims.sub));
  } catch (error) { handleError(error, res); }
});

app.post('/api/schools/:schoolId/demo/severe-pm25', (req, res) => {
  try {
    const claims = bearerClaims(req);
    authorize({ claims, schoolId: req.params.schoolId, allowedRoles: ['school-administrator', 'school-staff'], action: 'create-demo' });
    if (req.params.schoolId !== 'greenfield') throw new Error('No configuration found for school.');
    const demo = notifications.createDemoAlert('greenfield');
    const job = notifications.queueAlert(demo.alert.alertId);
    notifications.deliverLocal(demo.alert.alertId);
    res.status(201).json({ ...demo, alert: notifications.alerts.get(demo.alert.alertId), job, localProviderMode: 'LOCAL_MOCK' });
  } catch (error) { handleError(error, res); }
});

const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

module.exports = {
  app,
  healthHandler,
  notifications,
  repository,
  subscribeToEvents(listener) { eventSubscribers.add(listener); return () => eventSubscribers.delete(listener); }
};

if (require.main === module) app.listen(PORT, () => console.log(`SmartBreath is running on http://localhost:${PORT}`));
