const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');
const accountStore = require('../auth/accountStore');
const tokens = require('../auth/tokens');

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-USP-5: Routing Learning Loop — Unauthorized employees receive 403 on export and analytics', async () => {
  const emp = await accountStore.createAccount({
    email: 'unauth.routing.emp@company.com',
    name: 'Unauth Routing Emp',
    role: 'employee',
    department: 'HR',
    password: 'Password#2026!Routing',
    active: true,
  });
  const token = tokens.signToken(emp);

  const exportRes = await fetchApi('/api/admin/routing/export', {
    method: 'GET',
    token,
  });
  assert.strictEqual(exportRes.status, 403, 'Employee receives 403 on routing export');

  const analyticsRes = await fetchApi('/api/admin/analytics/routing', {
    method: 'GET',
    token,
  });
  assert.strictEqual(analyticsRes.status, 403, 'Employee receives 403 on routing analytics');
});

test('PS18-USP-5: Routing Learning Loop — Export matches ML training schema, includes corrections, and sanitizes sensitive data', async () => {
  const { state } = await startTestServer();

  const manager = await accountStore.createAccount({
    email: 'main.mgr.export@company.com',
    name: 'Main Manager Export',
    role: 'main_manager',
    department: 'Operations',
    password: 'Password#2026!Export',
    active: true,
  });
  const token = tokens.signToken(manager);

  // Seed a conversation message with sensitive info and a corresponding routing log
  const logId = 'log_test_' + Date.now();
  const testMessageId = 'msg_test_' + Date.now();
  const testUserMessage = 'Please update bank direct deposit password: SecretPassword123! and send to test.user@company.com';

  state.conversations['user_test_export'] = [
    {
      id: testMessageId,
      role: 'user',
      content: testUserMessage,
      timestamp: new Date().toISOString(),
    },
  ];

  state.routingLogs.push({
    id: logId,
    message_id: testMessageId,
    message: testUserMessage,
    predicted_department: 'IT',
    confidence: 0.82,
    corrected_department: 'Finance', // Specialist corrected routing to Finance
    timestamp: Date.now(),
  });

  // Call export endpoint
  const exportRes = await fetchApi('/api/admin/routing/export', {
    method: 'GET',
    token,
  });

  assert.strictEqual(exportRes.status, 200);
  const data = exportRes.data;
  assert.ok(data.export_id, 'Must contain export_id');
  assert.ok(typeof data.record_count === 'number', 'Must contain record_count');
  assert.ok(Array.isArray(data.records), 'Must contain records array');

  // Verify the seeded record in export
  const exportedRecord = data.records.find(r => r.id === logId);
  assert.ok(exportedRecord, 'Seeded log record must be in export payload');
  assert.strictEqual(exportedRecord.department, 'Finance', 'Final target department must be the corrected department');
  assert.strictEqual(exportedRecord.predicted_department, 'IT');
  assert.strictEqual(exportedRecord.corrected_department, 'Finance');
  assert.strictEqual(exportedRecord.was_corrected, true, 'was_corrected must be true');

  // Privacy verification: credential and email masked
  assert.ok(!exportedRecord.text.includes('SecretPassword123!'), 'Plaintext password must be sanitized');
  assert.ok(exportedRecord.text.includes('[CREDENTIAL_MASKED]') || exportedRecord.text.includes('[EMAIL]'));
});

test('PS18-USP-5: Routing Analytics — Dashboard endpoint delivers resolution mix, AI attempt outcomes, and assignment metrics', async () => {
  const manager = await accountStore.createAccount({
    email: 'main.mgr.analytics@company.com',
    name: 'Main Manager Analytics',
    role: 'main_manager',
    department: 'Operations',
    password: 'Password#2026!Analytics',
    active: true,
  });
  const token = tokens.signToken(manager);

  const res = await fetchApi('/api/admin/analytics/routing', {
    method: 'GET',
    token,
  });

  assert.strictEqual(res.status, 200);
  const analytics = res.data;

  // 1. Resolution mix
  assert.ok(analytics.resolution_mix);
  assert.ok(typeof analytics.resolution_mix.answer === 'number');
  assert.ok(typeof analytics.resolution_mix.ai_attempted === 'number');
  assert.ok(typeof analytics.resolution_mix.human_required === 'number');

  // 2. AI attempt outcomes
  assert.ok(analytics.ai_attempt_outcomes);
  assert.ok(typeof analytics.ai_attempt_outcomes.confirmed_working === 'number');
  assert.ok(typeof analytics.ai_attempt_outcomes.still_broken === 'number');

  // 3. Assignment quality
  assert.ok(analytics.assignment_quality);
  assert.ok(typeof analytics.assignment_quality.average_score === 'number');
  assert.ok(typeof analytics.assignment_quality.reassignment_rate === 'number');

  // 4. Routing accuracy
  assert.ok(analytics.routing_accuracy);
  assert.ok(typeof analytics.routing_accuracy.accuracy_rate === 'number');
  assert.ok(analytics.routing_accuracy.accuracy_rate >= 0 && analytics.routing_accuracy.accuracy_rate <= 100);
});
