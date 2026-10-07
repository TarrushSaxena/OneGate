const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');
const accountStore = require('../auth/accountStore');
const tokens = require('../auth/tokens');

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-USP-1: Three-Way Routing — Direct answer does not enter human queue or invoke assignment', async () => {
  const emp = await accountStore.createAccount({
    email: 'direct.emp@company.com',
    name: 'Direct Employee',
    role: 'employee',
    department: 'HR',
    password: 'Password#2026!HR',
    active: true,
  });
  const token = tokens.signToken(emp);

  const res = await fetchApi('/api/chat/message', {
    method: 'POST',
    token,
    body: {
      userId: emp.id,
      message: 'What is the standard parental leave policy for full-time employees?',
    },
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.message.resolution_type, 'answer');

  assert.strictEqual(res.data.ticket, null, 'Direct answer must not create a human support ticket');
});

test('PS18-USP-1: Three-Way Routing — Known fix creates ai_attempted ticket with assignment suppressed', async () => {
  const emp = await accountStore.createAccount({
    email: 'selffix.emp@company.com',
    name: 'Self Fix Employee',
    role: 'employee',
    department: 'IT',
    password: 'Password#2026!Fix',
    active: true,
  });
  const token = tokens.signToken(emp);

  const res = await fetchApi('/api/chat/message', {
    method: 'POST',
    token,
    body: {
      userId: emp.id,
      message: 'My corporate VPN connection keeps timing out and dropping constantly',
    },
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.message.resolution_type, 'ai_attempted');

  assert.ok(res.data.ticket, 'Ticket must be created for monitoring AI attempt');
  assert.strictEqual(res.data.ticket.status, 'ai_attempted', 'Ticket status must be ai_attempted');
  assert.strictEqual(res.data.ticket.assigned_to, null, 'Assignment engine must be suppressed during ai_attempted');
  assert.ok(res.data.ticket.ai_attempt, 'ai_attempt_id must be populated');

});

test('PS18-USP-1: Three-Way Routing — Positive follow-up auto-resolves without human assignment and is idempotent', async () => {
  const emp = await accountStore.createAccount({
    email: 'positive.emp@company.com',
    name: 'Positive Employee',
    role: 'employee',
    department: 'IT',
    password: 'Password#2026!Positive',
    active: true,
  });
  const token = tokens.signToken(emp);

  const chatRes = await fetchApi('/api/chat/message', {
    method: 'POST',
    token,
    body: {
      userId: emp.id,
      message: 'My corporate VPN connection is disconnected and failing to connect',
    },
  });

  assert.strictEqual(chatRes.status, 200);
  const ticketId = chatRes.data.ticket?.id;
  assert.ok(ticketId, 'Ticket ID should be present');

  // Employee confirms fix worked
  const confirmRes = await fetchApi(`/api/tickets/${ticketId}/ai-attempt/confirm`, {
    method: 'POST',
    token,
    headers:{'Idempotency-Key':`attempt-${ticketId}`},
    body:{version:chatRes.data.ticket.version},
  });

  assert.strictEqual(confirmRes.status, 200);
  assert.strictEqual(confirmRes.data.ticket.status, 'resolved');

  assert.strictEqual(confirmRes.data.ticket?.assigned_to, null, 'No specialist was assigned');

  // Idempotency: repeated call does not alter resolved state or error
  const repeatRes = await fetchApi(`/api/tickets/${ticketId}/ai-attempt/confirm`, {
    method: 'POST',
    token,
    headers:{'Idempotency-Key':`attempt-${ticketId}`},
    body:{version:chatRes.data.ticket.version},
  });
  assert.strictEqual(repeatRes.status, 200);
  assert.strictEqual(repeatRes.data.ticket.status, 'resolved');
});

test('PS18-USP-1: Three-Way Routing — Negative follow-up escalates to human_required, assigns once, and includes warm summary with "Do not repeat"', async () => {
  // Ensure at least one active IT support executive exists
  await accountStore.createAccount({
    email: 'it.specialist.usp1@company.com',
    name: 'Alex Kumar',
    role: 'support_executive',
    department: 'IT',
    tier: 'L2',
    password: 'Password#2026!Alex',
    active: true,
  });

  const emp = await accountStore.createAccount({
    email: 'negative.emp@company.com',
    name: 'Negative Employee',
    role: 'employee',
    department: 'IT',
    password: 'Password#2026!Negative',
    active: true,
  });
  const token = tokens.signToken(emp);

  const chatRes = await fetchApi('/api/chat/message', {
    method: 'POST',
    token,
    body: {
      userId: emp.id,
      message: 'My corporate VPN connection is completely broken and reconnecting fails',
    },
  });

  assert.strictEqual(chatRes.status, 200);
  const ticketId = chatRes.data.ticket?.id;
  assert.ok(ticketId);

  // Employee reports fix did not work
  const escalateRes = await fetchApi(`/api/tickets/${ticketId}/ai-attempt/escalate`, {
    method: 'POST',
    token,
    headers:{'Idempotency-Key':`attempt-${ticketId}`},
    body:{version:chatRes.data.ticket.version},
  });

  assert.strictEqual(escalateRes.status, 200);
  assert.ok(['acknowledged','open','in_progress'].includes(escalateRes.data.ticket.status));
  assert.ok(escalateRes.data.ticket.assigned_to, 'Specialist must be assigned upon negative follow-up');
  
  // Warm summary must contain the attempted fix outcome and "Do not repeat"
  const warmSummary = escalateRes.data.ticket.warm_summary;
  assert.ok(warmSummary, 'Warm handoff summary must be generated');
  assert.ok(warmSummary.toLowerCase().includes('do not repeat'), 'Summary must contain "Do not repeat" instruction for agent');
  assert.ok(warmSummary.toLowerCase().includes('tried') || warmSummary.toLowerCase().includes('attempted'), 'Summary must mention tried fix');

  // Idempotent: repeated escalation does not re-assign or corrupt state
  const repeatEscalate = await fetchApi(`/api/tickets/${ticketId}/ai-attempt/escalate`, {
    method: 'POST',
    token,
    headers:{'Idempotency-Key':`attempt-${ticketId}`},
    body:{version:chatRes.data.ticket.version},
  });
  assert.strictEqual(repeatEscalate.status, 200);
  assert.strictEqual(repeatEscalate.data.ticket.assigned_to, escalateRes.data.ticket.assigned_to, 'Assignee must remain unchanged');
});
