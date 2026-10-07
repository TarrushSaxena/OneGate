const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');

test.before(async () => {
  await startTestServer();
  const accounts = require('../auth/accountStore');
  if (!accounts.findByEmail('employee@company.com')) {
    await accounts.createAccount({
      id: 'acct-demo-employee-test',
      name: 'Demo Employee',
      email: 'employee@company.com',
      password: 'TestOnly!12345',
      role: 'employee',
      department: 'IT',
      active: true,
      must_change_password: false,
    });
  }
});

test.after(async () => stopTestServer());

test('demo directory exposes public profiles and performs allowlisted demo login', async () => {
  const directory = await fetchApi('/api/auth/demo-accounts');
  assert.strictEqual(directory.status, 200);
  const employee = directory.data.accounts.find(account => account.key === 'employee');
  assert.ok(employee);
  assert.strictEqual(employee.password, undefined);
  assert.strictEqual(employee.password_hash, undefined);

  const login = await fetchApi('/api/auth/demo-login', { method:'POST', body:{ key:'employee' } });
  assert.strictEqual(login.status, 200);
  assert.strictEqual(login.data.user.role, 'employee');
  assert.strictEqual(login.data.redirect, '/app/chat');
  assert.strictEqual(login.data.demo, true);

  const invalid = await fetchApi('/api/auth/demo-login', { method:'POST', body:{ key:'not-on-the-roster' } });
  assert.strictEqual(invalid.status, 404);
});
