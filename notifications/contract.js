const { requireString, requireEnum, requireFiniteNumber, requireTimestamp, validate } = require('../domain/validation');

function validateNotificationJob(job) {
  const errors = [];
  if (!job || typeof job !== 'object') return validate('NotificationJob', ['job must be an object']);
  for (const field of ['alertId', 'schoolId', 'message', 'policyVersion']) requireString(job[field], field, errors);
  requireEnum(job.severity, 'severity', ['info', 'watch', 'high', 'critical'], errors);
  requireEnum(job.pollutant, 'pollutant', ['PM2.5', 'PM10'], errors);
  requireFiniteNumber(job.currentValue, 'currentValue', errors, { min: 0 });
  if (job.predictedValue !== null) requireFiniteNumber(job.predictedValue, 'predictedValue', errors, { min: 0 });
  if (!Array.isArray(job.recommendedActions) || job.recommendedActions.length === 0) errors.push('recommendedActions must be non-empty');
  if (!Array.isArray(job.recipients) || job.recipients.length === 0) errors.push('recipients must be non-empty');
  if (!Array.isArray(job.channels) || job.channels.length === 0) errors.push('channels must be non-empty');
  requireTimestamp(job.createdAt, 'createdAt', errors);
  if (typeof job.simulated !== 'boolean') errors.push('simulated must be a boolean');
  return validate('NotificationJob', errors);
}

function notificationIdempotencyKey(job) {
  return `${job.alertId}:${job.schoolId}:${job.severity}`;
}

module.exports = { validateNotificationJob, notificationIdempotencyKey };
