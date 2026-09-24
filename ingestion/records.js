const crypto = require('crypto');
const { deterministicReadingId } = require('./contracts');

function toDynamoReading(reading) {
  const readingId = deterministicReadingId(reading);
  return {
    pk: `SCHOOL#${reading.schoolId}`,
    sk: `READING#${reading.timestamp}#${reading.sensorId}#${readingId}`,
    entityType: 'SensorReading',
    readingId,
    schoolId: reading.schoolId,
    sensorId: reading.sensorId,
    timestamp: reading.timestamp,
    pm25: reading.pm25,
    pm10: reading.pm10,
    temperature: reading.temperature,
    humidity: reading.humidity,
    windSpeed: reading.windSpeed,
    windDirection: reading.windDirection,
    latitude: reading.latitude,
    longitude: reading.longitude,
    locationReference: reading.locationReference,
    dataSource: reading.dataSource,
    simulated: reading.simulated
  };
}

function toAuditRecord({ reading, eventType = 'reading.ingested', timestamp = reading.timestamp }) {
  const readingId = deterministicReadingId(reading);
  const eventId = crypto.createHash('sha256')
    .update(`${readingId}|${eventType}`)
    .digest('hex');
  return {
    pk: `SCHOOL#${reading.schoolId}`,
    sk: `AUDIT#${timestamp}#${eventId}`,
    entityType: 'AuditEvent',
    eventId,
    schoolId: reading.schoolId,
    eventType,
    timestamp,
    actorSource: reading.dataSource,
    relatedAlertId: null,
    details: { readingId, sensorId: reading.sensorId },
    simulated: reading.simulated
  };
}

module.exports = { toDynamoReading, toAuditRecord };
