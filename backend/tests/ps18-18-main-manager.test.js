const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');
const { DEPARTMENT_IDS } = require('../auth/departments');

test.before(async () => {
  const { state } = await startTestServer();

  // Seed sample tickets across several departments
  state.tickets = [
    { id: 't-it-1', department: 'IT', status: 'open', priority: 'high', created_at: Date.now(), sla_deadline: Date.now() + 3600000 },
    { id: 't-hr-1', department: 'HR', status: 'resolved', priority: 'normal', created_at: Date.now() - 3600000, resolved_at: Date.now(), csat: 5 },
    { id: 't-fin-1', department: 'Finance', status: 'open', priority: 'critical', created_at: Date.now(), sla_deadline: Date.now() + 1800000 },
    { id: 't-bill-1', department: 'Billing', status: 'resolved', priority: 'low', created_at: Date.now() - 7200000, resolved_at: Date.now() },
    { id: 't-leg-1', department: 'Legal', status: 'open', priority: 'normal', created_at: Date.now(), sla_deadline: Date.now() + 7200000 },
  ];
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-18: Main Manager aggregate endpoint returns all 11 departments', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  // Seed Main Manager
  const mainMgr = await accountStore.createAccount({
    email: 'main.exec.test@company.com',
    name: 'Executive Main Manager',
    role: 'main_manager',
    department: 'IT',
    password: 'MainExecPass#2026',
    active: true,
    must_change_password: false,
  });

  const mainToken = tokens.signToken(mainMgr);

  const res = await fetchApi('/api/dashboard/all', {
    method: 'GET',
    token: mainToken,
  });

  assert.strictEqual(res.status, 200, 'Main Manager can access org aggregate');
  assert.strictEqual(typeof res.data.totalOpen, 'number', 'Total open tickets aggregate');
  assert.strictEqual(typeof res.data.totalResolved, 'number', 'Total resolved tickets aggregate');
  assert.strictEqual(typeof res.data.orgSlaCompliance, 'number', 'Org SLA compliance');

  // Verify all 11 departments are represented in department breakdown
  assert.strictEqual(res.data.departmentCount, 11, 'Must include exactly 11 departments');
  assert.strictEqual(res.data.departments.length, 11, 'Breakdown table has 11 department rows');

  const returnedDeptIds = res.data.departments.map(d => d.department);
  for (const expectedId of DEPARTMENT_IDS) {
    assert.ok(
      returnedDeptIds.includes(expectedId),
      `Department ${expectedId} must be present in Main Manager aggregate`
    );
  }

  // Verify breakdown properties
  const itRow = res.data.departments.find(d => d.department === 'IT');
  assert.ok(itRow, 'IT row exists');
  assert.strictEqual(typeof itRow.open, 'number');
  assert.strictEqual(typeof itRow.resolved, 'number');
  assert.strictEqual(typeof itRow.slaCompliance, 'number');
  assert.strictEqual(typeof itRow.staffCount, 'number');
});

test('PS18-18: Department Manager calling /api/dashboard/all gets strictly their department slice', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  // Seed Legal Department Manager
  const legalMgr = await accountStore.createAccount({
    email: 'legal.mgr.test@company.com',
    name: 'Legal Department Manager',
    role: 'department_manager',
    department: 'Legal',
    password: 'LegalMgrPass#2026',
    active: true,
    must_change_password: false,
  });

  const legalToken = tokens.signToken(legalMgr);

  const res = await fetchApi('/api/dashboard/all', {
    method: 'GET',
    token: legalToken,
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.departmentCount, 1, 'Dept manager only receives 1 department');
  assert.strictEqual(res.data.departments.length, 1, 'Only 1 department in breakdown table');
  assert.strictEqual(res.data.departments[0].department, 'Legal', 'Must be strictly Legal');
  assert.strictEqual(
    res.data.departments.some(d => d.department !== 'Legal'),
    false,
    'Zero other departments leaked to Department Manager'
  );
});

test('PS18-18: Drill-down — Main Manager reads any department with readOnly flag; Dept Manager blocked', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const mainMgr = accountStore.findByEmail('main.exec.test@company.com');
  const legalMgr = accountStore.findByEmail('legal.mgr.test@company.com');

  const mainToken = tokens.signToken(mainMgr);
  const legalToken = tokens.signToken(legalMgr);

  // 1. Main Manager can read IT, HR, Finance, Legal, etc. in read-only observation mode
  const deptsToTest = ['IT', 'HR', 'Finance', 'Legal', 'Cybersecurity'];
  for (const dept of deptsToTest) {
    const res = await fetchApi(`/api/departments/${dept}/dashboard`, {
      method: 'GET',
      token: mainToken,
    });
    assert.strictEqual(res.status, 200, `Main Manager can read ${dept} dashboard`);
    assert.strictEqual(res.data.department, dept);
    assert.ok(res.data.readOnly !== undefined, 'Includes readOnly flag for observer');
  }

  // 2. Legal Manager can read Legal dashboard
  const legalOwnRes = await fetchApi('/api/departments/Legal/dashboard', {
    method: 'GET',
    token: legalToken,
  });
  assert.strictEqual(legalOwnRes.status, 200, 'Legal manager can read own dashboard');
  assert.strictEqual(legalOwnRes.data.department, 'Legal');

  // 3. Legal Manager CANNOT read IT, HR, or Finance dashboard (403 Forbidden)
  for (const foreignDept of ['IT', 'HR', 'Finance']) {
    const foreignRes = await fetchApi(`/api/departments/${foreignDept}/dashboard`, {
      method: 'GET',
      token: legalToken,
    });
    assert.strictEqual(
      foreignRes.status,
      403,
      `Legal manager reading ${foreignDept} must receive 403 Forbidden, got ${foreignRes.status}`
    );
  }
});
