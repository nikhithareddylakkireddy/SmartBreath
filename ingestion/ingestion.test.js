const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deterministicReadingId,
  normalizeSensorReading,
  rawReadingKey
} = require('./contracts');
const { toDynamoReading } = require('./records');
const { createStoragePlan } = require('./storage');
const { handler } = require('./handler');
const { ValidationError } = require('../domain');

const reading = {
  schoolId: 'greenfield',
  sensorId: 'sensor-1',
  timestamp: '2026-09-25T03:04:05.000Z',
  latitude: 17.385,
  longitude: 78.4867,
  pm25: 285,
  pm10: 340,
  temperature: 29,
  humidity: 67,
  windSpeed: 3,
  windDirection: 180,
  source: 'hackathon-demo',
  simulated: true
};

test('ingestion normalizes source and validates the Phase 1 reading contract', async () => {
  const result = await handler({ reading });
  assert.equal(result.accepted, true);
  assert.equal(result.reading.dataSource, 'hackathon-demo');
  assert.equal(result.reading.pm25, 285);
  await assert.rejects(() => handler({ ...reading, humidity: 101 }), ValidationError);
});

test('the same sensor event gets a deterministic id', () => {
  const normalized = normalizeSensorReading(reading);
  assert.equal(deterministicReadingId(normalized), deterministicReadingId(normalized));
  assert.equal(deterministicReadingId(normalized).length, 64);
});

test('raw S3 keys use school and UTC time partitions', () => {
  const normalized = normalizeSensorReading(reading);
  assert.match(rawReadingKey(normalized), /^raw-readings\/greenfield\/2026\/09\/25\/03\/sensor-1\/[a-f0-9]{64}\.json$/);
});

test('DynamoDB mapping supports school time-series access and idempotency', () => {
  const normalized = normalizeSensorReading(reading);
  const record = toDynamoReading(normalized);
  assert.equal(record.pk, 'SCHOOL#greenfield');
  assert.match(record.sk, /^READING#2026-09-25T03:04:05\.000Z#sensor-1#/);
  assert.equal(record.readingId, deterministicReadingId(normalized));
  assert.equal(record.simulated, true);
});

test('storage plan contains immutable raw payload and reading/audit records', () => {
  const normalized = normalizeSensorReading(reading);
  const plan = createStoragePlan({
    reading: normalized,
    readingId: deterministicReadingId(normalized),
    bucketName: 'phase-2-bucket'
  });
  assert.equal(plan.s3.serverSideEncryption, 'AES256');
  assert.equal(plan.dynamodb.reading.entityType, 'SensorReading');
  assert.equal(plan.dynamodb.audit.entityType, 'AuditEvent');
});

test('audit mapping is deterministic for retries', () => {
  const normalized = normalizeSensorReading(reading);
  const { toAuditRecord } = require('./records');
  const first = toAuditRecord({ reading: normalized });
  const second = toAuditRecord({ reading: normalized });
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.sk, second.sk);
});
