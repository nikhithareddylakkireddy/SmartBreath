const TRANSITIONS = {
  CREATED: ['QUEUED'],
  QUEUED: ['DELIVERY_ATTEMPTED'],
  DELIVERY_ATTEMPTED: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERY_FAILED: ['DELIVERY_ATTEMPTED', 'ESCALATED'],
  DELIVERED: ['ACKNOWLEDGED', 'ESCALATED', 'RESOLVED'],
  ACKNOWLEDGED: ['RESOLVED', 'ESCALATED'],
  ESCALATED: ['ACKNOWLEDGED', 'RESOLVED'],
  RESOLVED: []
};

function transitionAlert(alert, nextStatus, timestamp = new Date().toISOString(), actor = 'system') {
  if (!TRANSITIONS[alert.status]?.includes(nextStatus)) throw new Error(`Invalid alert transition ${alert.status} -> ${nextStatus}.`);
  const next = { ...alert, status: nextStatus, updatedAt: timestamp };
  const fields = {
    QUEUED: 'queuedAt',
    DELIVERY_ATTEMPTED: 'deliveryAttemptedAt',
    DELIVERED: 'deliveredAt',
    DELIVERY_FAILED: 'deliveryFailedAt',
    ACKNOWLEDGED: 'acknowledgedAt',
    RESOLVED: 'resolvedAt',
    ESCALATED: 'escalatedAt'
  };
  if (fields[nextStatus]) next[fields[nextStatus]] = timestamp;
  if (nextStatus === 'ACKNOWLEDGED') next.acknowledgedBy = actor;
  return next;
}

module.exports = { TRANSITIONS, transitionAlert };
