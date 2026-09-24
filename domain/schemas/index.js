const { validateSensorReading } = require('./sensor-reading');
const { validatePrediction } = require('./prediction');
const { validateRiskEvaluation } = require('./risk-evaluation');
const { validateAlert } = require('./alert');
const { validateAuditEvent } = require('./audit-event');
const { validateSchoolConfiguration } = require('./school-configuration');
const { validateContact, validateContacts } = require('./contacts');

module.exports = {
  validateSensorReading,
  validatePrediction,
  validateRiskEvaluation,
  validateAlert,
  validateAuditEvent,
  validateSchoolConfiguration,
  validateContact,
  validateContacts
};
