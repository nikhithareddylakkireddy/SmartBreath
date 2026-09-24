const {
  requireString,
  requireFiniteNumber,
  requireTimestamp,
  requireEnum,
  validate
} = require('../validation');

const ALERT_STATUSES = ['CREATED', 'QUEUED', 'DELIVERY_ATTEMPTED', 'DELIVERED', 'DELIVERY_FAILED', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED'];
const ALERT_SEVERITIES = ['info', 'watch', 'high', 'critical'];

function validateAlert(alert) {
  const errors = [];
  if (!alert || typeof alert !== 'object') return validate('Alert', ['alert must be an object']);

  requireString(alert.alertId, 'alertId', errors);
  requireString(alert.schoolId, 'schoolId', errors);
  requireEnum(alert.severity, 'severity', ALERT_SEVERITIES, errors);
  requireEnum(alert.pollutant, 'pollutant', ['PM2.5', 'PM10'], errors);
  requireFiniteNumber(alert.currentValue, 'currentValue', errors, { min: 0 });
  requireFiniteNumber(alert.predictedValue, 'predictedValue', errors, { min: 0 });
  requireFiniteNumber(alert.threshold, 'threshold', errors, { min: 0 });
  requireString(alert.message, 'message', errors);
  if (!Array.isArray(alert.recommendedActions) || alert.recommendedActions.length === 0) {
    errors.push('recommendedActions must be a non-empty array');
  }
  requireEnum(alert.status, 'status', ALERT_STATUSES, errors);
  requireTimestamp(alert.createdAt, 'createdAt', errors);
  for (const field of ['queuedAt', 'deliveryAttemptedAt', 'deliveredAt', 'deliveryFailedAt', 'acknowledgedAt', 'resolvedAt', 'escalatedAt']) {
    if (alert[field] !== null && alert[field] !== undefined) requireTimestamp(alert[field], field, errors);
  }
  if (typeof alert.simulated !== 'boolean') errors.push('simulated must be a boolean');

  return validate('Alert', errors);
}

module.exports = { validateAlert, ALERT_STATUSES, ALERT_SEVERITIES };
