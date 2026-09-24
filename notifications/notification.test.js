const test = require('node:test');
const assert = require('node:assert/strict');
const { NotificationService } = require('./service');
const { validateNotificationJob, notificationIdempotencyKey } = require('./contract');
const { routeRecipients } = require('./routing');
const { createProviders } = require('./providers');
const { transitionAlert } = require('./lifecycle');
const { handler, delivered } = require('../lambda/notifications');
const { getSchoolConfiguration } = require('../domain');
const { ROLES, authorize, claimsFromLocalUser } = require('../security/authorization');

test('tenant authorization prevents cross-school access and protects writes', () => {
  const claims = claimsFromLocalUser({ sub: 'admin-1', schoolId: 'greenfield', groups: [ROLES.ADMINISTRATOR] });
  assert.equal(authorize({ claims, schoolId: 'greenfield', action: 'write-policy' }), true);
  assert.throws(() => authorize({ claims, schoolId: 'other-school' }), /tenant mismatch/);
  const parent = claimsFromLocalUser({ sub: 'parent-1', schoolId: 'greenfield', groups: [ROLES.PARENT] });
  assert.throws(() => authorize({ claims: parent, schoolId: 'greenfield', action: 'acknowledge' }), /cannot acknowledge/);
});

test('critical routing includes verified contacts from the configured school only', () => {
  const config = getSchoolConfiguration('greenfield');
  const recipients = routeRecipients(config, 'critical');
  assert.ok(recipients.some((item) => item.type === 'escalation'));
  assert.ok(recipients.every((item) => item.destination === 'configured-by-institution'));
});

test('notification contract and idempotency key are deterministic', () => {
  const job = {
    alertId: 'a1', schoolId: 'greenfield', severity: 'critical', pollutant: 'PM2.5',
    currentValue: 285, predictedValue: null, recommendedActions: ['Stay indoors'],
    message: 'Simulated protective guidance', recipients: [{ contactId: 'c1', channel: 'sms', destination: 'configured-by-institution' }],
    channels: ['sms'], simulated: true, createdAt: '2026-09-25T00:00:00.000Z', policyVersion: 'phase-1-v1'
  };
  assert.equal(validateNotificationJob(job), true);
  assert.equal(notificationIdempotencyKey(job), notificationIdempotencyKey({ ...job }));
});

test('alert lifecycle rejects invalid transitions and supports acknowledgement', () => {
  const alert = { alertId: 'a1', schoolId: 'greenfield', status: 'CREATED' };
  const queued = transitionAlert(alert, 'QUEUED');
  assert.equal(queued.status, 'QUEUED');
  assert.throws(() => transitionAlert(queued, 'RESOLVED'), /Invalid alert transition/);
});

test('local providers are mocks and notification delivery is idempotent', async () => {
  const providers = createProviders();
  const result = await providers.sms.sendMessage('configured-by-institution', '[SIMULATED DEMO] test');
  assert.equal(result.provider, 'LOCAL_MOCK_SNS-SMS');
  const service = new NotificationService();
  const { alert } = service.createDemoAlert();
  const job = service.queueAlert(alert.alertId);
  delivered.clear();
  const first = await handler({ Records: [{ body: JSON.stringify(job) }] });
  const second = await handler({ Records: [{ body: JSON.stringify(job) }] });
  assert.equal(first.results[0].status, 'delivered');
  assert.equal(second.results[0].status, 'already-delivered');
});

test('demo flow creates simulated critical alert, queue job, and audit record', () => {
  const service = new NotificationService();
  const demo = service.createDemoAlert();
  const job = service.queueAlert(demo.alert.alertId);
  assert.equal(demo.reading.pm25, 285);
  assert.equal(demo.reading.simulated, true);
  assert.equal(demo.alert.status, 'CREATED');
  assert.equal(job.simulated, true);
  assert.ok(service.audit.some((event) => event.eventType === 'alert.created'));
});

test('escalation uses only institution-verified contacts and records an audit event', () => {
  const service = new NotificationService();
  const demo = service.createDemoAlert();
  const queued = service.queueAlert(demo.alert.alertId);
  let delivered = transitionAlert(service.alerts.get(demo.alert.alertId), 'DELIVERY_ATTEMPTED');
  delivered = transitionAlert(delivered, 'DELIVERED');
  service.alerts.set(demo.alert.alertId, delivered);
  const result = service.escalate('greenfield', demo.alert.alertId);
  assert.equal(result.alert.status, 'ESCALATED');
  assert.deepEqual(result.recipients, ['greenfield-escalation']);
  assert.ok(service.audit.some((event) => event.eventType === 'alert.escalated'));
});
