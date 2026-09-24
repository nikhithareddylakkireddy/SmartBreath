class LocalRepository {
  constructor() {
    this.readings = [];
    this.predictions = [];
    this.risks = [];
    this.alerts = new Map();
    this.audit = [];
    this.schools = new Map();
    this.contacts = new Map();
    this.subscribers = new Set();
  }

  subscribe(listener) { this.subscribers.add(listener); return () => this.subscribers.delete(listener); }
  publish(event) { for (const listener of this.subscribers) listener(event); }
  saveReading(reading) { this.readings.push(reading); return reading; }
  savePrediction(prediction) { this.predictions.push(prediction); return prediction; }
  saveRisk(risk) { this.risks.push(risk); return risk; }
  saveAlert(alert) { this.alerts.set(alert.alertId, alert); return alert; }
  saveAudit(event) { this.audit.push(event); return event; }
  getReadings(schoolId) { return this.readings.filter((item) => item.schoolId === schoolId); }
  getPredictions(schoolId) { return this.predictions.filter((item) => item.schoolId === schoolId); }
  getRisks(schoolId) { return this.risks.filter((item) => item.schoolId === schoolId); }
  getAlerts(schoolId) { return [...this.alerts.values()].filter((item) => item.schoolId === schoolId); }
  getAudit(schoolId) { return this.audit.filter((item) => item.schoolId === schoolId); }
  getContacts(schoolId) { return this.contacts.get(schoolId) || []; }
}

function createAwsBoundary({ dynamo, aurora, s3 } = {}) {
  const missing = (name) => async () => { throw new Error(`AWS ${name} adapter is not configured.`); };
  return {
    saveReading: dynamo?.saveReading || missing('DynamoDB reading'),
    savePrediction: dynamo?.savePrediction || missing('DynamoDB prediction'),
    saveRisk: dynamo?.saveRisk || missing('DynamoDB risk'),
    saveAlert: dynamo?.saveAlert || missing('DynamoDB alert'),
    saveAudit: dynamo?.saveAudit || missing('DynamoDB audit'),
    getReadings: dynamo?.getReadings || missing('DynamoDB readings'),
    getPredictions: dynamo?.getPredictions || missing('DynamoDB predictions'),
    getRisks: dynamo?.getRisks || missing('DynamoDB risks'),
    getAlerts: dynamo?.getAlerts || missing('DynamoDB alerts'),
    getAudit: dynamo?.getAudit || missing('DynamoDB audit'),
    getContacts: aurora?.getContacts || missing('Aurora contacts'),
    saveRawReading: s3?.saveRawReading || missing('S3 raw reading')
  };
}

module.exports = { LocalRepository, createAwsBoundary };
