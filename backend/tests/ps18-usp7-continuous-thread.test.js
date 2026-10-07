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

test('PS18-USP-7: Continuous Thread — Agent replies are written inline into employee conversation history with correct ordering and no duplicates', async () => {
  // 1. Create employee and agent
  const emp = await accountStore.createAccount({
    email: 'thread.emp@company.com',
    name: 'Thread Employee',
    role: 'employee',
    department: 'IT',
    password: 'Password#2026!Thread',
    active: true,
  });

  const agent = await accountStore.createAccount({
    email: 'thread.agent@company.com',
    name: 'Thread Specialist',
    role: 'support_executive',
    department: 'IT',
    tier: 'L2',
    password: 'Password#2026!Thread',
    active: true,
  });

  const empToken = tokens.signToken(emp);
  const agentToken = tokens.signToken(agent);

  // 2. Employee sends initial message resulting in ticket creation
  const initialUserMessage = 'My corporate monitor display is showing red static lines across screen';
  const chatRes = await fetchApi('/api/chat/message', {
    method: 'POST',
    token: empToken,
    body: {
      userId: emp.id,
      message: initialUserMessage,
    },
  });

  assert.strictEqual(chatRes.status, 200);
  const ticketId = chatRes.data.ticket?.id;
  assert.ok(ticketId, 'Ticket must be created for hardware issue');

  // 3. Agent replies to the ticket using POST /api/tickets/:id/reply
  const agentReplyText = 'Hello, this is Thread Specialist. Have you tried reseating the DisplayPort cable or testing with an HDMI cable?';
  const replyRes = await fetchApi(`/api/tickets/${ticketId}/reply`, {
    method: 'POST',
    token: agentToken,
    body: {
      employeeId: agent.id,
      message: agentReplyText,
    },
  });

  assert.strictEqual(replyRes.status, 200);
  assert.ok(replyRes.data.success);

  // 4. Fetch employee chat history through frontend conversation endpoint
  const convRes = await fetchApi(`/api/chat/conversation/${emp.id}`, {
    method: 'GET',
    token: empToken,
  });

  assert.strictEqual(convRes.status, 200);
  const messages = convRes.data.messages;
  assert.ok(Array.isArray(messages), 'Messages must be returned as array');
  assert.ok(messages.length >= 3, 'Must contain initial user message, assistant/ticket message, and agent reply');

  // Verify ordering: user message -> assistant message -> agent reply
  const userMsgIndex = messages.findIndex(m => m.role === 'user' && m.content === initialUserMessage);
  const agentMsgIndex = messages.findIndex(m => m.role === 'employee' && m.content === agentReplyText);

  assert.ok(userMsgIndex !== -1, 'User message present in conversation');
  assert.ok(agentMsgIndex !== -1, 'Agent reply present in conversation');
  assert.ok(agentMsgIndex > userMsgIndex, 'Agent reply must follow user message in chronological sequence');

  // Verify agent message attributes
  const agentMsg = messages[agentMsgIndex];
  assert.strictEqual(agentMsg.employeeName, agent.name);
  assert.ok(agentMsg.timestamp, 'Timestamp must exist');
  assert.ok(new Date(agentMsg.timestamp).getTime() >= new Date(messages[userMsgIndex].timestamp).getTime());

  // 5. Subsequent refresh test: Fetch conversation again and confirm no duplicates
  const secondFetch = await fetchApi(`/api/chat/conversation/${emp.id}`, {
    method: 'GET',
    token: empToken,
  });

  assert.strictEqual(secondFetch.status, 200);
  const matchingReplies = secondFetch.data.messages.filter(m => m.role === 'employee' && m.content === agentReplyText);
  assert.strictEqual(matchingReplies.length, 1, 'Exactly one agent reply exists after refresh (no duplicate messages)');
});
