const test = require('node:test');
const assert = require('node:assert');
const fakeData = require('../data/fake-data');

test('PS18-01: Tickets and employees data model contains all required schema fields', () => {
  // Test employees schema
  assert.ok(fakeData.employees.length > 0, 'Employees should exist');
  for (const emp of fakeData.employees) {
    assert.ok(emp.id, 'Employee must have id');
    assert.ok(emp.name || emp.display_name, 'Employee must have name or display_name');
    assert.ok(emp.department, 'Employee must have department');
    assert.ok(['L1', 'L2', 'L3'].includes(emp.tier), `Employee tier must be valid: ${emp.tier}`);
    assert.ok(Array.isArray(emp.skill_tags), 'Employee must have skill_tags array');
  }

  // Test tickets schema
  assert.ok(fakeData.tickets.length > 0, 'Tickets should exist');
  for (const t of fakeData.tickets) {
    assert.ok(t.id, 'Ticket must have id');
    assert.ok(t.department, 'Ticket must have department');
    assert.ok(['critical', 'high', 'medium', 'low'].includes(t.priority), `Ticket priority must be valid: ${t.priority}`);
    assert.ok(typeof t.priority_reason === 'string', 'Ticket must have priority_reason string');
    assert.ok(typeof t.eta_low_min === 'number', 'Ticket must have eta_low_min');
    assert.ok(typeof t.eta_high_min === 'number', 'Ticket must have eta_high_min');
    assert.ok('escalation_history' in t, 'Ticket must have escalation_history field');
    assert.ok(Array.isArray(t.escalation_history), 'Ticket escalation_history must be an array');
  }
});
