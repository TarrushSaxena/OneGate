const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-USP-2: Direct policy question returns resolution_type: "answer" with label "Answered directly"', async () => {
  const res = await fetchApi('/api/chat/message', {
    method: 'POST',
    body: {
      userId: 'test-user-usp2-answer',
      message: 'What is our annual leave balance policy?',
    },
  });

  assert.strictEqual(res.status, 200);
  assert.ok(res.data.message, 'Response includes message');
  
  // Resolution type and label contract
  const msg = res.data.message;
  assert.strictEqual(msg.resolution_type, 'answer', 'Must be classified as answer');
  assert.strictEqual(msg.resolution_label, 'Answered directly', 'Label must be "Answered directly"');
  assert.strictEqual(msg.resolution_color, 'blue');
  assert.strictEqual(res.data.routing?.resolution_type, 'answer');
});

test('PS18-USP-2: Complex incident requiring staff returns resolution_type: "human_required" with label "Connecting you with a person"', async () => {
  const res = await fetchApi('/api/chat/message', {
    method: 'POST',
    body: {
      userId: 'test-user-usp2-human',
      message: 'My laptop screen is physically broken and smoking, I need a replacement urgently',
    },
  });

  assert.strictEqual(res.status, 200);
  const msg = res.data.message;
  assert.strictEqual(msg.resolution_type, 'human_required', 'Must be classified as human_required');
  assert.strictEqual(msg.resolution_label, 'Connecting you with a person', 'Label must be "Connecting you with a person"');
  assert.strictEqual(msg.resolution_color, 'purple');
  assert.ok(res.data.ticket, 'Ticket must be created for human_required');
});

test('PS18-USP-2: Known safe self-fix returns resolution_type: "ai_attempted" with label "Tried a fix"', async () => {
  const res = await fetchApi('/api/chat/message', {
    method: 'POST',
    body: {
      userId: 'test-user-usp2-fix',
      message: 'My VPN client GlobalProtect gives error 90 connection timeout',
    },
  });

  assert.strictEqual(res.status, 200);
  const msg = res.data.message;
  assert.strictEqual(msg.resolution_type, 'ai_attempted', 'Must be classified as ai_attempted');
  assert.strictEqual(msg.resolution_label, 'Tried a fix', 'Label must be "Tried a fix"');
  assert.strictEqual(msg.resolution_color, 'amber');
});
