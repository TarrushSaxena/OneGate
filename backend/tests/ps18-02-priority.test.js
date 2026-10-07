const test = require('node:test');
const assert = require('node:assert');
const { computePriority } = require('../services/priority');

test('PS18-02: Priority service table test of 30 messages with rules + sentiment', () => {
  const cases = [
    // --- Critical / Urgent (Security incidents, outages, lost device, company-wide impact) ---
    { msg: 'Production server is down for all employees', expected: 'critical' },
    { msg: 'Major outage: VPN is down for everyone in the company', expected: 'critical' },
    { msg: 'Possible security breach, someone compromised my corporate account', expected: 'critical' },
    { msg: 'Ransomware detected on engineering workstation', expected: 'critical' },
    { msg: 'I lost my corporate laptop at the airport', expected: 'critical' },
    { msg: 'My laptop was stolen from my car', expected: 'critical' },
    { msg: 'Severe payroll error right before friday payday', expected: 'critical' },
    { msg: 'Cannot work, everyone in our whole team is locked out', expected: 'critical' },

    // --- High (Work-blocking, deadlines < 24h, repeated failures, frustration) ---
    { msg: 'This is urgent, need access immediately', expected: 'high' },
    { msg: 'This issue blocks my work today completely', expected: 'high' },
    { msg: 'I have an executive demo today in 2 hours and zoom is crashing', expected: 'high' },
    { msg: 'Client presentation due this morning and slides won\'t export', expected: 'high' },
    { msg: 'Job interview meeting in 1 hour and calendar link is broken', expected: 'high' },
    { msg: 'Unable to login to corporate portal after password reset', expected: 'high' },
    { msg: 'Still broken after the technician rebooted the server', expected: 'high' },
    { msg: 'I am extremely frustrated with this recurring email sync failure', expected: 'high', sentiment: { label: 'frustrated', hasUrgency: true } },
    { msg: 'Need VPN fixed ASAP to submit end of day report', expected: 'high' },
    { msg: 'Payment batch submission deadline today at 3pm', expected: 'high' },

    // --- Medium / Normal (Standard requests, fault without immediate deadline) ---
    { msg: 'Need to install Docker Desktop on my development laptop', expected: 'medium' },
    { msg: 'Can you add me to the marketing team distribution email list?', expected: 'medium' },
    { msg: 'Requesting a second monitor for my office desk', expected: 'medium' },
    { msg: 'Please update my direct deposit bank account details on file', expected: 'medium' },
    { msg: 'Please configure my corporate phone extension', expected: 'medium' },
    { msg: 'Requesting an Adobe Creative Cloud license for new project', expected: 'medium' },

    // --- Low (General questions, no deadline, curious, suggestions) ---
    { msg: 'General question about annual leave rollover policy', expected: 'low' },
    { msg: 'Just curious what the company policy is regarding gym membership', expected: 'low' },
    { msg: 'When you get a chance, no rush, where can I find the brand guidelines?', expected: 'low' },
    { msg: 'Best practice recommendation for organizing Slack channels', expected: 'low' },
    { msg: 'Nice to have suggestion for the office cafeteria menu', expected: 'low' },
    { msg: 'Where can I find the holiday calendar for next year?', expected: 'low' },
  ];

  assert.strictEqual(cases.length, 30, 'Must have exactly 30 test cases in table test');

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const res = computePriority(c.msg, c.sentiment || {});
    assert.strictEqual(
      res.priority,
      c.expected,
      `Case ${i + 1} failed: "${c.msg}" -> expected ${c.expected}, got ${res.priority}`
    );
    assert.ok(
      typeof res.priority_reason === 'string' && res.priority_reason.length > 0,
      `Case ${i + 1} must return a non-empty priority_reason`
    );
  }
});

test('PS18-02: Bare greeting / general inquiry evaluates to low priority, never high', () => {
  const { analyzeMessage } = require('../ml/sentiment');
  const greetingText = 'Hello! What can you help me with?';
  const nlp = analyzeMessage(greetingText);
  const res = computePriority(greetingText, nlp.sentiment);
  assert.strictEqual(
    res.priority,
    'low',
    `Greeting "${greetingText}" must evaluate to low priority, got "${res.priority}"`
  );
  assert.strictEqual(res.priority_reason, 'No deadline given');
});

test('PS18-02: Genuinely urgent natural messages using "help" without "urgent" evaluate to high/critical priority', () => {
  const { analyzeMessage } = require('../ml/sentiment');
  const urgentCases = [
    { msg: 'I need help right now, this is blocking my work', expected: 'high' },
    { msg: 'Can someone help, I cannot login to submit the payroll batch due today in 1 hour', expected: 'high' },
    { msg: 'Please help me, the production server is down and all users cannot work', expected: 'critical' },
  ];

  for (let i = 0; i < urgentCases.length; i++) {
    const c = urgentCases[i];
    const nlp = analyzeMessage(c.msg);
    const res = computePriority(c.msg, nlp.sentiment);
    assert.strictEqual(
      res.priority,
      c.expected,
      `Urgent case ${i + 1} failed: "${c.msg}" -> expected ${c.expected}, got ${res.priority}`
    );
  }
});

test('PS18-02: Common words (now, today, down, deadline, important, priority, blocked) in harmless sentences do not false-positive as high', () => {
  const { analyzeMessage } = require('../ml/sentiment');
  const benignCases = [
    { word: 'now', msg: 'Can I submit my expense report now or wait until Monday?', expected: 'medium' },
    { word: 'today', msg: 'Is the cafeteria open today?', expected: 'medium' },
    { word: 'down', msg: 'I wrote down the serial number on my asset tag', expected: 'medium' },
    { word: 'deadline', msg: 'What is the standard deadline for submitting annual tax declarations?', expected: 'low' },
    { word: 'important', msg: 'Is it important to keep paper copies of receipts?', expected: 'medium' },
    { word: 'priority', msg: 'How do I set the priority field on a new Jira issue?', expected: 'low' },
    { word: 'blocked', msg: 'Pop-up blocked by the Chrome browser when downloading handbook', expected: 'medium' },
  ];

  for (let i = 0; i < benignCases.length; i++) {
    const c = benignCases[i];
    const nlp = analyzeMessage(c.msg);
    const res = computePriority(c.msg, nlp.sentiment);
    assert.notStrictEqual(
      res.priority,
      'high',
      `Benign sentence for '${c.word}' must NOT evaluate to high: "${c.msg}"`
    );
    assert.strictEqual(
      res.priority,
      c.expected,
      `Benign sentence for '${c.word}' expected ${c.expected}, got ${res.priority}: "${c.msg}"`
    );
  }
});
