const { validatePrediction } = require('../domain');
const { validatePredictionOutput, confidenceFromValidation } = require('./quality');

function createPrediction({ schoolId, predictionTimestamp, features, featuresUsed, targetTimestamp, predictedPM25, modelVersion, confidence, simulated = false }) {
  const quality = validatePredictionOutput(predictedPM25);
  const prediction = {
    schoolId,
    predictionTimestamp,
    targetTimestamp,
    predictedPM25: quality.valid ? Number(predictedPM25.toFixed(3)) : 0,
    predictionHorizonHours: 3,
    modelVersion,
    confidence: quality.valid ? confidence : 0,
    featuresUsed,
    simulated,
    valid: quality.valid,
    rejectionReason: quality.reason
  };
  validatePrediction(prediction);
  return prediction;
}

function inferPrediction({ model, modelError, schoolId, reading, preparedFeatures, simulated = false }) {
  const predictionTimestamp = new Date().toISOString();
  const targetTimestamp = new Date(Date.parse(reading.timestamp) + 3 * 60 * 60 * 1000).toISOString();
  const predictedPM25 = model.predict(preparedFeatures);
  const confidence = confidenceFromValidation({ modelError, dataQuality: preparedFeatures.dataQuality });
  return createPrediction({
    schoolId,
    predictionTimestamp,
    targetTimestamp,
    features: preparedFeatures.features,
    featuresUsed: preparedFeatures.featuresUsed,
    predictedPM25,
    modelVersion: model.modelVersion,
    confidence,
    simulated
  });
}

module.exports = { createPrediction, inferPrediction };
