const { normalizeSensorReading, deterministicReadingId } = require('./contracts');

function extractReading(event) {
  if (event && event.reading) return event.reading;
  if (event && event.detail && event.detail.reading) return event.detail.reading;
  return event;
}

async function handler(event) {
  const reading = normalizeSensorReading(extractReading(event));
  return {
    reading,
    readingId: deterministicReadingId(reading),
    accepted: true,
    simulated: reading.simulated
  };
}

module.exports = { handler, extractReading };
