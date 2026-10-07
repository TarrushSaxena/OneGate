const test = require('node:test');
const assert = require('node:assert');
const { getQueueTicketsForAgent, calculateSlaUrgency, filterTicketsByPriority } = require('../services/assignment');

test('PS18-13: Agent portal queue ordering by SLA urgency, presence filtering, and SLA urgency tiers', () => {
  // 1. SLA Urgency Thresholds Calculation
  // SLA thresholds:
  // - > 15 min remaining -> 'normal' (green/calm)
  // - <= 15 min and > 5 min -> 'warning' (amber)
  // - <= 5 min and > 0 min -> 'urgent' (rose/coral)
  // - <= 0 min -> 'breached' (deep crimson)

  const now = new Date('2026-03-10T12:00:00Z');

  const slaNormal = calculateSlaUrgency(new Date('2026-03-10T12:30:00Z'), now);
  assert.strictEqual(slaNormal.tier, 'normal');
  assert.strictEqual(slaNormal.minutesRemaining, 30);

  const slaWarning = calculateSlaUrgency(new Date('2026-03-10T12:12:00Z'), now);
  assert.strictEqual(slaWarning.tier, 'warning');
  assert.strictEqual(slaWarning.minutesRemaining, 12);

  const slaUrgent = calculateSlaUrgency(new Date('2026-03-10T12:04:00Z'), now);
  assert.strictEqual(slaUrgent.tier, 'urgent');
  assert.strictEqual(slaUrgent.minutesRemaining, 4);

  const slaBreached = calculateSlaUrgency(new Date('2026-03-10T11:58:00Z'), now);
  assert.strictEqual(slaBreached.tier, 'breached');
  assert.strictEqual(slaBreached.minutesRemaining, -2);

  // 2. Queue Ordering: Urgent / Breached SLA tickets MUST sort to the top
  const tickets = [
    { id: 't-green',  priority: 'normal', sla_deadline: '2026-03-10T12:45:00Z', status: 'open' },
    { id: 't-breach', priority: 'high',   sla_deadline: '2026-03-10T11:55:00Z', status: 'open' },
    { id: 't-amber',  priority: 'urgent', sla_deadline: '2026-03-10T12:10:00Z', status: 'open' },
    { id: 't-red',    priority: 'high',   sla_deadline: '2026-03-10T12:03:00Z', status: 'open' },
  ];

  const sortedQueue = getQueueTicketsForAgent(tickets, now);
  assert.strictEqual(sortedQueue[0].id, 't-breach', 'Breached ticket must be at the very top');
  assert.strictEqual(sortedQueue[1].id, 't-red',    'Ticket with 3 min left must be second');
  assert.strictEqual(sortedQueue[2].id, 't-amber',  'Ticket with 10 min left must be third');
  assert.strictEqual(sortedQueue[3].id, 't-green',  'Ticket with 45 min left must be fourth');

  // 3. Priority Filtering Logic (Pill buttons: All, Urgent, High, Normal, Low)
  const urgentOnly = filterTicketsByPriority(tickets, 'urgent');
  assert.strictEqual(urgentOnly.length, 1);
  assert.strictEqual(urgentOnly[0].id, 't-amber');

  const highOnly = filterTicketsByPriority(tickets, 'high');
  assert.strictEqual(highOnly.length, 2);

  const allFiltered = filterTicketsByPriority(tickets, 'all');
  assert.strictEqual(allFiltered.length, 4);

  // 4. Clean View Model Guard (No debug / dev chrome in data model)
  for (const t of sortedQueue) {
    assert.strictEqual('debugLog' in t, false, 'No dev debugLog in agent queue items');
    assert.strictEqual('rawStackTrace' in t, false, 'No dev trace in agent queue items');
  }
});
