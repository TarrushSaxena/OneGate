const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');
const accountStore = require('../auth/accountStore');
const tokens = require('../auth/tokens');
const tierEngine = require('../services/tierEngine');
const auditService = require('../services/audit');

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-USP-4: Tier Engine — Multi-cycle evaluation enforces 3 consecutive cycles for promotion and 2 for demotion', () => {
  const agent = {
    id: 'emp_tier_test_1',
    name: 'Agent Tier Test',
    department: 'IT',
    tier: 'L1',
    rolling_score: 88,
    consecutive_high_cycles: 0,
    consecutive_low_cycles: 0,
    tier_cycle_history: [],
  };

  // Cycle 1: Good score (1 streak) -> No promotion yet
  let r1 = tierEngine.evaluateEmployeeTier(agent);
  assert.strictEqual(r1.current_tier, 'L1', 'Cycle 1 must not promote yet');
  assert.strictEqual(r1.consecutive_high_cycles, 1);
  assert.strictEqual(r1.action, 'none');

  // Cycle 2: Good score (2 streak) -> No promotion yet
  let r2 = tierEngine.evaluateEmployeeTier(agent);
  assert.strictEqual(r2.current_tier, 'L1', 'Cycle 2 must not promote yet');
  assert.strictEqual(r2.consecutive_high_cycles, 2);
  assert.strictEqual(r2.action, 'none');

  // Streak broken by an average score
  agent.rolling_score = 72;
  let rBreak = tierEngine.evaluateEmployeeTier(agent);
  assert.strictEqual(rBreak.consecutive_high_cycles, 0, 'Streak must be reset when score drops below promotion threshold');
  assert.strictEqual(rBreak.current_tier, 'L1');

  // Cycle 1 again after streak break
  agent.rolling_score = 90;
  tierEngine.evaluateEmployeeTier(agent);
  assert.strictEqual(agent.tier, 'L1', '1 good cycle after broken streak must not promote');

  // Cycle 2
  tierEngine.evaluateEmployeeTier(agent);
  assert.strictEqual(agent.tier, 'L1');

  // Cycle 3: 3 consecutive qualifying cycles -> Promoted to L2!
  let r3 = tierEngine.evaluateEmployeeTier(agent);
  assert.strictEqual(r3.current_tier, 'L2', 'Must be promoted to L2 on 3rd consecutive qualifying cycle');
  assert.strictEqual(r3.action, 'promoted');

  // Now test demotion logic: requires 2 consecutive cycles < 60
  agent.rolling_score = 55;
  let rDemote1 = tierEngine.evaluateEmployeeTier(agent);
  assert.strictEqual(rDemote1.current_tier, 'L2', '1 cycle < 60 must not demote immediately');
  assert.strictEqual(rDemote1.consecutive_low_cycles, 1);

  let rDemote2 = tierEngine.evaluateEmployeeTier(agent);
  assert.strictEqual(rDemote2.current_tier, 'L1', '2nd consecutive cycle < 60 triggers demotion to L1');
  assert.strictEqual(rDemote2.action, 'demoted');
});

test('PS18-USP-4: Tier Automation — In-flight ticket retains required_tier_snapshot at assignment time', async () => {
  const emp = await accountStore.createAccount({
    email: 'tier.snapshot.emp@company.com',
    name: 'Snapshot Employee',
    role: 'employee',
    department: 'IT',
    password: 'Password#2026!Snapshot',
    active: true,
  });
  const agent=await accountStore.createAccount({email:'snapshot-specialist@company.com',name:'Snapshot specialist',role:'support_executive',department:'IT',tier:'L2',password:'TestOnly!12345',active:true});
  const token = tokens.signToken(emp);

  // Trigger ticket creation
  const chatRes = await fetchApi('/api/chat/message', {
    method: 'POST',
    token,
    body: {
      userId: emp.id,
      message: 'I need a specialist immediately to handle engineering build server hardware fault with broken display',
    },
  });

  assert.strictEqual(chatRes.status, 200);
  const ticket = (await fetchApi(`/api/tickets/${chatRes.data.ticket.id}`,{token:tokens.signToken(agent)})).data.ticket;
  assert.ok(ticket, 'Ticket created');
  assert.ok(ticket.assignment, 'Ticket assigned');
  
  // Snapshot integrity check
  const snapshotTier = ticket.assignment.required_tier_snapshot;
  assert.ok(snapshotTier, 'Snapshot must be set at assignment time');

  // Verify through ticket detail endpoint
  const ticketDetailRes = await fetchApi(`/api/tickets/${ticket.id}`, {
    method: 'GET',
    token:tokens.signToken(agent),
  });
  assert.strictEqual(ticketDetailRes.status, 200);
  assert.strictEqual(ticketDetailRes.data.ticket.assignment.required_tier_snapshot, snapshotTier);
});

test('PS18-USP-4: Tier Profile API — Employee performance profile returned with IDOR security checks', async () => {
  const emp1 = await accountStore.createAccount({
    email: 'agent1.perf@company.com',
    name: 'Agent One Perf',
    role: 'employee',
    department: 'IT',
    password: 'Password#2026!Perf',
    active: true,
  });
  const emp2 = await accountStore.createAccount({
    email: 'agent2.perf@company.com',
    name: 'Agent Two Perf',
    role: 'employee',
    department: 'HR',
    password: 'Password#2026!Perf',
    active: true,
  });

  const emp1Token = tokens.signToken(emp1);
  const emp2Token = tokens.signToken(emp2);

  // 1. Employee can view their own profile
  const ownRes = await fetchApi(`/api/employees/${emp1.id}/performance`, {
    method: 'GET',
    token: emp1Token,
  });
  assert.strictEqual(ownRes.status, 200);
  assert.strictEqual(ownRes.data.employee_id, emp1.id);
  assert.ok(ownRes.data.tier);
  assert.ok(ownRes.data.open !== undefined);

  // 2. Employee cannot view another employee's performance profile (IDOR forbidden)
  const forbiddenRes = await fetchApi(`/api/employees/${emp1.id}/performance`, {
    method: 'GET',
    token: emp2Token,
  });
  assert.strictEqual(forbiddenRes.status, 403, 'Employee cannot inspect another employee performance');
});
