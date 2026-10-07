const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-16: Post-login redirect targets per role', async () => {
  const accountStore = require('../auth/accountStore');

  // Create accounts for all 4 roles
  const accounts = [
    { email: 'emp.route@company.com', role: 'employee', department: 'IT', redirect: '/app/chat' },
    { email: 'supp.route@company.com', role: 'support_executive', department: 'IT', redirect: '/app/inbox' },
    { email: 'dept.route@company.com', role: 'department_manager', department: 'IT', redirect: '/app/department' },
    { email: 'main.route@company.com', role: 'main_manager', department: 'IT', redirect: '/app/org' },
  ];

  for (const acc of accounts) {
    await accountStore.createAccount({
      email: acc.email,
      name: `Test ${acc.role}`,
      role: acc.role,
      department: acc.department,
      password: 'SecurePassword#2026',
      active: true,
      must_change_password: false,
    });

    const res = await fetchApi('/api/auth/login', {
      method: 'POST',
      body: {
        email: acc.email,
        password: 'SecurePassword#2026',
      },
    });

    assert.strictEqual(res.status, 200, `Login succeeded for ${acc.role}`);
    assert.strictEqual(
      res.data.redirect,
      acc.redirect,
      `Expected ${acc.role} to redirect to ${acc.redirect}, got ${res.data.redirect}`
    );
  }
});

test('PS18-16: Direct navigation to role pages returns 403 Forbidden on wrong role', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const emp = accountStore.findByEmail('emp.route@company.com');
  const supp = accountStore.findByEmail('supp.route@company.com');
  const deptMgr = accountStore.findByEmail('dept.route@company.com');
  const mainMgr = accountStore.findByEmail('main.route@company.com');

  const empToken = tokens.signToken(emp);
  const suppToken = tokens.signToken(supp);
  const deptToken = tokens.signToken(deptMgr);
  const mainToken = tokens.signToken(mainMgr);

  // Test matrix: [endpoint, authorizedTokens, forbiddenTokens]
  const matrix = [
    {
      path: '/app/chat',
      authorized: [{ role: 'employee', token: empToken }],
      forbidden: [
        { role: 'support_executive', token: suppToken },
        { role: 'department_manager', token: deptToken },
        { role: 'main_manager', token: mainToken },
      ],
    },
    {
      path: '/app/inbox',
      authorized: [{ role: 'support_executive', token: suppToken }],
      forbidden: [
        { role: 'employee', token: empToken },
        { role: 'department_manager', token: deptToken },
        { role: 'main_manager', token: mainToken },
      ],
    },
    {
      path: '/app/department',
      authorized: [
        { role: 'department_manager', token: deptToken },
        { role: 'main_manager', token: mainToken },
      ],
      forbidden: [
        { role: 'employee', token: empToken },
        { role: 'support_executive', token: suppToken },
      ],
    },
    {
      path: '/app/org',
      authorized: [{ role: 'main_manager', token: mainToken }],
      forbidden: [
        { role: 'employee', token: empToken },
        { role: 'support_executive', token: suppToken },
        { role: 'department_manager', token: deptToken },
      ],
    },
  ];

  for (const item of matrix) {
    // 1. Authorized roles should receive 200 OK
    for (const auth of item.authorized) {
      const res = await fetchApi(item.path, {
        method: 'GET',
        token: auth.token,
      });
      assert.strictEqual(
        res.status,
        200,
        `Expected ${auth.role} to access ${item.path} with status 200, got ${res.status}`
      );
    }

    // 2. Forbidden roles MUST receive 403 Forbidden
    for (const forb of item.forbidden) {
      const res = await fetchApi(item.path, {
        method: 'GET',
        token: forb.token,
      });
      assert.strictEqual(
        res.status,
        403,
        `Expected ${forb.role} accessing ${item.path} to receive 403 Forbidden, got ${res.status}`
      );
    }
  }

  // 3. Unauthenticated access without token should return 401 or redirect to /login
  const unauthRes = await fetchApi('/app/chat', { method: 'GET' });
  assert.ok(
    unauthRes.status === 401 || unauthRes.status === 302,
    `Unauthenticated access to /app/chat should return 401 or 302, got ${unauthRes.status}`
  );
});
