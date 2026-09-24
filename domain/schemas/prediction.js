const {
  requireString,
  requireFiniteNumber,
  requireTimestamp,
  validate
} = require('../validation');

function validatePrediction(prediction) {
  const errors = [];
  if (!prediction || typeof prediction !== 'object') return validate('Prediction', ['prediction must be an object']);

  requireString(prediction.schoolId, 'schoolId', errors);
  requireTimestamp(prediction.predictionTimestamp, 'predictionTimestamp', errors);
  requireTimestamp(prediction.targetTimestamp, 'targetTimestamp', errors);
  requireFiniteNumber(prediction.predictedPM25, 'predictedPM25', errors, { min: 0 });
  requireFiniteNumber(prediction.predictionHorizonHours, 'predictionHorizonHours', errors, { min: 0 });
  requireString(prediction.modelVersion, 'modelVersion', errors);
  requireFiniteNumber(prediction.confidence, 'confidence', errors, { min: 0, max: 1 });
  if (!Array.isArray(prediction.featuresUsed) || prediction.featuresUsed.length === 0) {
    errors.push('featuresUsed must be a non-empty array');
  }

  return validate('Prediction', errors);
}

module.exports = { validatePrediction };
