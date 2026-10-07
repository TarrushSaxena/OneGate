const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-20: Door swipe simulation logs events and derives daily attendance', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  // Seed Employee A
  const empA = await accountStore.createAccount({
    email: 'emp.attendance.a@company.com',
    name: 'Attendance User A',
    role: 'employee',
    department: 'Engineering',
    password: 'SecurePass#2026A',
    active: true,
    must_change_password: false,
  });
  const tokenA = tokens.signToken(empA);

  // 1. Simulate Swipe In
  const swipeInRes = await fetchApi('/api/corporate/swipes/simulate', {
    method: 'POST',
    token: tokenA,
    body: {
      door_id: 'turnstile-blr-gate-1',
      building: 'Bangalore Campus B',
      floor: 1,
      direction: 'in',
    },
  });

  assert.strictEqual(swipeInRes.status, 201, 'Swipe in returns 201');
  assert.strictEqual(swipeInRes.data.event.direction, 'in');
  assert.strictEqual(swipeInRes.data.event.employee_id, empA.id);
  assert.ok(swipeInRes.data.event.timestamp, 'Timestamp recorded');

  // 2. Simulate Swipe Out 4 hours later (simulated timestamp or sequential swipe)
  const swipeOutRes = await fetchApi('/api/corporate/swipes/simulate', {
    method: 'POST',
    token: tokenA,
    body: {
      door_id: 'turnstile-blr-gate-1',
      building: 'Bangalore Campus B',
      floor: 1,
      direction: 'out',
    },
  });

  assert.strictEqual(swipeOutRes.status, 201, 'Swipe out returns 201');
  assert.strictEqual(swipeOutRes.data.event.direction, 'out');

  // 3. Query Daily Attendance
  const attRes = await fetchApi('/api/corporate/attendance/my', {
    method: 'GET',
    token: tokenA,
  });

  assert.strictEqual(attRes.status, 200);
  assert.ok(attRes.data.records, 'Includes attendance records array');
  assert.ok(attRes.data.records.length >= 1, 'Contains today attendance record');

  const todayRecord = attRes.data.records[0];
  assert.strictEqual(todayRecord.status, 'present', 'Status marked present on swipe');
  assert.ok(todayRecord.first_swipe_in, 'Records first swipe in');
  assert.ok(todayRecord.last_swipe_out, 'Records last swipe out');
});

test('PS18-20: Presence vs Attendance separation and IDOR security verification', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  // Seed Support Executive B (Department: IT)
  const agentB = await accountStore.createAccount({
    email: 'agent.presence.b@company.com',
    name: 'Agent Presence B',
    role: 'support_executive',
    department: 'IT',
    password: 'SecurePass#2026B',
    active: true,
    must_change_password: false,
    status: 'busy', // Presence state is Busy
  });
  const tokenB = tokens.signToken(agentB);

  // Employee A token
  const empA = accountStore.findByEmail('emp.attendance.a@company.com');
  const tokenA = tokens.signToken(empA);

  // 1. Verify Presence is separate from Attendance
  // Agent B has NOT swiped today -> Attendance: absent / not_clocked_in, Presence: busy
  const attBRes = await fetchApi('/api/corporate/attendance/my', {
    method: 'GET',
    token: tokenB,
  });
  assert.strictEqual(attBRes.status, 200);
  assert.strictEqual(attBRes.data.presence_status, 'busy', 'Presence remains Busy');
  assert.strictEqual(attBRes.data.today.status, 'absent', 'Attendance is Absent without swipes');

  // 2. IDOR Security Enforcement: Employee A attempts to fetch Agent B attendance by ID
  const idorRes = await fetchApi(`/api/corporate/attendance/${agentB.id}`, {
    method: 'GET',
    token: tokenA,
  });
  assert.strictEqual(
    idorRes.status,
    403,
    `Employee A fetching Agent B attendance must be 403 Forbidden, got ${idorRes.status}`
  );

  // 3. Manager Visibility: IT Department Manager can see Agent B attendance
  const itMgr = await accountStore.createAccount({
    email: 'it.mgr.att@company.com',
    name: 'IT Manager Attendance',
    role: 'department_manager',
    department: 'IT',
    password: 'ManagerAttPass#2026',
    active: true,
    must_change_password: false,
  });
  const itMgrToken = tokens.signToken(itMgr);

  const teamAttRes = await fetchApi('/api/corporate/attendance/team', {
    method: 'GET',
    token: itMgrToken,
  });
  assert.strictEqual(teamAttRes.status, 200, 'IT Manager can view team attendance');
  assert.ok(
    teamAttRes.data.team.some(m => m.employee_id === agentB.id),
    'Team attendance includes IT agent'
  );
  assert.strictEqual(
    teamAttRes.data.team.some(m => m.department !== 'IT'),
    false,
    'Zero non-IT staff leaked in department attendance view'
  );
});
