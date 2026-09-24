const {
  requireString,
  requireFiniteNumber,
  validate
} = require('../validation');
const { validateContacts } = require('./contacts');

function validateSchoolConfiguration(config) {
  const errors = [];
  if (!config || typeof config !== 'object') return validate('SchoolConfiguration', ['config must be an object']);

  requireString(config.schoolId, 'schoolId', errors);
  requireString(config.schoolName, 'schoolName', errors);
  if (!config.location || typeof config.location !== 'object') {
    errors.push('location must be an object');
  } else {
    requireString(config.location.reference, 'location.reference', errors);
    requireFiniteNumber(config.location.latitude, 'location.latitude', errors, { min: -90, max: 90 });
    requireFiniteNumber(config.location.longitude, 'location.longitude', errors, { min: -180, max: 180 });
  }
  requireFiniteNumber(config.childCount, 'childCount', errors, { min: 0 });

  if (!config.thresholds || typeof config.thresholds !== 'object') {
    errors.push('thresholds must be an object');
  } else {
    for (const field of ['pm25Watch', 'pm25High', 'pm25Critical', 'pm10Watch', 'pm10High', 'pm10Critical']) {
      requireFiniteNumber(config.thresholds[field], `thresholds.${field}`, errors, { min: 0 });
    }
    requireFiniteNumber(config.thresholds.minimumPredictionConfidence, 'thresholds.minimumPredictionConfidence', errors, { min: 0, max: 1 });
  }

  if (!config.protectiveActions || typeof config.protectiveActions !== 'object') {
    errors.push('protectiveActions must be an object');
  }
  if (!config.notificationSettings || typeof config.notificationSettings !== 'object') {
    errors.push('notificationSettings must be an object');
  }
  if (!config.escalationSettings || typeof config.escalationSettings !== 'object') {
    errors.push('escalationSettings must be an object');
  }
  if (Array.isArray(config.contacts)) {
    try {
      validateContacts(config.contacts);
    } catch (error) {
      errors.push(...error.errors);
    }
  } else {
    errors.push('contacts must be an array');
  }

  return validate('SchoolConfiguration', errors);
}

module.exports = { validateSchoolConfiguration };
