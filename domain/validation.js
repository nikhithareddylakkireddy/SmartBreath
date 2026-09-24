class ValidationError extends Error {
  constructor(entity, errors) {
    super(`${entity} validation failed: ${errors.join('; ')}`);
    this.name = 'ValidationError';
    this.entity = entity;
    this.errors = errors;
  }
}

function requireString(value, field, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${field} must be a non-empty string`);
  }
}

function requireFiniteNumber(value, field, errors, { min, max } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${field} must be a finite number`);
    return;
  }
  if (min !== undefined && value < min) errors.push(`${field} must be >= ${min}`);
  if (max !== undefined && value > max) errors.push(`${field} must be <= ${max}`);
}

function requireTimestamp(value, field, errors) {
  requireString(value, field, errors);
  if (typeof value === 'string' && Number.isNaN(Date.parse(value))) {
    errors.push(`${field} must be an ISO-8601 timestamp`);
  }
}

function requireEnum(value, field, allowed, errors) {
  if (!allowed.includes(value)) {
    errors.push(`${field} must be one of: ${allowed.join(', ')}`);
  }
}

function validate(entity, errors) {
  if (errors.length > 0) throw new ValidationError(entity, errors);
  return true;
}

module.exports = {
  ValidationError,
  requireString,
  requireFiniteNumber,
  requireTimestamp,
  requireEnum,
  validate
};
