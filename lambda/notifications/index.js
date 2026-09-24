const { validateNotificationJob, notificationIdempotencyKey } = require('../../notifications/contract');
const { createProviders } = require('../../notifications/providers');

const providers = createProviders();
const delivered = new Set();

async function handler(event) {
  const messages = event.Records || [event];
  const results = [];
  for (const record of messages) {
    const job = typeof record.body === 'string' ? JSON.parse(record.body) : record.body || record;
    validateNotificationJob(job);
    const key = notificationIdempotencyKey(job);
    if (delivered.has(key)) {
      results.push({ key, status: 'already-delivered' });
      continue;
    }
    for (const recipient of job.recipients) {
      const provider = providers[recipient.channel];
      if (!provider) throw new Error(`No configured local provider for ${recipient.channel}.`);
      await provider.sendMessage(recipient.destination, job.message);
    }
    delivered.add(key);
    results.push({ key, status: 'delivered', providerMode: 'LOCAL_MOCK' });
  }
  return { results };
}

module.exports = { handler, delivered };
