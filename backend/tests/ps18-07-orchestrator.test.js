const test = require('node:test');
const assert = require('node:assert');
const { orchestrate, TEMPLATES } = require('../services/orchestrator');
const { initializeKBEngine } = require('../ml/embeddings');
const { kbArticles } = require('../data/knowledge-base');

initializeKBEngine(kbArticles);

test('PS18-07: Orchestrator action routing, multi-intent clarify, and grounded answer', async () => {
  // 1. Explicit incident / physical issue -> triggers ticket action
  const ticketRes = await orchestrate('My corporate laptop battery is smoking and won\'t turn on', []);
  assert.strictEqual(ticketRes.action, 'ticket');
  assert.strictEqual(ticketRes.department, 'IT');
  assert.strictEqual(ticketRes.priority, 'critical');

  // 2. Multi-intent message -> triggers multi_clarify action
  const multiRes = await orchestrate('I need help with my laptop VPN setup and also what is the leave policy for sick days', []);
  assert.strictEqual(multiRes.action, 'multi_clarify');
  assert.strictEqual(multiRes.type, 'multi_intent_clarification');
  assert.ok(multiRes.response.includes('different topics'));
  assert.ok(multiRes.detected_departments.includes('IT'));
  assert.ok(multiRes.detected_departments.includes('HR'));

  // 3. Multi-intent follow-up -> user replies 'HR' -> resolves context to leave policy
  const history = [
    { role: 'user', content: 'I need help with my laptop VPN setup and also what is the leave policy for sick days' },
    { role: 'assistant', content: multiRes.response, type: 'multi_intent_clarification' },
  ];
  const followUpRes = await orchestrate('HR', history);
  assert.strictEqual(followUpRes.department, 'HR');
  assert.ok(['answer', 'ticket'].includes(followUpRes.action));
  if (followUpRes.action === 'answer') {
    assert.ok(followUpRes.response.toLowerCase().includes('leave') || followUpRes.response.toLowerCase().includes('pto'));
  }

  // 4. Grounded policy knowledge direct answer
  const answerRes = await orchestrate('What are the core hours for hybrid work policy?', []);
  assert.strictEqual(answerRes.department, 'HR');
  assert.strictEqual(answerRes.action, 'answer');
  assert.ok(answerRes.response.includes('Source:') || answerRes.kbArticle !== null);

  // 5. Bare greeting / general inquiry with no issue described -> triggers clarifying question (State 2), NOT ticket
  const greetingRes = await orchestrate('Hello! What can you help me with?', []);
  assert.strictEqual(
    greetingRes.action,
    'clarify',
    `Bare greeting must return 'clarify' action (State 2), got '${greetingRes.action}'`
  );
  assert.strictEqual(
    greetingRes.type,
    'clarification',
    `Type must be 'clarification', got '${greetingRes.type}'`
  );
  assert.notStrictEqual(
    greetingRes.action,
    'ticket',
    'Bare greeting must NOT create a ticket'
  );
  assert.ok(
    greetingRes.response.includes('One Front Door') || greetingRes.response.includes('help with') || greetingRes.response.includes('department') || greetingRes.response.includes('IT, HR, Finance'),
    `Clarifying prompt must guide user, got: "${greetingRes.response}"`
  );
  assert.strictEqual(
    greetingRes.priority,
    'low',
    `Bare greeting priority must be 'low', got '${greetingRes.priority}'`
  );
});

test('PS18-07: non-work messages never create a specialist handoff', async () => {
  const direct = await orchestrate('I am horny', []);
  assert.strictEqual(direct.action, 'out_of_scope');
  assert.strictEqual(direct.type, 'out_of_scope');
  assert.strictEqual(direct.department, 'General');
  assert.strictEqual(direct.resolution_type, 'answer');

  const history = [
    { role: 'user', content: 'help' },
    { role: 'assistant', content: 'Could you provide a few more details so I can route your request to the right department?', metadata: { type: 'clarification' } },
  ];
  const unclearFollowUp = await orchestrate('banana', history);
  assert.strictEqual(unclearFollowUp.action, 'out_of_scope');
  assert.notStrictEqual(unclearFollowUp.action, 'ticket');

  const legitimateHrContext = await orchestrate('A coworker sent me unwanted sexual messages at work. I need to report harassment.', []);
  assert.notStrictEqual(legitimateHrContext.action, 'out_of_scope');

  const explicitHandoff = await orchestrate('Connect me with HR about my leave approval', []);
  assert.strictEqual(explicitHandoff.action, 'ticket');
  assert.strictEqual(explicitHandoff.department, 'HR');
});
