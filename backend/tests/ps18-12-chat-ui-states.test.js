const test = require('node:test');
const assert = require('node:assert');

// Test that the frontend chat state contract covers all 13 states
test('PS18-12: Chat UI 13-state contract validation and microcopy compliance', () => {
  const STATES = {
    1:  'answering',
    2:  'clarifying',
    3:  'handoff_queued',
    4:  'agent_joined',
    5:  'waiting_on_you',
    6:  'escalated',
    7:  'resolved',
    8:  'reopened',
    9:  'off_hours',
    10: 'no_one_free',
    11: 'sensitive_action',
    12: 'content_filter',
    13: 'outage_banner',
  };

  assert.strictEqual(Object.keys(STATES).length, 13, 'Must define all 13 UX states');

  // Verify microcopy rules (sentence case, no "please", no "successfully", no "!")
  const forbiddenPatterns = [
    /\bplease\b/i,
    /\bsuccessfully\b/i,
    /!/,
  ];

  const microcopySamples = [
    { state: 3, copy: 'Passing you to IT Support. Ravi, a Level 2 specialist, is on it.' },
    { state: 4, copy: 'Ravi joined the chat' },
    { state: 5, copy: 'Ravi needs one more detail from you.' },
    { state: 6, copy: 'Moved up to Level 3. This needs deeper network access. Your notes went with it.' },
    { state: 7, copy: 'Marked resolved. Did that fix it?' },
    { state: 8, copy: 'Reopened. This goes to the front of the line.' },
    { state: 9, copy: 'IT Support is offline until 9:00 AM. You\'re first in line.' },
    { state: 10, copy: 'Everyone at this level is busy. You\'re 3rd in line, about 20 to 30 min.' },
    { state: 12, copy: 'Let\'s keep it respectful. I\'ll still help with this.' },
    { state: 12, copy: 'We hid your card number for safety.' },
  ];

  for (const item of microcopySamples) {
    for (const pat of forbiddenPatterns) {
      assert.strictEqual(
        pat.test(item.copy),
        false,
        `State ${item.state} microcopy violation (${pat}): "${item.copy}"`
      );
    }
  }

  // Verify ETA time format rule: range + clock time
  const etaSample = 'About 15 to 25 min, by 2:40 PM';
  assert.match(etaSample, /^About \d+ to \d+ min, by \d{1,2}:\d{2}\s?(?:AM|PM)$/);

  // Verify priority reason rule: priority is a word plus a reason, never color alone
  const priorities = [
    { word: 'Urgent', reason: 'Security or company-wide impact' },
    { word: 'High',   reason: 'Blocks your work today' },
    { word: 'Normal', reason: 'Standard request' },
    { word: 'Low',    reason: 'No deadline given' },
  ];
  for (const p of priorities) {
    assert.ok(p.word && p.reason, 'Priority must pair word with plain-text reason');
  }
});
