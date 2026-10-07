const test=require('node:test');
const assert=require('node:assert/strict');
delete process.env.ZENMUX_API_KEY;
const {callLLM,finalAnswer}=require('../services/llm');
test('missing key fails closed without a provider request',async()=>{await assert.rejects(callLLM([]),/not configured/);});
test('only final answer content can reach the user',()=>{
 for(const value of ['<think>The user is asking for a refund. I need to check.</think>Contact Finance.',"The user is asking for a refund. First, I need to check. I'll respond: Contact Finance.",'Final answer: Contact Finance.']) {
  const reply=finalAnswer(value);assert.equal(reply,'Contact Finance.');assert.doesNotMatch(reply,/The user is asking|I need to/i);
 }
 assert.equal(finalAnswer('The user is asking for a refund. I need to check.'),'');
 assert.equal(finalAnswer('<think>Unclosed reasoning'),'');assert.equal(finalAnswer(undefined),'');
});
