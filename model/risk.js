const { evaluateRisk } = require('../domain');

function evaluatePredictionRisk({ reading, prediction, thresholds, protectiveActions = {}, childSensitiveMode = true, evaluatedAt = new Date().toISOString() }) {
  return evaluateRisk({
    schoolId: reading.schoolId,
    currentPM25: reading.pm25,
    currentPM10: reading.pm10,
    predictedPM25: prediction?.valid ? prediction.predictedPM25 : undefined,
    predictionConfidence: prediction?.valid ? prediction.confidence : 0,
    thresholds,
    protectiveActions,
    childSensitiveMode,
    evaluatedAt
  });
}

module.exports = { evaluatePredictionRisk };
