const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-22: Lost ID card reporting deactivates card immediately, blocking subsequent swipes', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  // Seed Employee C
  const empC = await accountStore.createAccount({
    email: 'lostcard.emp.c@company.com',
    name: 'Lost Card User C',
    role: 'employee',
    department: 'Marketing',
    password: 'SecurePass#2026CardC',
    active: true,
    must_change_password: false,
  });
  const tokenC = tokens.signToken(empC);
  const cardId = `badge-${empC.id}`;

  // 1. Initial swipe succeeds before report
  const initialSwipe = await fetchApi('/api/corporate/swipes/simulate', {
    method: 'POST',
    token: tokenC,
    body: {
      card_id: cardId,
      door_id: 'gate-mkt-01',
      direction: 'in',
    },
  });
  assert.strictEqual(initialSwipe.status, 201, 'Swipe succeeds while active');

  // 2. Report ID Card Lost
  const reportRes = await fetchApi('/api/corporate/id-cards/report-lost', {
    method: 'POST',
    token: tokenC,
    body: {
      card_id: cardId,
      lost_location: 'Outer Ring Road Cafe',
      lost_time: new Date().toISOString(),
      notes: 'Lanyard fell out of backpack on commute',
    },
  });

  assert.strictEqual(reportRes.status, 201, 'Report returns 201 Created');
  assert.strictEqual(reportRes.data.card_status, 'deactivated');
  assert.strictEqual(reportRes.data.card_id, cardId);
  assert.ok(reportRes.data.security_incident_id, 'Generated security incident record');
  assert.ok(reportRes.data.replacement_ticket_id, 'Generated IT replacement ticket');

  // 3. Subsequent swipe with deactivated card MUST be rejected with 403 Forbidden
  const blockedSwipe = await fetchApi('/api/corporate/swipes/simulate', {
    method: 'POST',
    token: tokenC,
    body: {
      card_id: cardId,
      door_id: 'gate-mkt-01',
      direction: 'in',
    },
  });

  assert.strictEqual(
    blockedSwipe.status,
    403,
    `Deactivated card must be blocked with 403 Forbidden, got ${blockedSwipe.status}`
  );
  assert.strictEqual(blockedSwipe.data.error, 'card_deactivated');
});

test('PS18-22: IDOR enforcement and Security/Facilities admin authority', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const empC = accountStore.findByEmail('lostcard.emp.c@company.com');
  const cardIdC = `badge-${empC.id}`;

  // Seed unauthorized Employee D
  const empD = await accountStore.createAccount({
    email: 'unauth.emp.d@company.com',
    name: 'Unauthorized User D',
    role: 'employee',
    department: 'Sales',
    password: 'SecurePass#2026CardD',
    active: true,
    must_change_password: false,
  });
  const tokenD = tokens.signToken(empD);

  // 1. Employee D attempts to deactivate Employee C's card -> 403 Forbidden
  const idorRes = await fetchApi('/api/corporate/id-cards/report-lost', {
    method: 'POST',
    token: tokenD,
    body: {
      card_id: cardIdC,
      employee_id: empC.id,
      notes: 'Malicious attempt to deactivate someone else badge',
    },
  });
  assert.strictEqual(
    idorRes.status,
    403,
    `Unauthorized user deactivating foreign badge must receive 403 Forbidden, got ${idorRes.status}`
  );

  // 2. Facilities/Security Department Manager can report on behalf of employee
  const securityMgr = await accountStore.createAccount({
    email: 'facilities.admin.lost@company.com',
    name: 'Facilities Security Admin',
    role: 'department_manager',
    department: 'Cybersecurity',
    password: 'SecAdminPass#2026',
    active: true,
    must_change_password: false,
  });
  const secToken = tokens.signToken(securityMgr);

  const adminReportRes = await fetchApi('/api/corporate/id-cards/report-lost', {
    method: 'POST',
    token: secToken,
    body: {
      card_id: `badge-admin-test-${Date.now()}`,
      employee_id: empC.id,
      notes: 'Security guard reported lost badge handed in',
    },
  });
  assert.strictEqual(adminReportRes.status, 201, 'Security admin can report on behalf of employee');
});
