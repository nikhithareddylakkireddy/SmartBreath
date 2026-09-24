const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyntheticDataset, FEATURE_NAMES, validateTrainingExample } = require('./training/data');
const { prepareFeatures } = require('./features');
const { chronologicalSplit } = require('./split');
const { regressionMetrics } = require('./metrics');
const { trainPersistenceBaseline } = require('./baseline');
const { trainGradientBoosting } = require('./gradient-boosting');
const { trainLocalModel } = require('./training/train');
const { createPrediction } = require('./predict');
const { toDynamoPrediction, toDynamoRiskEvaluation, toModelAuditRecord } = require('./records');
const { evaluatePredictionRisk } = require('./risk');
const { getSchoolConfiguration, createSeverePM25DemoReading, ValidationError } = require('../domain');

function readingAt(timestamp, values = {}) {
  return {
    schoolId: 'greenfield',
    sensorId: 'sensor-1',
    timestamp,
    pm25: 50,
    pm10: 70,
    temperature: 25,
    humidity: 60,
    windSpeed: 3,
    windDirection: 180,
    dataSource: 'test',
    simulated: false,
    ...values
  };
}

test('feature preparation includes weather, calendar, and pollutant lag features', () => {
  const reading = readingAt('2026-09-25T03:00:00.000Z');
  const history = [1, 2, 3].map((hoursAgo, index) => readingAt(`2026-09-25T0${3 - hoursAgo}:00:00.000Z`, { pm25: 40 - index, pm10: 60 - index }));
  const prepared = prepareFeatures({ reading, history, now: new Date('2026-09-25T03:30:00.000Z') });
  assert.deepEqual(prepared.featuresUsed, FEATURE_NAMES);
  assert.equal(prepared.features.pm25Lag1, 40);
  assert.equal(prepared.features.hour, 3);
});

test('feature preparation rejects stale and insufficient readings', () => {
  assert.throws(() => prepareFeatures({
    reading: readingAt('2026-09-20T03:00:00.000Z'),
    history: [],
    now: new Date('2026-09-25T03:00:00.000Z')
  }), /stale/);
  assert.throws(() => prepareFeatures({
    reading: readingAt('2026-09-25T03:00:00.000Z'),
    history: [],
    now: new Date('2026-09-25T03:30:00.000Z')
  }), /Insufficient/);
});

test('synthetic data is labeled and split chronologically without shuffling', () => {
  const data = createSyntheticDataset({ count: 20 });
  assert.ok(data.every((example) => example.dataSourceType === 'synthetic'));
  const split = chronologicalSplit(data);
  assert.ok(Date.parse(split.train.at(-1).timestamp) < Date.parse(split.validation[0].timestamp));
  assert.ok(Date.parse(split.validation.at(-1).timestamp) < Date.parse(split.test[0].timestamp));
  assert.equal(split.train.length + split.validation.length + split.test.length, 20);
});

test('baseline and gradient-boosting models return regression metrics', () => {
  const data = createSyntheticDataset({ count: 60 });
  const split = chronologicalSplit(data);
  const baseline = trainPersistenceBaseline();
  const model = trainGradientBoosting(split.train);
  const metrics = regressionMetrics(
    split.test.map((item) => item.targetPM25),
    split.test.map((item) => model.predict(item))
  );
  assert.ok(Number.isFinite(metrics.mae));
  assert.ok(Number.isFinite(metrics.rmse));
  assert.ok(Number.isFinite(metrics.r2));
  assert.ok(Number.isFinite(baseline.predict(split.test[0])));
});

test('local training reports synthetic-only model limitations', () => {
  const result = trainLocalModel({ examples: createSyntheticDataset({ count: 30 }) });
  assert.equal(result.dataSource, 'synthetic');
  assert.match(result.limitations, /synthetic data/);
  assert.ok(result.modelMetrics.mae >= 0);
});

test('prediction contract fixes the horizon at three hours and marks invalid output', () => {
  const prediction = createPrediction({
    schoolId: 'greenfield',
    predictionTimestamp: '2026-09-25T03:00:00.000Z',
    targetTimestamp: '2026-09-25T06:00:00.000Z',
    predictedPM25: 85,
    modelVersion: 'test-model',
    confidence: 0.6,
    features: {},
    featuresUsed: ['pm25'],
    simulated: true
  });
  assert.equal(prediction.predictionHorizonHours, 3);
  assert.equal(prediction.confidence, 0.6);
  const invalid = createPrediction({
    schoolId: 'greenfield',
    predictionTimestamp: '2026-09-25T03:00:00.000Z',
    targetTimestamp: '2026-09-25T06:00:00.000Z',
    predictedPM25: 1200,
    modelVersion: 'test-model',
    confidence: 0.6,
    features: {},
    featuresUsed: ['pm25']
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.confidence, 0);
});

test('critical current demo reading stays critical without a usable prediction', () => {
  const reading = createSeverePM25DemoReading();
  const configuration = getSchoolConfiguration(reading.schoolId);
  const risk = evaluatePredictionRisk({
    reading,
    prediction: null,
    thresholds: configuration.thresholds,
    protectiveActions: configuration.protectiveActions,
    childSensitiveMode: configuration.protectiveActions.childSensitiveMode
  });
  assert.equal(risk.severity, 'critical');
  assert.equal(risk.currentRisk, 'critical');
  assert.match(risk.reason, /Child-sensitive policy is active/);
});

test('prediction and risk records use deterministic school/time keys', () => {
  const prediction = createPrediction({
    schoolId: 'greenfield',
    predictionTimestamp: '2026-09-25T03:00:00.000Z',
    targetTimestamp: '2026-09-25T06:00:00.000Z',
    predictedPM25: 85,
    modelVersion: 'test-model',
    confidence: 0.8,
    features: {},
    featuresUsed: ['pm25']
  });
  const predictionRecord = toDynamoPrediction(prediction);
  const risk = {
    schoolId: 'greenfield',
    currentRisk: 'watch',
    predictedRisk: 'high',
    severity: 'high',
    reason: 'test',
    confidence: 0.8,
    policyVersion: 'phase-1-v1',
    evaluatedAt: '2026-09-25T03:00:00.000Z'
  };
  const riskRecord = toDynamoRiskEvaluation(risk);
  assert.match(predictionRecord.sk, /^PREDICTION#2026-09-25T06:00:00\.000Z#/);
  assert.match(riskRecord.sk, /^RISK#2026-09-25T03:00:00\.000Z#/);
});

test('model audit records include model and related identifiers', () => {
  const audit = toModelAuditRecord({
    schoolId: 'greenfield',
    eventType: 'prediction.generated',
    actorSource: 'local-inference',
    relatedId: 'prediction-1',
    modelVersion: 'test-model',
    details: { confidence: 0.8 },
    simulated: true,
    timestamp: '2026-09-25T03:00:00.000Z'
  });
  assert.equal(audit.modelVersion, 'test-model');
  assert.equal(audit.relatedPredictionId, 'prediction-1');
  assert.equal(audit.simulated, true);
});
