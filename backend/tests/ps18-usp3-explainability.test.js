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

test('PS18-USP-3: Ticket assignment persists score, reason, matched factors, and required_tier_snapshot', async () => {
  // 1. Create a support executive and manager
  const agent = await accountStore.createAccount({
    email: 'agent.usp3@company.com',
    name: 'USP3 Specialist',
    role: 'support_executive',
    department: 'IT',
    tier: 'L2',
    skill_tags: ['vpn', 'network', 'hardware'],
    password: 'Password#2026!Usp3',
    active: true,
  });

  const emp = await accountStore.createAccount({
    email: 'emp.usp3@company.com',
    name: 'USP3 Employee',
    role: 'employee',
    department: 'Marketing',
    password: 'Password#2026!Usp3',
    active: true,
  });

  const agentToken = tokens.signToken(agent);
  const empToken = tokens.signToken(emp);

  // 2. File a ticket that requires human
  const chatRes = await fetchApi('/api/chat/message', {
    method: 'POST',
    token: empToken,
    body: {
      userId: emp.id,
      message: 'Need hardware specialist urgently: MacBook Pro motherboard broken and needs replacement',
    },
  });

  assert.strictEqual(chatRes.status, 200);
  const ticketId = chatRes.data.ticket?.id;
  assert.ok(ticketId, 'Ticket must be created');

  // 3. Authorized agent fetches ticket detail
  const agentTicketRes = await fetchApi(`/api/tickets/${ticketId}`, {
    method: 'GET',
    token: agentToken,
  });

  assert.strictEqual(agentTicketRes.status, 200);
  const ticket = agentTicketRes.data.ticket;
  assert.ok(ticket.assignment, 'Ticket must contain assignment details');
  assert.ok(typeof ticket.assignment.score === 'number', 'Assignment score must be a number');
  assert.ok(ticket.assignment.score >= 0 && ticket.assignment.score <= 100, 'Score must be between 0 and 100');
  assert.ok(typeof ticket.assignment.reason === 'string', 'Assignment reason must be a string');
  assert.ok(Array.isArray(ticket.assignment.matched_factors), 'Matched factors must be an array');
  assert.ok(ticket.assignment.required_tier_snapshot, 'Must snapshot required tier');

  // 4. Employee fetches same ticket detail -> gets SAFE explanation, NO internal raw score leak
  const empTicketRes = await fetchApi(`/api/tickets/${ticketId}`, {
    method: 'GET',
    token: empToken,
  });

  assert.strictEqual(empTicketRes.status, 200);
  const empTicket = empTicketRes.data.ticket;
  assert.strictEqual(empTicket.assignment?.score, undefined, 'Raw assignment score must NOT leak to employee');
  assert.strictEqual(empTicket.assignment?.matched_factors, undefined, 'Internal matched factors must NOT leak to employee');
  assert.ok(
    /team|specialist|expertise|availability/i.test(empTicket.routing_explanation || ''),
    'Employee receives safe human-friendly explanation'
  );
});
