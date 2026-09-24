const {
  requireString,
  requireFiniteNumber,
  requireTimestamp,
  validate
} = require('../validation');

function validateSensorReading(reading) {
  const errors = [];
  if (!reading || typeof reading !== 'object') return validate('SensorReading', ['reading must be an object']);

  requireString(reading.schoolId, 'schoolId', errors);
  requireString(reading.sensorId, 'sensorId', errors);
  requireTimestamp(reading.timestamp, 'timestamp', errors);
  const hasCoordinates = reading.latitude !== undefined || reading.longitude !== undefined;
  if (hasCoordinates) {
    requireFiniteNumber(reading.latitude, 'latitude', errors, { min: -90, max: 90 });
    requireFiniteNumber(reading.longitude, 'longitude', errors, { min: -180, max: 180 });
  } else {
    requireString(reading.locationReference, 'locationReference', errors);
  }
  requireFiniteNumber(reading.pm25, 'pm25', errors, { min: 0 });
  requireFiniteNumber(reading.pm10, 'pm10', errors, { min: 0 });
  requireFiniteNumber(reading.temperature, 'temperature', errors);
  requireFiniteNumber(reading.humidity, 'humidity', errors, { min: 0, max: 100 });
  requireFiniteNumber(reading.windSpeed, 'windSpeed', errors, { min: 0 });
  requireFiniteNumber(reading.windDirection, 'windDirection', errors, { min: 0, max: 360 });
  requireString(reading.dataSource, 'dataSource', errors);
  if (typeof reading.simulated !== 'boolean') errors.push('simulated must be a boolean');

  return validate('SensorReading', errors);
}

module.exports = { validateSensorReading };
