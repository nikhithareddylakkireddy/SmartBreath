const { validateSensorReading } = require('./schemas/sensor-reading');

function createSeverePM25DemoReading({ schoolId = 'greenfield', timestamp = new Date().toISOString() } = {}) {
  const reading = {
    schoolId,
    sensorId: 'demo-sensor-001',
    timestamp,
    latitude: 17.385,
    longitude: 78.4867,
    locationReference: 'configured-school-location',
    pm25: 285,
    pm10: 340,
    temperature: 29,
    humidity: 67,
    windSpeed: 3,
    windDirection: 180,
    dataSource: 'hackathon-demo',
    simulated: true
  };
  validateSensorReading(reading);
  return reading;
}

module.exports = { createSeverePM25DemoReading };
