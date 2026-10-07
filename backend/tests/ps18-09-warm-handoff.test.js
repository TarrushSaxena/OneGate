const test = require('node:test');
const assert = require('node:assert');
const { generateWarmHandoffSummary, generateAgentSuggestedReply } = require('../services/orchestrator');
const { kbArticles } = require('../data/knowledge-base');

test('PS18-09: Warm handoff summary formatting and grounded agent suggested reply with clause ID', async () => {
  const fakeConversation = [
    { role: 'user', content: 'My Outlook desktop app is crashing whenever I open a calendar invitation.' },
    { role: 'assistant', content: 'Have you tried running Outlook in safe mode or restarting the app?' },
    { role: 'user', content: 'Yes I tried safe mode and rebooted, still crashing immediately.' },
  ];

  // 1. Warm handoff summary generation
  const summary = await generateWarmHandoffSummary(fakeConversation, 'IT');
  assert.ok(typeof summary === 'string', 'Summary must be a string');
  assert.ok(summary.length > 10, 'Summary must not be empty');

  // 2. Agent suggested reply citing real KB clause
  const fakeTicket = {
    id: 't-0987',
    department: 'IT',
    required_tier: 'L2',
    transcript: fakeConversation,
  };

  const matchedArticle = kbArticles.find(a => a.id === 'it-006' || a.tags.includes('outlook'));
  assert.ok(matchedArticle, 'KB article for Outlook must exist in knowledge base');

  const fakeKbResult = {
    topResult: matchedArticle,
  };

  const agentReply = await generateAgentSuggestedReply(fakeTicket, fakeKbResult);
  assert.ok(agentReply, 'Agent suggested reply must be generated');
  assert.ok(typeof agentReply.text === 'string' && agentReply.text.length > 0, 'Reply text must be non-empty');
  assert.ok(typeof agentReply.citation === 'string', 'Citation must be non-empty');

  // Ensure citation corresponds to a real KB article source_citation in knowledge base
  const citationMatchesKnownKB = kbArticles.some(a => a.source_citation === agentReply.citation);
  assert.strictEqual(
    citationMatchesKnownKB,
    true,
    `Suggested reply cited unknown clause: "${agentReply.citation}"`
  );
});
