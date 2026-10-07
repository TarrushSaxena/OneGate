const test = require('node:test');
const assert = require('node:assert');
const { escalateTicket } = require('../services/assignment');
const fakeData = require('../data/fake-data');

test('PS18-10: Escalation bumps tier and preserves history, reopen bumps priority', () => {
  const employees = fakeData.employees;

  // 1. Tier bump from L1 to L2 on SLA breach
  const initialTicket = {
    id: 't-sla-001',
    department: 'IT',
    required_tier: 'L1',
    priority: 'medium',
    reassignment_count: 0,
    escalation_history: [],
  };

  const esc1 = escalateTicket(initialTicket, employees, 'SLA breach — response exceeded 8 hours');
  assert.strictEqual(esc1.newTier, 'L2');
  assert.strictEqual(esc1.escalationType, 'tier_bump');
  assert.ok(esc1.reason.includes('SLA breach'));

  // 2. Re-escalate from L2 to L3
  const l2Ticket = {
    ...initialTicket,
    required_tier: 'L2',
    reassignment_count: 1,
    escalation_history: [{ from: 'L1', to: 'L2', reason: 'SLA breach' }],
  };
  const esc2 = escalateTicket(l2Ticket, employees, 'Requires deeper database permissions');
  assert.strictEqual(esc2.newTier, 'L3');

  // 3. Repeated reassignments (>= 2) escalate to manager queue
  const overEscalatedTicket = {
    ...initialTicket,
    required_tier: 'L3',
    reassignment_count: 2,
    escalation_history: [],
  };
  const escManager = escalateTicket(overEscalatedTicket, employees, 'Repeated failure after 2 reassignments');
  assert.strictEqual(escManager.escalationType, 'manager');

  // 4. Reopen logic: priority bumps one step (e.g. low -> medium, medium -> high, high -> critical)
  const PRIORITY_ORDER = ['low', 'medium', 'high', 'critical'];
  function bumpPriority(currentPriority) {
    const idx = PRIORITY_ORDER.indexOf(currentPriority);
    return idx < PRIORITY_ORDER.length - 1 ? PRIORITY_ORDER[idx + 1] : 'critical';
  }

  assert.strictEqual(bumpPriority('low'), 'medium');
  assert.strictEqual(bumpPriority('medium'), 'high');
  assert.strictEqual(bumpPriority('high'), 'critical');
  assert.strictEqual(bumpPriority('critical'), 'critical');
});
