const { validateAlert } = require('./schemas/alert');
const { validateAuditEvent } = require('./schemas/audit-event');
const { actionsForRisk, thresholdForAlert } = require('./policy');
const { formatProtectiveMessage } = require('./safety');

function createAlert({ alertId, schoolId, schoolName, severity, pollutant, currentValue, predictedValue, thresholds, simulated = false, createdAt = new Date().toISOString() }) {
  const alert = {
    alertId,
    schoolId,
    severity,
    pollutant,
    currentValue,
    predictedValue,
    threshold: thresholdForAlert({ pollutant, severity, thresholds }),
    message: formatProtectiveMessage(schoolName, severity, simulated),
    recommendedActions: actionsForRisk(severity),
    status: 'CREATED',
    createdAt,
    queuedAt: null,
    deliveryAttemptedAt: null,
    deliveredAt: null,
    deliveryFailedAt: null,
    acknowledgedAt: null,
    resolvedAt: null,
    escalatedAt: null,
    simulated
  };
  validateAlert(alert);
  return alert;
}

function createAuditEvent({ eventId, schoolId, eventType, actorSource, relatedAlertId = null, details, simulated = false, timestamp = new Date().toISOString() }) {
  const event = {
    eventId,
    schoolId,
    eventType,
    timestamp,
    actorSource,
    relatedAlertId,
    details,
    simulated
  };
  validateAuditEvent(event);
  return event;
}

module.exports = { createAlert, createAuditEvent };
