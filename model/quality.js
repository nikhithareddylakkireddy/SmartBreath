function validatePredictionOutput(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1000) {
    return { valid: false, reason: 'Prediction is outside expected PM2.5 bounds.', confidence: 0 };
  }
  return { valid: true, reason: null };
}

function confidenceFromValidation({ modelError, dataQuality = 'valid' }) {
  if (dataQuality !== 'valid') return 0;
  if (!Number.isFinite(modelError)) return 0;
  return Math.max(0, Math.min(1, 1 / (1 + modelError)));
}

module.exports = { confidenceFromValidation, validatePredictionOutput };
