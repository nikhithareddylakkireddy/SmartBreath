const {
  requireString,
  requireTimestamp,
  validate
} = require('../validation');

function validateAuditEvent(event) {
  const errors = [];
  if (!event || typeof event !== 'object') return validate('AuditEvent', ['event must be an object']);

  requireString(event.eventId, 'eventId', errors);
  requireString(event.schoolId, 'schoolId', errors);
  requireString(event.eventType, 'eventType', errors);
  requireTimestamp(event.timestamp, 'timestamp', errors);
  requireString(event.actorSource, 'actorSource', errors);
  if (event.relatedAlertId !== null) requireString(event.relatedAlertId, 'relatedAlertId', errors);
  if (!event.details || typeof event.details !== 'object' || Array.isArray(event.details)) {
    errors.push('details must be an object');
  }
  if (typeof event.simulated !== 'boolean') errors.push('simulated must be a boolean');

  return validate('AuditEvent', errors);
}

module.exports = { validateAuditEvent };
