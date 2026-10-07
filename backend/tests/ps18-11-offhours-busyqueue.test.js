const test = require('node:test');
const assert = require('node:assert');
const { isBusinessHours, getQueueStatus, buildOffHoursCard, buildBusyQueueCard } = require('../services/queueService');

test('PS18-11: Off-hours detection with fake clock and busy queue position updates', () => {
  // ─── 1. Fake Clock Off-Hours Tests ──────────────────────────────
  // Normal business hours: Mon-Fri 9:00 AM - 6:00 PM (09:00 - 18:00) Asia/Kolkata

  // Case A: Tuesday at 2:30 PM (During business hours)
  // 2026-03-10 is a Tuesday. 14:30 IST
  const tuesdayAfternoon = new Date('2026-03-10T14:30:00+05:30');
  const busResult = isBusinessHours(tuesdayAfternoon, 'IT');
  assert.strictEqual(busResult.isOffline, false, 'Tuesday at 2:30 PM must be within business hours');

  // Case B: Tuesday at 11:30 PM (Late night off-hours)
  const tuesdayNight = new Date('2026-03-10T23:30:00+05:30');
  const nightResult = isBusinessHours(tuesdayNight, 'IT');
  assert.strictEqual(nightResult.isOffline, true, 'Tuesday at 11:30 PM must be off-hours');
  assert.strictEqual(nightResult.onlineAt, '9:00 AM', 'Should be offline until 9:00 AM');

  // Case C: Sunday at 11:00 AM (Weekend off-hours)
  // 2026-03-15 is a Sunday
  const sundayMorning = new Date('2026-03-15T11:00:00+05:30');
  const weekendResult = isBusinessHours(sundayMorning, 'HR');
  assert.strictEqual(weekendResult.isOffline, true, 'Sunday must be off-hours');
  assert.strictEqual(weekendResult.onlineAt, '9:00 AM Monday', 'Sunday should resume 9:00 AM Monday');

  // Case D: Build Off-Hours card content per Part 1 copy spec
  const fakeArticle = {
    title: 'VPN Connection Troubleshooting',
    source_citation: 'IT Policy §3.2 — VPN & Remote Access',
    content: 'Open GlobalProtect and click Connect...',
  };
  const offHoursCard = buildOffHoursCard('IT', nightResult.onlineAt, fakeArticle);
  assert.ok(offHoursCard.message.includes('IT Support is offline until 9:00 AM'));
  assert.ok(offHoursCard.message.includes('Your ticket is first in line'));
  assert.strictEqual(offHoursCard.citation, 'IT Policy §3.2 — VPN & Remote Access');

  // ─── 2. Busy Queue Flow (State 10: No One Free) ─────────────────
  const mockEmployees = [
    { id: 'e1', department: 'IT', tier: 'L1', status: 'online', current_load: 6 }, // at cap (6)
    { id: 'e2', department: 'IT', tier: 'L1', status: 'busy',   current_load: 6 }, // at cap (6)
    { id: 'e3', department: 'IT', tier: 'L1', status: 'offline', current_load: 0 },
  ];

  const mockOpenTickets = [
    { id: 't1', department: 'IT', priority: 'high', status: 'acknowledged' },
    { id: 't2', department: 'IT', priority: 'high', status: 'in_progress' },
    { id: 't3', department: 'IT', priority: 'high', status: 'open' },
  ];

  // All online L1 agents are at max capacity -> triggers busy queue flow
  const queueStatus = getQueueStatus('IT', 'high', 'L1', mockEmployees, mockOpenTickets);
  assert.strictEqual(queueStatus.isBusy, true, 'Should detect that everyone at this level is busy');
  assert.strictEqual(queueStatus.queuePosition, 4, 'New ticket should be 4th in line');

  // Build State 10 Busy Queue Card per Part 1 copy spec
  const busyCard = buildBusyQueueCard(queueStatus.queuePosition, 20, 30);
  assert.strictEqual(
    busyCard.copy,
    "Everyone at this level is busy. You're 4th in line, about 20 to 30 min."
  );
  assert.strictEqual(busyCard.queuePosition, 4);

  // When ticket t1 resolves, queuePosition updates live from 4 to 3
  const updatedOpenTickets = mockOpenTickets.slice(1);
  const updatedStatus = getQueueStatus('IT', 'high', 'L1', mockEmployees, updatedOpenTickets);
  assert.strictEqual(updatedStatus.queuePosition, 3, 'Queue position must update when a ticket resolves');
});
