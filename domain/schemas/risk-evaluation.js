const {
  requireString,
  requireFiniteNumber,
  requireTimestamp,
  requireEnum,
  validate
} = require('../validation');

const RISK_LEVELS = ['good', 'watch', 'elevated', 'high', 'critical'];
const SEVERITIES = ['info', 'watch', 'high', 'critical'];

function validateRiskEvaluation(evaluation) {
  const errors = [];
  if (!evaluation || typeof evaluation !== 'object') return validate('RiskEvaluation', ['evaluation must be an object']);

  requireString(evaluation.schoolId, 'schoolId', errors);
  requireEnum(evaluation.currentRisk, 'currentRisk', RISK_LEVELS, errors);
  requireEnum(evaluation.predictedRisk, 'predictedRisk', RISK_LEVELS, errors);
  requireEnum(evaluation.severity, 'severity', SEVERITIES, errors);
  requireString(evaluation.reason, 'reason', errors);
  requireFiniteNumber(evaluation.confidence, 'confidence', errors, { min: 0, max: 1 });
  requireString(evaluation.policyVersion, 'policyVersion', errors);
  requireTimestamp(evaluation.evaluatedAt, 'evaluatedAt', errors);

  return validate('RiskEvaluation', errors);
}

module.exports = { validateRiskEvaluation, RISK_LEVELS, SEVERITIES };
