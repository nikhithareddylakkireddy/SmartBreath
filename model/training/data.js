const { requireFiniteNumber, requireString, requireTimestamp, validate } = require('../../domain/validation');

const FEATURE_NAMES = [
  'pm25',
  'pm10',
  'temperature',
  'humidity',
  'windSpeed',
  'windDirection',
  'hour',
  'dayOfWeek',
  'pm25Lag1',
  'pm25Lag2',
  'pm25Lag3',
  'pm10Lag1',
  'pm10Lag2',
  'pm10Lag3'
];

function validateTrainingExample(example) {
  const errors = [];
  if (!example || typeof example !== 'object') return validate('TrainingExample', ['example must be an object']);
  requireTimestamp(example.timestamp, 'timestamp', errors);
  requireString(example.schoolId, 'schoolId', errors);
  for (const name of FEATURE_NAMES) requireFiniteNumber(example.features?.[name], `features.${name}`, errors);
  requireFiniteNumber(example.targetPM25, 'targetPM25', errors, { min: 0 });
  requireString(example.dataQuality, 'dataQuality', errors);
  if (!['synthetic', 'sensor'].includes(example.dataSourceType)) {
    errors.push('dataSourceType must be synthetic or sensor');
  }
  return validate('TrainingExample', errors);
}

function createSyntheticDataset({ count = 96, schoolId = 'synthetic-school', start = '2026-01-01T00:00:00.000Z' } = {}) {
  const examples = [];
  const startMs = Date.parse(start);
  for (let index = 0; index < count; index += 1) {
    const timestamp = new Date(startMs + index * 60 * 60 * 1000);
    const hour = timestamp.getUTCHours();
    const dayOfWeek = timestamp.getUTCDay();
    const pm25 = 30 + (index % 12) * 2 + (hour >= 7 && hour <= 10 ? 18 : 0) + (index % 5);
    const pm10 = pm25 * 1.25;
    const history = {
      pm25Lag1: Math.max(0, pm25 - 3),
      pm25Lag2: Math.max(0, pm25 - 5),
      pm25Lag3: Math.max(0, pm25 - 7),
      pm10Lag1: Math.max(0, pm10 - 4),
      pm10Lag2: Math.max(0, pm10 - 6),
      pm10Lag3: Math.max(0, pm10 - 8)
    };
    const features = {
      pm25,
      pm10,
      temperature: 22 + (hour / 3),
      humidity: 55 + (dayOfWeek % 4),
      windSpeed: 2 + (index % 4),
      windDirection: (index * 30) % 360,
      hour,
      dayOfWeek,
      ...history
    };
    const targetPM25 = Math.max(0, pm25 * 1.04 + (hour >= 6 && hour <= 9 ? 8 : 0) - features.windSpeed);
    const example = {
      timestamp: timestamp.toISOString(),
      schoolId,
      features,
      targetPM25: Number(targetPM25.toFixed(3)),
      dataSourceType: 'synthetic',
      dataQuality: 'synthetic-development-only'
    };
    validateTrainingExample(example);
    examples.push(example);
  }
  return examples;
}

module.exports = { FEATURE_NAMES, createSyntheticDataset, validateTrainingExample };
