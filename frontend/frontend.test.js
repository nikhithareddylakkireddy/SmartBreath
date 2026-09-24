const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const frontendRoot = __dirname;
function read(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');
}

test('frontend API layer centralizes required school operations', () => {
  const source = read('lib/api-client.js');
  for (const operation of ['readings', 'predictions', 'alerts', 'audit', 'contacts', 'acknowledge', 'demo']) {
    assert.match(source, new RegExp(`${operation}:`));
  }
});

test('dashboard includes safety disclaimer, demo label, and connection states', () => {
  const page = read('app/page.js');
  const alert = read('components/AlertCenter.js');
  const socket = read('lib/use-smartbreath-socket.js');
  assert.match(page, /does not diagnose medical conditions/);
  assert.match(page, /Simulate Severe PM2\.5/);
  assert.match(alert, /SIMULATED DEMO/);
  assert.match(socket, /LIVE/);
  assert.match(socket, /RECONNECTING/);
  assert.match(socket, /OFFLINE/);
});

test('responsive styles include keyboard focus and mobile layout rules', () => {
  const styles = read('styles/globals.css');
  assert.match(styles, /focus-visible/);
  assert.match(styles, /max-width:560px/);
  assert.match(styles, /grid-template-columns:1fr/);
});
