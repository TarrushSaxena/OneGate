const test = require('node:test');
const assert = require('node:assert');
const { levelLabel } = require('../services/priority');

test('PS18-04: Level label mapper exhaustive test and unknown input throws', () => {
  // Exhaustive mapping assertions
  assert.strictEqual(levelLabel('L1'), 'Level 1 support');
  assert.strictEqual(levelLabel('L2'), 'Level 2 specialist');
  assert.strictEqual(levelLabel('L3'), 'Level 3 senior specialist');
  assert.strictEqual(levelLabel('manager'), 'Team lead');
  assert.strictEqual(levelLabel('manager queue'), 'Team lead');

  // Unknown inputs must throw an Error
  assert.throws(() => levelLabel('L4'), /Unknown tier/);
  assert.throws(() => levelLabel('admin'), /Unknown tier/);
  assert.throws(() => levelLabel('Tier-1'), /Unknown tier/);
  assert.throws(() => levelLabel(''), /Unknown tier/);
  assert.throws(() => levelLabel(null), /Unknown tier/);
});
