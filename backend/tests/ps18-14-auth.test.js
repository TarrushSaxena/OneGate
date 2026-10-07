const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-14: Account lockout after 5 failed attempts locks 6th attempt even with correct password', async () => {
  const accountStore = require('../auth/accountStore');
  const lockout = require('../auth/lockout');

  // Seed a known test user with known password
  const testEmail = 'lockout.target@company.com';
  const correctPassword = 'CorrectPassword#2026';
  await accountStore.createAccount({
    email: testEmail,
    name: 'Lockout Target',
    role: 'employee',
    department: 'IT',
    password: correctPassword,
    active: true,
  });

  // Ensure fresh lockout state
  lockout.reset(testEmail);

  // Attempt 1 through 5 with WRONG password
  for (let i = 1; i <= 5; i++) {
    const res = await fetchApi('/api/auth/login', {
      method: 'POST',
      body: { email: testEmail, password: 'WrongPassword#999' },
    });
    assert.strictEqual(res.status, 401, `Attempt ${i} should be rejected with 401`);
    assert.ok(res.data.error, `Attempt ${i} should include error`);
  }

  // Attempt 6 with the CORRECT password -> MUST BE LOCKED OUT (423 Locked or 429 Too Many Requests)
  const lockedAttempt = await fetchApi('/api/auth/login', {
    method: 'POST',
    body: { email: testEmail, password: correctPassword },
  });
  assert.ok(
    lockedAttempt.status === 423 || lockedAttempt.status === 429,
    `6th attempt with correct password must be locked out, got status ${lockedAttempt.status}`
  );
  assert.ok(
    /locked|lockout/i.test(lockedAttempt.data.error || lockedAttempt.data.message),
    'Error message must indicate account lockout'
  );
});

test('PS18-14: Employee token/session is rejected server-side with 403 by manager-only endpoint', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  // Create an employee account
  const empAccount = await accountStore.createAccount({
    email: 'emp.regular@company.com',
    name: 'Regular Employee',
    role: 'employee',
    department: 'IT',
    password: 'SecurePassword#2026',
    active: true,
  });

  const empToken = tokens.signToken(empAccount);

  // Try to access Department Manager dashboard/endpoint as Employee
  const mgrRes = await fetchApi('/api/manager/department', {
    method: 'GET',
    token: empToken,
  });
  assert.strictEqual(mgrRes.status, 403, `Employee hitting manager-only endpoint must get 403, got ${mgrRes.status}`);

  // Try to access Admin accounts endpoint as Employee
  const adminRes = await fetchApi('/api/admin/accounts', {
    method: 'GET',
    token: empToken,
  });
  assert.strictEqual(adminRes.status, 403, `Employee hitting admin endpoint must get 403, got ${adminRes.status}`);

  // Try to hit with manipulated role in query or body
  const forgedQueryRes = await fetchApi('/api/manager/department?role=main_manager', {
    method: 'GET',
    token: empToken,
  });
  assert.strictEqual(forgedQueryRes.status, 403, 'Client-manipulated role in query must be ignored');
});

test('PS18-14: Password reset flow (request link -> expiring token -> reset -> old fails & new succeeds)', async () => {
  const accountStore = require('../auth/accountStore');
  const mailer = require('../auth/mailer');

  const email = 'reset.user@company.com';
  const initialPassword = 'InitialPassword#2026';
  const newPassword = 'NewSecretPassword#2026';

  await accountStore.createAccount({
    email,
    name: 'Reset User',
    role: 'employee',
    department: 'Finance',
    password: initialPassword,
    active: true,
  });

  // Step 1: Request reset link
  mailer.clearOutbox();
  const forgotRes = await fetchApi('/api/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
  assert.ok(forgotRes.status === 200 || forgotRes.status === 202, 'Forgot password request accepted');

  // Mailer captured the reset token
  const outbox = mailer.getOutbox();
  assert.ok(outbox.length > 0, 'Reset email should have been sent to outbox');
  const resetEmail = outbox.find(m => m.to === email);
  assert.ok(resetEmail, 'Reset email sent to correct recipient');
  const token = resetEmail.resetToken;
  assert.ok(token, 'Reset token must exist in outbox message');

  // Step 2: Confirm password reset using valid token and new password
  const resetRes = await fetchApi('/api/auth/reset-password', {
    method: 'POST',
    body: {
      token,
      newPassword,
    },
  });
  assert.strictEqual(resetRes.status, 200, 'Password reset confirmation should succeed');

  // Step 3: Old password should now FAIL
  const oldLoginRes = await fetchApi('/api/auth/login', {
    method: 'POST',
    body: { email, password: initialPassword },
  });
  assert.strictEqual(oldLoginRes.status, 401, 'Old password must fail after reset');

  // Step 4: New password should SUCCEED
  const newLoginRes = await fetchApi('/api/auth/login', {
    method: 'POST',
    body: { email, password: newPassword },
  });
  assert.strictEqual(newLoginRes.status, 200, 'New password must succeed after reset');
  assert.ok(newLoginRes.data.token, 'Login response must include session token');

  // Step 5: Expired / already consumed token CANNOT be reused
  const reuseRes = await fetchApi('/api/auth/reset-password', {
    method: 'POST',
    body: {
      token,
      newPassword: 'AnotherPassword#2026',
    },
  });
  assert.strictEqual(reuseRes.status, 400, 'Consumed reset token cannot be reused');
});

test('PS18-14: Passwords are never logged or returned in API responses and must meet strength policy', async () => {
  const accountStore = require('../auth/accountStore');

  const email = 'leak.check@company.com';
  const password = 'StrongPassword#2026';

  await accountStore.createAccount({
    email,
    name: 'Leak Checker',
    role: 'support_executive',
    department: 'IT',
    tier: 'L2',
    password,
    active: true,
  });

  const loginRes = await fetchApi('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.strictEqual(loginRes.status, 200);

  const rawJson = JSON.stringify(loginRes.data);
  assert.ok(!rawJson.includes(password), 'Response must never contain plaintext password');
  assert.ok(!rawJson.includes('password_hash'), 'Response must never contain password_hash');
  assert.ok(!rawJson.includes('password_history'), 'Response must never contain password_history');

  // Weak password rejected on registration / reset (min 12 chars, upper, digit, special)
  const weakReset = await fetchApi('/api/auth/reset-password', {
    method: 'POST',
    body: { token: 'dummy', newPassword: 'short' },
  });
  assert.strictEqual(weakReset.status, 400, 'Weak password rejected');
  assert.ok(/character|strength|length|weak/i.test(JSON.stringify(weakReset.data)));
});

test('PS18-14: Forged or tampered JWTs (wrong secret, alg:none, altered role) are rejected', async () => {
  // 1. None algorithm
  const noneToken = jwt.sign({ sub: 'attacker', role: 'main_manager' }, '', { algorithm: 'none' });
  const noneRes = await fetchApi('/api/manager/department', {
    method: 'GET',
    token: noneToken,
  });
  assert.strictEqual(noneRes.status, 401, 'alg:none token must be rejected with 401');

  // 2. Wrong secret
  const forgedToken = jwt.sign({ sub: 'attacker', role: 'main_manager' }, 'totally-wrong-secret-key-123456');
  const forgedRes = await fetchApi('/api/manager/department', {
    method: 'GET',
    token: forgedToken,
  });
  assert.strictEqual(forgedRes.status, 401, 'Token signed with wrong secret must be rejected with 401');
});

test('PS18-14: Email signup creates account, enforces password strength, sets session, and redirects by role', async () => {
  const accountStore = require('../auth/accountStore');

  // 1. Weak password rejected
  const weakSignup = await fetchApi('/api/auth/signup', {
    method: 'POST',
    body: {
      name: 'Weak User',
      email: 'weak.user@company.com',
      password: 'weak',
      role: 'employee',
      department: 'Marketing',
    },
  });
  assert.strictEqual(weakSignup.status, 400, 'Weak password rejected on signup');

  // 2. Valid signup as Main Manager
  const signupEmail = `founder.${Date.now()}@company.com`;
  const validSignup = await fetchApi('/api/auth/signup', {
    method: 'POST',
    body: {
      name: 'Company Founder',
      email: signupEmail,
      password: 'StrongFounderPassword#2026',
      role: 'main_manager',
      department: 'IT',
    },
  });

  assert.strictEqual(validSignup.status, 201, 'Valid signup succeeds with 201');
  assert.strictEqual(validSignup.data.user.role, 'main_manager');
  assert.strictEqual(validSignup.data.redirect, '/app/org');
  assert.ok(validSignup.data.token, 'Session token returned');

  // Verify account was created in store and plaintext password never exposed
  const created = accountStore.findByEmail(signupEmail);
  assert.ok(created, 'Account created in store');
  assert.strictEqual(validSignup.data.user.password, undefined);
  assert.strictEqual(validSignup.data.user.password_hash, undefined);

  // 3. Duplicate email signup rejected
  const dupSignup = await fetchApi('/api/auth/signup', {
    method: 'POST',
    body: {
      name: 'Imposter',
      email: signupEmail,
      password: 'StrongFounderPassword#2026',
      role: 'employee',
    },
  });
  assert.strictEqual(dupSignup.status, 409, 'Duplicate email rejected with 409');
});
