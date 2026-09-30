const { createAlert, createAuditEvent, getSchoolConfiguration, evaluateRisk, createSeverePM25DemoReading } = require('../domain');
const { routeRecipients, parentRoutingDecisions } = require('./routing');
const { notificationIdempotencyKey, channelIdempotencyKey, validateNotificationJob } = require('./contract');
const { createProviders } = require('./providers');
const { transitionAlert } = require('./lifecycle');
const { LocalRepository } = require('../data/repositories');

class NotificationService {
  constructor({ repository = new LocalRepository(), publish = () => {}, providers = createProviders(), idempotencyStore = null } = {}) {
    this.repository = repository;
    this.publish = publish;
    this.alerts = new Map();
    this.audit = [];
    this.jobs = new Map();
    this.providers = providers;
    this.notificationResults = new Map();
    this.inFlightNotifications = new Map();
    // Local state prevents duplicates within this process only. A durable store
    // can be injected by a DynamoDB/outbox adapter for distributed guarantees.
    this.idempotencyStore = idempotencyStore;
  }

  createDemoAlert(schoolId = 'greenfield') {
    const reading = createSeverePM25DemoReading({ schoolId });
    const config = getSchoolConfiguration(schoolId);
    const risk = evaluateRisk({ schoolId, currentPM25: reading.pm25, currentPM10: reading.pm10, thresholds: config.thresholds, childSensitiveMode: config.protectiveActions.childSensitiveMode });
    const alert = createAlert({
      alertId: `demo-alert-${schoolId}-285`,
      schoolId,
      schoolName: config.schoolName,
      severity: risk.severity,
      pollutant: 'PM2.5',
      currentValue: reading.pm25,
      predictedValue: 0,
      thresholds: config.thresholds,
      simulated: true
    });
    this.alerts.set(alert.alertId, alert);
    this.repository.saveReading(reading);
    this.repository.saveRisk(risk);
    this.repository.saveAlert(alert);
    const audit = createAuditEvent({ eventId: `alert-created-${alert.alertId}`, schoolId, eventType: 'alert.created', actorSource: 'local-demo', relatedAlertId: alert.alertId, details: { status: alert.status }, simulated: true });
    this.audit.push(audit);
    this.repository.saveAudit(audit);
    this.publish({ type: 'risk.alert.created', schoolId, reading, risk, alert, audit, simulated: true });
    return { reading, alert, risk };
  }

  queueAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error('Alert not found.');
    const config = getSchoolConfiguration(alert.schoolId);
    const recipients = routeRecipients(config, alert.severity);
    const job = {
      alertId: alert.alertId,
      schoolId: alert.schoolId,
      severity: alert.severity,
      pollutant: alert.pollutant,
      currentValue: alert.currentValue,
      predictedValue: alert.predictedValue,
      recommendedActions: alert.recommendedActions,
      message: alert.message,
      recipients,
      channels: [...new Set(recipients.map((item) => item.channel))],
      simulated: alert.simulated,
      createdAt: alert.createdAt,
      policyVersion: 'phase-1-v1'
    };
    validateNotificationJob(job);
    this.jobs.set(notificationIdempotencyKey(job), job);
    parentRoutingDecisions(config, alert.severity)
      .filter((decision) => !decision.allowed)
      .forEach((decision) => {
        const audit = createAuditEvent({
          eventId: `parent-notification-blocked-${alert.alertId}-${decision.parent.parentId}-${decision.channel}`,
          schoolId: alert.schoolId,
          eventType: 'parent.notification.blocked',
          actorSource: 'notification-router',
          relatedAlertId: alert.alertId,
          details: { parentId: decision.parent.parentId, channel: decision.channel, reason: decision.reason },
          simulated: alert.simulated
        });
        this.audit.push(audit);
        this.repository.saveAudit(audit);
      });
    const queued = transitionAlert(alert, 'QUEUED');
    this.alerts.set(alertId, queued);
    this.repository.saveAlert(queued);
    const audit = createAuditEvent({ eventId: `alert-queued-${alertId}`, schoolId: alert.schoolId, eventType: 'alert.queued', actorSource: 'local-demo', relatedAlertId: alertId, details: { status: queued.status }, simulated: alert.simulated });
    this.audit.push(audit);
    this.repository.saveAudit(audit);
    this.publish({ type: 'alert.queued', schoolId: alert.schoolId, alert: queued, job, audit, simulated: alert.simulated });
    return job;
  }

  async deliverLocal(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error('Alert not found.');
    const attempted = transitionAlert(alert, 'DELIVERY_ATTEMPTED');
    const job = [...this.jobs.values()].find((item) => item.alertId === alertId);
    const results = [];
    for (const recipient of job?.recipients || []) {
      const key = channelIdempotencyKey(job, recipient);
      results.push(await this.deliverRecipient(alert, job, recipient, key));
    }
    const hasFailure = results.some((result) => result.status === 'failed');
    const delivered = transitionAlert(attempted, hasFailure ? 'DELIVERY_FAILED' : 'DELIVERED');
    this.alerts.set(alertId, delivered);
    this.repository.saveAlert(delivered);
    const audit = createAuditEvent({ eventId: `alert-delivered-${alertId}`, schoolId: alert.schoolId, eventType: hasFailure ? 'alert.delivery_failed' : 'alert.delivered', actorSource: 'notification-router', relatedAlertId: alertId, details: { status: delivered.status, results }, simulated: alert.simulated });
    this.audit.push(audit);
    this.repository.saveAudit(audit);
    this.publish({ type: hasFailure ? 'alert.delivery.failed' : 'alert.delivered', schoolId: alert.schoolId, alert: delivered, audit, results, simulated: alert.simulated });
    return { alert: delivered, results };
  }

  async deliverRecipient(alert, job, recipient, key) {
      if (this.notificationResults.has(key)) return this.notificationResults.get(key);
      if (this.inFlightNotifications.has(key)) return this.inFlightNotifications.get(key);
      const delivery = (async () => {
        const notification = {
          recipient: recipient.destination,
          subject: 'Smart Breath Alert – Air Quality Action Required',
          message: this.parentMessage(alert, recipient),
          alertId: alert.alertId,
          schoolId: alert.schoolId,
          severity: alert.severity,
          timestamp: alert.createdAt,
          simulated: alert.simulated
        };
        try {
          if (this.idempotencyStore?.claim) {
            const claimed = await this.idempotencyStore.claim(key);
            if (!claimed) return this.notificationResults.get(key) || {
              key, channel: recipient.channel, status: 'already-claimed', simulated: alert.simulated
            };
          }
          const provider = this.providers[recipient.channel];
          if (!provider) throw new Error(`No configured provider for ${recipient.channel}.`);
          const result = recipient.channel === 'email'
            ? await provider.sendEmailNotification(notification)
            : recipient.channel === 'whatsapp'
              ? await provider.sendWhatsAppNotification(notification)
              : await provider.sendMessage(recipient.destination, notification.message, notification);
          const deliveredResult = { ...result, key, status: result.status || 'sent' };
          this.notificationResults.set(key, deliveredResult);
          if (this.idempotencyStore?.markSent) await this.idempotencyStore.markSent(key, deliveredResult);
          this.recordNotificationAudit(alert, recipient, deliveredResult);
          return deliveredResult;
        } catch (error) {
          const failed = { key, channel: recipient.channel, status: 'failed', error: error.message, simulated: alert.simulated };
          if (this.idempotencyStore?.release) await this.idempotencyStore.release(key);
          this.recordNotificationAudit(alert, recipient, failed);
          return failed;
        } finally {
          this.inFlightNotifications.delete(key);
        }
      })();
      this.inFlightNotifications.set(key, delivery);
      return delivery;
  }

  parentMessage(alert, recipient) {
    const school = getSchoolConfiguration(alert.schoolId);
    if (recipient.channel === 'whatsapp') {
      return `SMART BREATH ALERT\n\nSchool: ${school.schoolName}\nRisk: ${alert.severity.toUpperCase()}\nPM2.5: ${alert.currentValue} µg/m³\n\nRecommended action: Please follow the school's air-quality safety instructions and keep children indoors if advised by the school.\n\nThis is an air-quality safety notification, not a medical diagnosis.\nAlert ID: ${alert.alertId}\nTime: ${alert.createdAt}`;
    }
    return `Hello Parent/Guardian,\n\nSmart Breath has detected a high-risk air-quality condition at your child's school.\n\nSchool: ${school.schoolName}\nCurrent PM2.5: ${alert.currentValue} µg/m³\nRisk: ${alert.severity.toUpperCase()}\n\nRecommended school actions:\n• Keep outdoor activities indoors.\n• Follow the school's air-quality protective protocol.\n• Monitor official school communication channels.\n\nThis notification is an air-quality safety alert and is not a medical diagnosis.\n\nAlert ID: ${alert.alertId}\nTime: ${alert.createdAt}\n\nSmart Breath\nSchool Air Quality Early-Warning System`;
  }

  recordNotificationAudit(alert, recipient, result) {
    const event = createAuditEvent({
      eventId: `notification-${result.key}-${result.status}`,
      schoolId: alert.schoolId,
      eventType: `${recipient.channel}.${result.status}`,
      actorSource: 'notification-router',
      relatedAlertId: alert.alertId,
      details: { channel: recipient.channel, status: result.status, error: result.error },
      simulated: alert.simulated
    });
    this.audit.push(event);
    this.repository.saveAudit(event);
  }

  acknowledge(schoolId, alertId, actor) {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.schoolId !== schoolId) throw new Error('Alert not found.');
    const updated = transitionAlert(alert, 'ACKNOWLEDGED', new Date().toISOString(), actor);
    this.alerts.set(alertId, updated);
    this.repository.saveAlert(updated);
    const audit = createAuditEvent({ eventId: `ack-${alertId}-${actor}`, schoolId, eventType: 'alert.acknowledged', actorSource: actor, relatedAlertId: alertId, details: { actor }, simulated: alert.simulated });
    this.audit.push(audit);
    this.repository.saveAudit(audit);
    this.publish({ type: 'alert.acknowledged', schoolId, alert: updated, audit, simulated: alert.simulated });
    return updated;
  }

  escalate(schoolId, alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.schoolId !== schoolId) throw new Error('Alert not found.');
    const config = getSchoolConfiguration(schoolId);
    if (!config.escalationSettings.enabled) throw new Error('Escalation is disabled by institution policy.');
    const verified = config.contacts.filter((contact) =>
      contact.type === 'escalation' && contact.enabled && contact.verifiedByInstitution === true
    );
    if (verified.length === 0) {
      this.audit.push(createAuditEvent({
        eventId: `escalation-blocked-${alertId}`,
        schoolId,
        eventType: 'escalation.blocked.no-verified-contact',
        actorSource: 'system',
        relatedAlertId: alertId,
        details: { reason: 'No institution-verified escalation contact exists.' },
        simulated: alert.simulated
      }));
      throw new Error('Escalation blocked: no institution-verified escalation contact exists.');
    }
    const updated = transitionAlert(alert, 'ESCALATED');
    this.alerts.set(alertId, updated);
    this.audit.push(createAuditEvent({
      eventId: `escalation-${alertId}`,
      schoolId,
      eventType: 'alert.escalated',
      actorSource: 'system',
      relatedAlertId: alertId,
      details: { contactIds: verified.map((contact) => contact.contactId) },
      simulated: alert.simulated
    }));
    return { alert: updated, recipients: verified.map((contact) => contact.contactId) };
  }
}

module.exports = { NotificationService };
