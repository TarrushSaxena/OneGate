const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-23: Department Manager Staff Management — Provision support executive for department', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const itMgr = await accountStore.createAccount({
    email: 'it.mgr.prov@company.com',
    name: 'IT Operations Lead',
    role: 'department_manager',
    department: 'IT',
    password: 'ManagerPowersPass#2026',
    active: true,
  });
  const itToken = tokens.signToken(itMgr);

  const res = await fetchApi('/api/manager/staff', {
    method: 'POST',
    token: itToken,
    body: {
      name: 'Priya Sharma (IT L2)',
      email: 'priya.sharma.it@company.com',
      tier: 'L2',
      password: 'SecureStaffPass#2026',
    },
  });

  assert.strictEqual(res.status, 201, 'Should provision staff with 201');
  assert.strictEqual(res.data.staff.department, 'IT', 'Staff department must be IT');
  assert.strictEqual(res.data.staff.tier, 'L2', 'Staff tier must be L2');
  assert.strictEqual(res.data.staff.role, 'support_executive');
  assert.strictEqual(res.data.staff.password_hash, undefined, 'Password hash must be redacted');
});

test('PS18-23: Department Manager Staff Management — Change staff tier and live presence status', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const itMgr = accountStore.findByEmail('it.mgr.prov@company.com');
  const itToken = tokens.signToken(itMgr);
  const staff = accountStore.findByEmail('priya.sharma.it@company.com');
  assert.ok(staff, 'Staff exists in store');

  const patchRes = await fetchApi(`/api/manager/staff/${staff.id}`, {
    method: 'PATCH',
    token: itToken,
    body: {
      tier: 'L3',
      status: 'busy',
    },
  });

  assert.strictEqual(patchRes.status, 200, 'Should update staff with 200');
  assert.strictEqual(patchRes.data.staff.tier, 'L3', 'Tier promoted to L3');
  assert.strictEqual(patchRes.data.staff.status, 'busy', 'Status set to busy');
});

test('PS18-23: Department Manager Staff Management — Cross-department scoping (403 Forbidden)', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const hrMgr = await accountStore.createAccount({
    email: 'hr.mgr.prov@company.com',
    name: 'HR Operations Lead',
    role: 'department_manager',
    department: 'HR',
    password: 'ManagerPowersPass#2026',
    active: true,
  });
  const hrToken = tokens.signToken(hrMgr);
  const itStaff = accountStore.findByEmail('priya.sharma.it@company.com');

  const forbiddenRes = await fetchApi(`/api/manager/staff/${itStaff.id}`, {
    method: 'PATCH',
    token: hrToken,
    body: {
      tier: 'L1',
    },
  });

  assert.strictEqual(forbiddenRes.status, 403, 'Cross-department staff modification must return 403');
});

test('PS18-23: Department Manager Attendance & Swipe Simulation — Clock in staff member', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const itMgr = accountStore.findByEmail('it.mgr.prov@company.com');
  const itToken = tokens.signToken(itMgr);
  const itStaff = accountStore.findByEmail('priya.sharma.it@company.com');

  const swipeRes = await fetchApi(`/api/manager/staff/${itStaff.id}/swipe`, {
    method: 'POST',
    token: itToken,
    body: {
      direction: 'IN',
    },
  });

  assert.strictEqual(swipeRes.status, 200, 'Swipe simulation succeeded');
  assert.strictEqual(swipeRes.data.attendance.status, 'present', 'Staff is now present');
  assert.ok(swipeRes.data.attendance.first_swipe_in, 'First swipe recorded');
});

test('PS18-23: Department Manager Broadcast Announcements — Send priority announcement to department staff', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const itMgr = accountStore.findByEmail('it.mgr.prov@company.com');
  const itToken = tokens.signToken(itMgr);

  const annRes = await fetchApi('/api/manager/announcements', {
    method: 'POST',
    token: itToken,
    body: {
      title: 'Emergency: Maintenance Window Tonight',
      body: 'All IT specialists ensure ticket backlog is cleared before 9 PM maintenance window.',
      priority: 'urgent',
      pinned: true,
    },
  });

  assert.strictEqual(annRes.status, 201, 'Broadcast announcement created with 201');
  assert.strictEqual(annRes.data.announcement.department, 'IT', 'Announcement scoped to IT');
  assert.strictEqual(annRes.data.announcement.priority, 'urgent');

  const listRes = await fetchApi('/api/manager/announcements', {
    method: 'GET',
    token: itToken,
  });

  assert.strictEqual(listRes.status, 200);
  assert.ok(listRes.data.some(a => a.title.includes('Maintenance Window Tonight')), 'Announcement appears in list');
});

test('PS18-23: Department Manager Queue Assignment — Reassign ticket to department specialist', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');
  const { state } = await startTestServer();

  state.tickets.push({
    id: 't-powers-001',
    department: 'IT',
    priority: 'high',
    status: 'open',
    required_tier: 'L2',
    subject: 'VPN Gateway Tunnel Down',
    created_at: new Date().toISOString(),
  });

  const itMgr = accountStore.findByEmail('it.mgr.prov@company.com');
  const itToken = tokens.signToken(itMgr);
  const itStaff = accountStore.findByEmail('priya.sharma.it@company.com');

  const reassignRes = await fetchApi('/api/manager/queue/t-powers-001/assign', {
    method: 'PATCH',
    token: itToken,
    body: {
      agentId: itStaff.id,
    },
  });

  assert.strictEqual(reassignRes.status, 200);
  assert.strictEqual(reassignRes.data.ticket.assigned_agent_id, itStaff.id);
  assert.strictEqual(reassignRes.data.ticket.assigned_agent_name, itStaff.name);
  assert.strictEqual(reassignRes.data.ticket.status, 'assigned');
});

test('PS18-23: Main Manager Signup Scope — Registration with role main_manager defaults to department All', async () => {
  const signupRes = await fetchApi('/api/auth/signup', {
    method: 'POST',
    body: {
      name: 'Global Executive Director',
      email: 'global.director@company.com',
      role: 'main_manager',
      department: 'IT',
      password: 'GlobalExecutivePass#2026',
    },
  });

  assert.strictEqual(signupRes.status, 201);
  assert.strictEqual(signupRes.data.user.role, 'main_manager');
  assert.strictEqual(signupRes.data.user.department, 'All', 'Main manager department is set to All');
});
