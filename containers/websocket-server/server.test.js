const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeChannel, authenticateConnection } = require('./server');

test('WebSocket channel authorization isolates schools', () => {
  assert.equal(authorizeChannel({ schoolId: 'greenfield', requestedSchoolId: 'greenfield' }), true);
  assert.throws(() => authorizeChannel({ schoolId: 'greenfield', requestedSchoolId: 'other-school' }), /mismatch/);
  assert.throws(() => authorizeChannel({ schoolId: null, requestedSchoolId: 'greenfield' }), /mismatch/);
});

test('WebSocket authentication boundary binds production claims to the school channel', () => {
  const original = process.env.AUTH_MODE;
  process.env.AUTH_MODE = 'production';
  assert.deepEqual(authenticateConnection({
    token: 'jwt',
    expectedSchoolId: 'greenfield',
    verifyToken: () => ({ schoolId: 'greenfield' })
  }), { schoolId: 'greenfield', mode: 'COGNITO_BOUNDARY' });
  assert.throws(() => authenticateConnection({
    token: 'jwt',
    expectedSchoolId: 'greenfield',
    verifyToken: () => ({ schoolId: 'other-school' })
  }), /mismatch/);
  if (original === undefined) delete process.env.AUTH_MODE;
  else process.env.AUTH_MODE = original;
});
