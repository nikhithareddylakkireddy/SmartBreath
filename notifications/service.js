const { createAlert, createAuditEvent, getSchoolConfiguration, evaluateRisk, createSeverePM25DemoReading } = require('../domain');
const { routeRecipients } = require('./routing');
const { notificationIdempotencyKey, validateNotificationJob } = require('./contract');
const { transitionAlert } = require('./lifecycle');
const { LocalRepository } = require('../data/repositories');

class NotificationService {
  constructor({ repository = new LocalRepository(), publish = () => {} } = {}) {
    this.repository = repository;
    this.publish = publish;
    this.alerts = new Map();
    this.audit = [];
    this.jobs = new Map();
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
    const queued = transitionAlert(alert, 'QUEUED');
    this.alerts.set(alertId, queued);
    this.repository.saveAlert(queued);
    const audit = createAuditEvent({ eventId: `alert-queued-${alertId}`, schoolId: alert.schoolId, eventType: 'alert.queued', actorSource: 'local-demo', relatedAlertId: alertId, details: { status: queued.status }, simulated: alert.simulated });
    this.audit.push(audit);
    this.repository.saveAudit(audit);
    this.publish({ type: 'alert.queued', schoolId: alert.schoolId, alert: queued, job, audit, simulated: alert.simulated });
    return job;
  }

  deliverLocal(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error('Alert not found.');
    const attempted = transitionAlert(alert, 'DELIVERY_ATTEMPTED');
    const delivered = transitionAlert(attempted, 'DELIVERED');
    this.alerts.set(alertId, delivered);
    this.repository.saveAlert(delivered);
    const audit = createAuditEvent({ eventId: `alert-delivered-${alertId}`, schoolId: alert.schoolId, eventType: 'alert.delivered', actorSource: 'local-provider', relatedAlertId: alertId, details: { status: delivered.status }, simulated: alert.simulated });
    this.audit.push(audit);
    this.repository.saveAudit(audit);
    this.publish({ type: 'alert.delivered', schoolId: alert.schoolId, alert: delivered, audit, simulated: alert.simulated });
    return delivered;
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
