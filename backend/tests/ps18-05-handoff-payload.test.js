const test = require('node:test');
const assert = require('node:assert');
const { buildHandoffPayload } = require('../services/handoff');

test('PS18-05: Handoff payload schema and strict deny-list security enforcement', () => {
  const fakeTicket = {
    id: 't-12345678',
    department: 'IT',
    priority: 'high',
    priority_reason: 'Blocks your work today',
    status: 'assigned',
    required_tier: 'L2',
  };

  const fakeAssignee = {
    id: 'emp-99',
    name: 'Ravi Kumar',
    tier: 'L2',
    current_load: 4,
    rolling_score: 95,
  };

  const payload = buildHandoffPayload(fakeTicket, fakeAssignee, 15, 25, 'Asia/Kolkata');

  // 1. Schema assertions
  assert.strictEqual(payload.ticket_ref, '345678');
  assert.strictEqual(payload.department, 'IT Support');
  assert.strictEqual(payload.priority, 'high');
  assert.strictEqual(payload.priority_reason, 'Blocks your work today');
  assert.strictEqual(payload.assigned_first_name, 'Ravi');
  assert.strictEqual(payload.level_label, 'Level 2 specialist');
  assert.strictEqual(payload.status_step, 'assigned');
  assert.strictEqual(payload.eta_low_min, 15);
  assert.strictEqual(payload.eta_high_min, 25);
  assert.strictEqual(typeof payload.eta_clock, 'string');
  assert.strictEqual(payload.can_change_priority, true);

  // 2. Deny list test: no internal scores, load, or internal IDs
  const DENIED_KEYS = ['score', 'scores', 'load', 'current_load', 'employee_id', 'employeeId', 'rolling_score'];
  for (const k of DENIED_KEYS) {
    assert.strictEqual(k in payload, false, `Security Violation: Key "${k}" leaked into user DTO!`);
  }

  // 3. Ensure test fails if any denied key is injected into a payload
  assert.throws(() => {
    const maliciousPayload = { ...payload, score: 95.4 };
    for (const k of DENIED_KEYS) {
      if (k in maliciousPayload) {
        throw new Error(`Security violation: Key "${k}" found in payload`);
      }
    }
  }, /Security violation: Key "score" found/);
});
