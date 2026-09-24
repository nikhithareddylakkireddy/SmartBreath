const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { app, notifications, subscribeToEvents } = require('./server');
const { transitionAlert } = require('../notifications/lifecycle');

function request(server, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      path,
      method: options.method || 'GET',
      headers: {
        'x-local-user': JSON.stringify({ sub: 'e2e-admin', schoolId: 'greenfield', groups: ['school-administrator'] }),
        ...(options.headers || {})
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end(options.body);
  });
}

test('local demo runs reading through alert, audit, and live event boundaries', async () => {
  process.env.AUTH_MODE = 'local';
  const server = app.listen(0);
  const events = [];
  const unsubscribe = subscribeToEvents((event) => events.push(event));
  try {
    const result = await request(server, '/api/schools/greenfield/demo/severe-pm25', { method: 'POST' });
    assert.equal(result.statusCode, 201);
    assert.equal(result.body.reading.pm25, 285);
    assert.equal(result.body.alert.status, 'DELIVERED');
    assert.equal(result.body.localProviderMode, 'LOCAL_MOCK');
    assert.ok(events.some((event) => event.type === 'risk.alert.created' && event.schoolId === 'greenfield'));
    assert.ok(events.some((event) => event.type === 'alert.delivered'));

    const audit = await request(server, '/api/schools/greenfield/audit');
    assert.ok(audit.body.some((event) => event.eventType === 'alert.created'));
    assert.throws(() => transitionAlert(result.body.alert, 'QUEUED'), /Invalid alert transition/);
  } finally {
    unsubscribe();
    server.close();
    notifications.alerts.clear();
    notifications.jobs.clear();
    notifications.audit.length = 0;
  }
});
