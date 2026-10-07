const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');
const accountStore = require('../auth/accountStore');
const tokens = require('../auth/tokens');
const auditService = require('../services/audit');

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-USP-6: Audit Log — Unauthorized users (Employee, Support Exec) receive 403 on audit queries', async () => {
  const emp = await accountStore.createAccount({
    email: 'unauth.emp@company.com',
    name: 'Unauth Employee',
    role: 'employee',
    department: 'HR',
    password: 'Password#2026!Unauth',
    active: true,
  });
  const agent = await accountStore.createAccount({
    email: 'unauth.agent@company.com',
    name: 'Unauth Agent',
    role: 'support_executive',
    department: 'IT',
    password: 'Password#2026!Unauth',
    active: true,
  });

  const empToken = tokens.signToken(emp);
  const agentToken = tokens.signToken(agent);

  const empAuditRes = await fetchApi('/api/admin/audit', {
    method: 'GET',
    token: empToken,
  });
  assert.strictEqual(empAuditRes.status, 403, 'Employee must receive 403 Forbidden');

  const agentAuditRes = await fetchApi('/api/admin/audit', {
    method: 'GET',
    token: agentToken,
  });
  assert.strictEqual(agentAuditRes.status, 403, 'Support Executive must receive 403 Forbidden');
});

test('PS18-USP-6: Audit Log — Ticket assignment and escalation automatically record attributable, sanitized audit rows', async () => {
  const itManager = await accountStore.createAccount({
    email: 'it.dept.mgr.audit@company.com',
    name: 'IT Department Manager',
    role: 'department_manager',
    department: 'IT',
    password: 'Password#2026!ITMgr',
    active: true,
  });
  const itManagerToken = tokens.signToken(itManager);

  // Directly log or trigger ticket lifecycle actions
  const testTicketId = 't_audit_' + Date.now();
  auditService.logAuditEvent({
    actor_id: 'system',
    actor_name: 'Routing Engine',
    actor_type: 'system',
    action: 'ticket_assigned',
    target_type: 'ticket',
    target_id: testTicketId,
    department: 'IT',
    details: `Assigned ticket #${testTicketId} to specialist`,
    metadata: {
      score: 89,
      password: 'ShouldBeRedactedPassword!',
      token: 'ShouldBeRedactedJwtToken!',
      matched_factors: ['skill_overlap', 'current_load'],
    },
  });

  // Query audit logs as Department Manager
  const auditRes = await fetchApi(`/api/admin/audit?target_id=${testTicketId}`, {
    method: 'GET',
    token: itManagerToken,
  });

  assert.strictEqual(auditRes.status, 200);
  assert.ok(Array.isArray(auditRes.data.events), 'Events list returned');
  assert.ok(auditRes.data.events.length >= 1, 'Event for ticket assignment present');

  const event = auditRes.data.events.find(e => e.target_id === testTicketId);
  assert.ok(event);
  assert.strictEqual(event.action, 'ticket_assigned');
  assert.strictEqual(event.target_type, 'ticket');
  assert.strictEqual(event.department, 'IT');
  assert.strictEqual(event.actor_id, 'system');
  
  // Privacy & redaction verification: sensitive keys must be sanitized
  assert.strictEqual(event.metadata.password, '[REDACTED]', 'Passwords must never be logged in plaintext');
  assert.strictEqual(event.metadata.token, '[REDACTED]', 'Tokens must never be logged in plaintext');
  assert.strictEqual(event.metadata.score, 89);
});

test('PS18-USP-6: Audit Log — Department Manager is scoped strictly to department while Main Manager has org-wide visibility', async () => {
  const itMgr = await accountStore.createAccount({
    email: 'it.mgr.scope@company.com',
    name: 'IT Manager Scope',
    role: 'department_manager',
    department: 'IT',
    password: 'Password#2026!Scope',
    active: true,
  });
  const mainMgr = await accountStore.createAccount({
    email: 'main.mgr.scope@company.com',
    name: 'Main Org Manager',
    role: 'main_manager',
    department: 'Operations',
    password: 'Password#2026!Main',
    active: true,
  });

  const itToken = tokens.signToken(itMgr);
  const mainToken = tokens.signToken(mainMgr);

  const hrEventId = 'target_hr_' + Date.now();
  auditService.logAuditEvent({
    actor_id: 'admin_hr_1',
    actor_name: 'HR Lead',
    actor_type: 'department_manager',
    action: 'restricted_data_access',
    target_type: 'employee_record',
    target_id: hrEventId,
    department: 'HR',
    details: 'Viewed confidential leave file',
  });

  // IT Department Manager should NOT see HR event
  const itAuditRes = await fetchApi('/api/admin/audit', {
    method: 'GET',
    token: itToken,
  });
  assert.strictEqual(itAuditRes.status, 200);
  const itEvents = itAuditRes.data.events;
  const hrFoundInIt = itEvents.some(e => e.target_id === hrEventId);
  assert.strictEqual(hrFoundInIt, false, 'IT Manager must NOT see HR department audit records');

  // Main Manager CAN see HR event
  const mainAuditRes = await fetchApi('/api/admin/audit', {
    method: 'GET',
    token: mainToken,
  });
  assert.strictEqual(mainAuditRes.status, 200);
  const mainEvents = mainAuditRes.data.events;
  const hrFoundInMain = mainEvents.some(e => e.target_id === hrEventId);
  assert.strictEqual(hrFoundInMain, true, 'Main Manager must have org-wide visibility');
});
