const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');

let stateRef = null;

test.before(async () => {
  const { state } = await startTestServer();
  stateRef = state;

  // Clear & seed specific test tickets across multiple departments
  stateRef.tickets = [
    {
      id: 't-fin-001',
      department: 'Finance',
      priority: 'high',
      status: 'open',
      required_tier: 'L2',
      created_at: Date.now() - 3600000,
      sla_deadline: Date.now() + 7200000,
    },
    {
      id: 't-fin-002',
      department: 'Finance',
      priority: 'normal',
      status: 'resolved',
      required_tier: 'L1',
      created_at: Date.now() - 7200000,
      resolved_at: Date.now() - 3600000,
      sla_deadline: Date.now() + 3600000,
      csat: 5,
    },
    {
      id: 't-hr-001',
      department: 'HR',
      priority: 'critical',
      status: 'open',
      required_tier: 'L3',
      created_at: Date.now() - 1800000,
      sla_deadline: Date.now() + 3600000,
    },
    {
      id: 't-hr-002',
      department: 'HR',
      priority: 'normal',
      status: 'open',
      required_tier: 'L1',
      created_at: Date.now() - 1800000,
      sla_deadline: Date.now() + 7200000,
    },
    {
      id: 't-it-001',
      department: 'IT',
      priority: 'low',
      status: 'open',
      required_tier: 'L1',
      created_at: Date.now() - 1000000,
      sla_deadline: Date.now() + 14400000,
    },
  ];
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-17: Department Manager hard-scoping — department_id=HR in query/body forced to Finance', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  // Seed Finance Department Manager
  const finMgr = await accountStore.createAccount({
    email: 'finance.manager.scope@company.com',
    name: 'Finance Manager Scoped',
    role: 'department_manager',
    department: 'Finance',
    password: 'ManagerScopePass#2026',
    active: true,
    must_change_password: false,
  });

  const finToken = tokens.signToken(finMgr);

  // 1. Test /api/manager/department with malicious department_id=HR
  const deptRes = await fetchApi('/api/manager/department?department_id=HR&department=HR', {
    method: 'GET',
    token: finToken,
  });

  assert.strictEqual(deptRes.status, 200);
  assert.strictEqual(deptRes.data.department, 'Finance', 'Must force Finance department');
  assert.strictEqual(
    deptRes.data.queue.some(t => t.department === 'HR'),
    false,
    'Zero HR tickets in department queue'
  );
  assert.ok(
    deptRes.data.queue.every(t => t.department === 'Finance'),
    'All returned tickets in queue must be Finance'
  );

  // 2. Test /api/manager/queue with department_id=HR
  const queueRes = await fetchApi('/api/manager/queue?department_id=HR&department=HR', {
    method: 'GET',
    token: finToken,
  });

  assert.strictEqual(queueRes.status, 200);
  const queueTickets = Array.isArray(queueRes.data) ? queueRes.data : queueRes.data.tickets;
  assert.ok(queueTickets.length > 0, 'Must return Finance tickets');
  assert.strictEqual(
    queueTickets.some(t => t.department === 'HR'),
    false,
    'Zero HR tickets leaked in queue endpoint'
  );
  assert.ok(
    queueTickets.every(t => t.department === 'Finance'),
    'All tickets in queue endpoint strictly belong to Finance'
  );

  // 3. Test /api/tickets with department=HR
  const ticketsRes = await fetchApi('/api/tickets?department=HR&department_id=HR', {
    method: 'GET',
    token: finToken,
  });

  assert.strictEqual(ticketsRes.status, 200);
  const generalTickets = ticketsRes.data;
  assert.strictEqual(
    generalTickets.some(t => t.department === 'HR'),
    false,
    'Zero HR tickets leaked in /api/tickets for dept manager'
  );
  assert.ok(
    generalTickets.every(t => t.department === 'Finance'),
    'All tickets in /api/tickets forced to Finance for dept manager'
  );
});

test('PS18-17: Department Manager metrics, roster, trend, and queue filtering', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  // Seed Support Executive for Finance
  await accountStore.createAccount({
    email: 'fin.agent.metrics@company.com',
    name: 'Finance Specialist',
    role: 'support_executive',
    department: 'Finance',
    tier: 'L2',
    password: 'AgentMetricsPass#2026',
    active: true,
    must_change_password: false,
    status: 'online',
    current_load: 3,
    rolling_score: 4.9,
  });

  const finMgr = accountStore.findByEmail('finance.manager.scope@company.com');
  const finToken = tokens.signToken(finMgr);

  const res = await fetchApi('/api/manager/department', {
    method: 'GET',
    token: finToken,
  });

  assert.strictEqual(res.status, 200);
  const data = deptDataCheck(res.data);

  // Verification of metrics cards
  assert.strictEqual(typeof data.open, 'number', 'Must include open count');
  assert.strictEqual(typeof data.resolved, 'number', 'Must include resolved count');
  assert.strictEqual(typeof data.slaBreachesThisWeek, 'number', 'Must include SLA breach count');
  assert.ok(Array.isArray(data.trend), 'Must include 7-day trend');
  assert.strictEqual(data.trend.length, 7, 'Trend must cover 7 days');

  // Verification of staff roster
  assert.ok(Array.isArray(data.roster), 'Must include staff roster');
  const agent = data.roster.find(s => s.email === 'fin.agent.metrics@company.com');
  assert.ok(agent, 'Staff roster contains Finance specialist');
  assert.strictEqual(agent.tier, 'L2');
  assert.strictEqual(agent.status, 'online');
  assert.strictEqual(agent.current_load, 3);
  assert.strictEqual(agent.rolling_score, 4.9);

  // Verification of queue filtering by priority & tier
  const filteredQueue = await fetchApi('/api/manager/queue?priority=high&tier=L2', {
    method: 'GET',
    token: finToken,
  });
  assert.strictEqual(filteredQueue.status, 200);
  const fTickets = Array.isArray(filteredQueue.data) ? filteredQueue.data : filteredQueue.data.tickets;
  assert.ok(fTickets.length >= 1, 'Contains filtered high priority L2 ticket');
  assert.ok(fTickets.every(t => t.priority === 'high' && t.required_tier === 'L2'));
});

function deptDataCheck(data) {
  assert.ok(data, 'Data returned');
  return data;
}
