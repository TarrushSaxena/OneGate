const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-21: Emergency SOS triggers urgent bypass, creates critical ticket, and logs targeted notifications', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  // Seed Employee with a designated manager
  const emp = await accountStore.createAccount({
    email: 'sos.caller@company.com',
    name: 'Distressed Employee',
    role: 'employee',
    department: 'Cybersecurity',
    password: 'SecurePass#2026SOS',
    active: true,
    must_change_password: false,
  });

  const empToken = tokens.signToken(emp);

  // Trigger Emergency SOS
  const sosRes = await fetchApi('/api/corporate/emergency/sos', {
    method: 'POST',
    token: empToken,
    body: {
      location: 'Floor 3 Server Room BLR',
      notes: 'Fire alarm ringing and smoke visible in server rack 4',
      contact_phone: '+91-9876543210',
    },
  });

  assert.strictEqual(sosRes.status, 201, 'SOS event created with 201');
  assert.strictEqual(sosRes.data.alert.priority, 'urgent');
  assert.strictEqual(sosRes.data.alert.employee_id, emp.id);
  assert.strictEqual(sosRes.data.alert.location, 'Floor 3 Server Room BLR');
  assert.ok(sosRes.data.alert.ticket_id, 'Generated urgent safety ticket');

  // Verify notifications are strictly targeted (manager, security, HR) and NOT broad broadcast
  assert.ok(Array.isArray(sosRes.data.notified_channels), 'Targeted channels tracked');
  assert.ok(
    sosRes.data.notified_channels.includes('security:alerts'),
    'Security alerts channel notified'
  );
  assert.strictEqual(
    sosRes.data.broadcast_to_all,
    false,
    'Must strictly NOT broadcast to entire company'
  );
});

test('PS18-21: SOS Audit trail is restricted-tier with strict role enforcement', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const regularEmp = accountStore.findByEmail('sos.caller@company.com');
  const empToken = tokens.signToken(regularEmp);

  // 1. Regular employee CANNOT read org-wide SOS audit logs (403 Forbidden)
  const forbiddenAudit = await fetchApi('/api/corporate/emergency/sos/audit', {
    method: 'GET',
    token: empToken,
  });
  assert.strictEqual(forbiddenAudit.status, 403, 'Regular employee receives 403 on SOS audit');

  // 2. Main Manager / Security Manager CAN view full audit trail
  const mainMgr = await accountStore.createAccount({
    email: 'security.lead.sos@company.com',
    name: 'Security Lead',
    role: 'main_manager',
    department: 'Cybersecurity',
    password: 'SecLeadPass#2026',
    active: true,
    must_change_password: false,
  });
  const mgrToken = tokens.signToken(mainMgr);

  const allowedAudit = await fetchApi('/api/corporate/emergency/sos/audit', {
    method: 'GET',
    token: mgrToken,
  });

  assert.strictEqual(allowedAudit.status, 200, 'Security/Main manager accesses SOS audit');
  assert.ok(Array.isArray(allowedAudit.data.audit_log), 'Returns audit log array');
  assert.ok(allowedAudit.data.audit_log.length >= 1, 'Contains recorded SOS incident');

  const latestEvent = allowedAudit.data.audit_log[0];
  assert.strictEqual(latestEvent.action, 'EMERGENCY_SOS_TRIGGERED');
  assert.strictEqual(latestEvent.dataClassification, 'RESTRICTED');
  assert.ok(latestEvent.timestamp, 'Immutable timestamp recorded');
});
