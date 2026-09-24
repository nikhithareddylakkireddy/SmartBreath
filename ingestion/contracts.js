const crypto = require('crypto');
const { validateSensorReading } = require('../domain');

function normalizeSensorReading(input) {
  const value = input && typeof input === 'object' ? input : {};
  const reading = {
    schoolId: value.schoolId,
    sensorId: value.sensorId,
    timestamp: value.timestamp,
    latitude: value.latitude,
    longitude: value.longitude,
    locationReference: value.locationReference,
    pm25: value.pm25,
    pm10: value.pm10,
    temperature: value.temperature,
    humidity: value.humidity,
    windSpeed: value.windSpeed,
    windDirection: value.windDirection,
    dataSource: value.dataSource || value.source,
    simulated: value.simulated === true
  };
  validateSensorReading(reading);
  return reading;
}

function deterministicReadingId(reading) {
  const canonical = [
    reading.schoolId,
    reading.sensorId,
    new Date(reading.timestamp).toISOString(),
    reading.dataSource
  ].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function partitionTime(timestamp) {
  const date = new Date(timestamp);
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, '0'),
    day: String(date.getUTCDate()).padStart(2, '0'),
    hour: String(date.getUTCHours()).padStart(2, '0')
  };
}

function rawReadingKey(reading, readingId = deterministicReadingId(reading)) {
  const time = partitionTime(reading.timestamp);
  return `raw-readings/${reading.schoolId}/${time.year}/${time.month}/${time.day}/${time.hour}/${reading.sensorId}/${readingId}.json`;
}

module.exports = {
  deterministicReadingId,
  normalizeSensorReading,
  partitionTime,
  rawReadingKey
};
