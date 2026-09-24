const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

test('state machine has explicit ingestion, persistence, audit, success, and failure states', () => {
  const definition = JSON.parse(fs.readFileSync(`${__dirname}/statemachine.asl.json`, 'utf8'));
  assert.equal(definition.StartAt, 'IngestAndValidate');
  for (const state of ['IngestAndValidate', 'PersistRawAndReading', 'PrepareFeatures', 'GeneratePrediction', 'EvaluateRisk', 'PersistPredictionAndRisk', 'WriteAudit', 'Succeeded', 'ValidationFailed', 'PersistenceFailed', 'AuditFailed']) {
    assert.ok(definition.States[state], `missing ${state}`);
  }
  assert.equal(definition.States.IngestAndValidate.Catch[0].Next, 'ValidationFailed');
  assert.equal(definition.States.PersistRawAndReading.Catch[0].Next, 'PersistenceFailed');
  assert.equal(definition.States.WriteAudit.Catch[0].Next, 'AuditFailed');
});
