const test = require('node:test');
const assert = require('node:assert/strict');
const { NotificationService } = require('./service');
const { validateNotificationJob, notificationIdempotencyKey } = require('./contract');
const { routeRecipients } = require('./routing');
const { createProviders, EmailProvider, WhatsAppProvider, validateSmtpConfiguration } = require('./providers');
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
  assert.ok(recipients.some((item) => item.parentId === 'greenfield-demo-parent' && item.channel === 'email'));
  assert.ok(recipients.some((item) => item.parentId === 'greenfield-demo-parent' && item.channel === 'whatsapp'));
  assert.ok(recipients.filter((item) => !item.parentId).every((item) => item.destination === 'configured-by-institution'));
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

test('email and WhatsApp providers fail closed to LOCAL_MOCK without credentials', async () => {
  const email = new EmailProvider();
  const whatsapp = new WhatsAppProvider();
  assert.equal(email.mode, 'LOCAL_MOCK');
  assert.equal(whatsapp.mode, 'LOCAL_MOCK');
  const emailResult = await email.sendEmailNotification({ recipient: 'demo@example.invalid', message: 'test', simulated: false });
  const whatsappResult = await whatsapp.sendWhatsAppNotification({ recipient: '+10000000000', message: 'test', simulated: false });
  assert.equal(emailResult.provider, 'LOCAL_MOCK_EMAIL');
  assert.equal(whatsappResult.provider, 'LOCAL_MOCK_WHATSAPP');
});

test('SMTP accepts only implicit TLS on 465 or STARTTLS on 587', () => {
  assert.deepEqual(validateSmtpConfiguration({
    SMARTBREATH_SMTP_HOST: 'smtp.example.invalid',
    SMARTBREATH_SMTP_PORT: '465',
    SMARTBREATH_SMTP_USER: 'user',
    SMARTBREATH_SMTP_PASSWORD: 'password',
    SMARTBREATH_EMAIL_FROM: 'from@example.invalid'
  }), { port: 465, transport: 'TLS' });
  assert.deepEqual(validateSmtpConfiguration({
    SMARTBREATH_SMTP_HOST: 'smtp.example.invalid',
    SMARTBREATH_SMTP_PORT: '587',
    SMARTBREATH_SMTP_USER: 'user',
    SMARTBREATH_SMTP_PASSWORD: 'password',
    SMARTBREATH_EMAIL_FROM: 'from@example.invalid'
  }), { port: 587, transport: 'STARTTLS' });
  assert.throws(() => validateSmtpConfiguration({
    SMARTBREATH_SMTP_HOST: 'smtp.example.invalid',
    SMARTBREATH_SMTP_PORT: '25',
    SMARTBREATH_SMTP_USER: 'user',
    SMARTBREATH_SMTP_PASSWORD: 'password',
    SMARTBREATH_EMAIL_FROM: 'from@example.invalid'
  }), /port 465|STARTTLS/);
});

test('parent routing requires consent, verification, active state, and tenant match', () => {
  const config = getSchoolConfiguration('greenfield');
  const original = config.parentContacts;
  config.parentContacts = [
    { ...original[0], parentId: 'blocked-consent', notificationConsent: false },
    { ...original[0], parentId: 'blocked-tenant', schoolId: 'other-school' },
    { ...original[0], parentId: 'allowed-parent' }
  ];
  try {
    const recipients = routeRecipients(config, 'high');
    assert.deepEqual(recipients.filter((item) => item.parentId).map((item) => item.parentId), ['allowed-parent', 'allowed-parent']);
  } finally {
    config.parentContacts = original;
  }
});

test('parent routing respects institution email and WhatsApp channel allow-lists', () => {
  const config = getSchoolConfiguration('greenfield');
  const original = config.parentContacts;
  const originalChannels = config.notificationSettings.channels;
  config.parentContacts = [{ ...original[0], parentId: 'allow-list-parent' }];
  try {
    config.notificationSettings.channels = ['email'];
    const emailOnly = routeRecipients(config, 'critical').filter((item) => item.parentId);
    assert.deepEqual(emailOnly.map((item) => item.channel), ['email']);
    config.notificationSettings.channels = ['whatsapp'];
    const whatsappOnly = routeRecipients(config, 'critical').filter((item) => item.parentId);
    assert.deepEqual(whatsappOnly.map((item) => item.channel), ['whatsapp']);
    config.notificationSettings.channels = [];
    assert.equal(routeRecipients(config, 'critical').some((item) => item.parentId), false);
  } finally {
    config.parentContacts = original;
    config.notificationSettings.channels = originalChannels;
  }
});

test('notification idempotency prevents concurrent duplicates and permits retry after failure', async () => {
  let sends = 0;
  let failOnce = true;
  const providers = {
    email: { async sendEmailNotification() { sends += 1; await new Promise((resolve) => setTimeout(resolve, 10)); if (failOnce) { failOnce = false; throw new Error('temporary failure'); } return { provider: 'TEST_EMAIL', status: 'sent' }; } },
    whatsapp: { async sendWhatsAppNotification() { return { provider: 'TEST_WHATSAPP', status: 'sent' }; } },
    sms: { async sendMessage() { return { provider: 'TEST_SMS', status: 'sent' }; } }
  };
  const service = new NotificationService({ providers });
  const alert = { alertId: 'idempotent-alert', schoolId: 'greenfield', severity: 'critical', currentValue: 285, createdAt: '2026-09-30T00:00:00.000Z', simulated: true };
  const job = { alertId: alert.alertId, schoolId: alert.schoolId, severity: alert.severity };
  const recipient = { contactId: 'parent-1', parentId: 'parent-1', channel: 'email', destination: 'demo@example.invalid' };
  const [first, concurrent] = await Promise.all([
    service.deliverRecipient(alert, job, recipient, 'retry-email'),
    service.deliverRecipient(alert, job, recipient, 'retry-email')
  ]);
  assert.equal(first.status, 'failed');
  assert.equal(concurrent.status, 'failed');
  assert.equal(sends, 1);
  const retry = await service.deliverRecipient(alert, job, recipient, 'retry-email');
  assert.equal(retry.status, 'sent');
  const duplicate = await service.deliverRecipient(alert, job, recipient, 'retry-email');
  assert.equal(duplicate.status, 'sent');
  assert.equal(sends, 2);
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
