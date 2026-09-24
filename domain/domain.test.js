const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createAlert,
  createAuditEvent,
  createSeverePM25DemoReading,
  evaluateRisk,
  getSchoolConfiguration,
  validatePrediction,
  validateSensorReading,
  validateAllSchoolConfigurations,
  ValidationError
} = require('./index');

test('validates a complete sensor reading and rejects missing safety fields', () => {
  const reading = createSeverePM25DemoReading();
  assert.equal(reading.pm25, 285);
  assert.equal(reading.simulated, true);
  assert.throws(
    () => validateSensorReading({ schoolId: 'school', sensorId: 'sensor' }),
    (error) => error instanceof ValidationError
  );
});

test('supports the prediction schema and rejects invalid confidence', () => {
  assert.equal(validatePrediction({
    schoolId: 'greenfield',
    predictionTimestamp: '2026-09-25T00:00:00.000Z',
    targetTimestamp: '2026-09-25T03:00:00.000Z',
    predictedPM25: 180,
    predictionHorizonHours: 3,
    modelVersion: 'not-yet-trained-phase-1',
    confidence: 0.9,
    featuresUsed: ['pm25', 'pm10', 'temperature', 'humidity', 'windSpeed', 'hour']
  }), true);
  assert.throws(() => validatePrediction({
    schoolId: 'greenfield',
    predictionTimestamp: '2026-09-25T00:00:00.000Z',
    targetTimestamp: '2026-09-25T03:00:00.000Z',
    predictedPM25: 180,
    predictionHorizonHours: 3,
    modelVersion: 'phase-1',
    confidence: 2,
    featuresUsed: ['pm25']
  }), ValidationError);
});

test('current critical readings remain critical even with unusable prediction confidence', () => {
  const configuration = getSchoolConfiguration('greenfield');
  const risk = evaluateRisk({
    schoolId: 'greenfield',
    currentPM25: 285,
    currentPM10: 340,
    predictedPM25: 0,
    predictionConfidence: 0.2,
    thresholds: configuration.thresholds
  });
  assert.equal(risk.currentRisk, 'critical');
  assert.equal(risk.severity, 'critical');
  assert.equal(risk.predictedRisk, 'good');
});

test('school configurations include verified escalation contacts', () => {
  assert.equal(validateAllSchoolConfigurations(), 1);
  const configuration = getSchoolConfiguration('greenfield');
  assert.ok(configuration.contacts.some((contact) =>
    contact.type === 'escalation' &&
    contact.verifiedByInstitution === true
  ));
});

test('alert and audit records carry simulated state and safe messaging', () => {
  const configuration = getSchoolConfiguration('greenfield');
  const alert = createAlert({
    alertId: 'demo-alert-001',
    schoolId: 'greenfield',
    schoolName: configuration.schoolName,
    severity: 'critical',
    pollutant: 'PM2.5',
    currentValue: 285,
    predictedValue: 285,
    thresholds: configuration.thresholds,
    simulated: true
  });
  const audit = createAuditEvent({
    eventId: 'demo-audit-001',
    schoolId: 'greenfield',
    eventType: 'alert.created',
    actorSource: 'hackathon-demo',
    relatedAlertId: alert.alertId,
    details: { severity: alert.severity },
    simulated: true
  });
  assert.match(alert.message, /SIMULATED DEMO/);
  assert.match(alert.message, /does not diagnose medical conditions/);
  assert.equal(audit.relatedAlertId, alert.alertId);
});
