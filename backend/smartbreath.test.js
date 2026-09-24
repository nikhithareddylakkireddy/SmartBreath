const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDashboard, getAlerts, getRecommendations } = require('./smartbreath');

test('dashboard summary includes all expected metrics', () => {
  const dashboard = buildDashboard();

  assert.ok(dashboard.generatedAt);
  assert.equal(dashboard.summary.totalSchools, 5);
  assert.ok(dashboard.summary.averageAqi > 0);
  assert.ok(dashboard.summary.activeAlerts >= 0);
  assert.ok(Array.isArray(dashboard.schools));
});

test('alert list flags schools above the sustained warning threshold', () => {
  const alerts = getAlerts();

  assert.ok(Array.isArray(alerts));
  assert.ok(alerts.length >= 2);
  assert.ok(alerts.every((alert) => alert.aqi >= 80));
});

test('recommendations are returned for action planning', () => {
  const recommendations = getRecommendations();

  assert.ok(Array.isArray(recommendations));
  assert.ok(recommendations.length >= 3);
  assert.ok(recommendations.every((item) => item.title && item.detail));
});
