const crypto = require('crypto');

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function predictionId(prediction) {
  return stableId('prediction', [
    prediction.schoolId,
    prediction.predictionTimestamp,
    prediction.targetTimestamp,
    prediction.modelVersion
  ].join('|'));
}

function riskEvaluationId(evaluation) {
  return stableId('risk', [
    evaluation.schoolId,
    evaluation.evaluatedAt,
    evaluation.policyVersion,
    evaluation.severity
  ].join('|'));
}

function toDynamoPrediction(prediction) {
  const id = predictionId(prediction);
  return {
    pk: `SCHOOL#${prediction.schoolId}`,
    sk: `PREDICTION#${prediction.targetTimestamp}#${id}`,
    entityType: 'Prediction',
    predictionId: id,
    ...prediction
  };
}

function toDynamoRiskEvaluation(evaluation) {
  const id = riskEvaluationId(evaluation);
  return {
    pk: `SCHOOL#${evaluation.schoolId}`,
    sk: `RISK#${evaluation.evaluatedAt}#${id}`,
    entityType: 'RiskEvaluation',
    riskEvaluationId: id,
    ...evaluation
  };
}

function toModelAuditRecord({ schoolId, eventType, actorSource, relatedId, modelVersion, details, simulated, timestamp }) {
  const eventId = stableId('audit', [schoolId, eventType, relatedId, timestamp].join('|'));
  return {
    pk: `SCHOOL#${schoolId}`,
    sk: `AUDIT#${timestamp}#${eventId}`,
    entityType: 'AuditEvent',
    eventId,
    schoolId,
    eventType,
    timestamp,
    actorSource,
    relatedAlertId: null,
    relatedPredictionId: eventType.startsWith('prediction') ? relatedId : null,
    relatedRiskEvaluationId: eventType === 'risk.evaluated' ? relatedId : null,
    modelVersion: modelVersion || null,
    details,
    simulated: simulated === true
  };
}

module.exports = {
  predictionId,
  riskEvaluationId,
  toDynamoPrediction,
  toDynamoRiskEvaluation,
  toModelAuditRecord
};
