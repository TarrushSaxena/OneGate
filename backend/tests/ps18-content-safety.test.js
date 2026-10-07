const test = require('node:test');
const assert = require('node:assert');
const { assertProfessionalStaffText } = require('../services/contentSafety');

test('staff-facing timeline updates reject abusive language', () => {
  assert.strictEqual(assertProfessionalStaffText('Reviewed the request; no action is required.'), 'Reviewed the request; no action is required.');
  assert.throws(
    () => assertProfessionalStaffText('fuck off'),
    error => error.status === 400 && error.payload?.code === 'unprofessional_language'
  );
});
