const { FEATURE_NAMES } = require('./training/data');

const MAX_READING_AGE_MS = 2 * 60 * 60 * 1000;

function validateFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} is missing or invalid.`);
}

function prepareFeatures({ reading, history = [], now = new Date() }) {
  if (!reading || !reading.timestamp) throw new Error('A current reading is required.');
  const age = now.getTime() - Date.parse(reading.timestamp);
  if (!Number.isFinite(age) || age < 0 || age > MAX_READING_AGE_MS) throw new Error('Current reading is stale or has an invalid timestamp.');
  for (const name of ['pm25', 'pm10', 'temperature', 'humidity', 'windSpeed', 'windDirection']) {
    validateFinite(reading[name], name);
  }
  if (reading.pm25 < 0 || reading.pm25 > 1000 || reading.pm10 < 0 || reading.pm10 > 2000) {
    throw new Error('Pollutant value is outside expected physical bounds.');
  }
  const sorted = [...history].filter((item) => item && item.timestamp).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const pm25Lags = sorted.slice(0, 3).map((item) => item.pm25);
  const pm10Lags = sorted.slice(0, 3).map((item) => item.pm10);
  if (pm25Lags.length < 3 || pm10Lags.length < 3) throw new Error('Insufficient historical data for lag features.');
  [...pm25Lags, ...pm10Lags].forEach((value) => validateFinite(value, 'history pollutant'));
  const date = new Date(reading.timestamp);
  const features = {
    pm25: reading.pm25,
    pm10: reading.pm10,
    temperature: reading.temperature,
    humidity: reading.humidity,
    windSpeed: reading.windSpeed,
    windDirection: reading.windDirection,
    hour: date.getUTCHours(),
    dayOfWeek: date.getUTCDay(),
    pm25Lag1: pm25Lags[0],
    pm25Lag2: pm25Lags[1],
    pm25Lag3: pm25Lags[2],
    pm10Lag1: pm10Lags[0],
    pm10Lag2: pm10Lags[1],
    pm10Lag3: pm10Lags[2]
  };
  return { features, featuresUsed: FEATURE_NAMES, dataQuality: 'valid' };
}

module.exports = { MAX_READING_AGE_MS, prepareFeatures };
