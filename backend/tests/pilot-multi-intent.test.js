const test=require('node:test');const assert=require('node:assert/strict');
const {startTestServer,stopTestServer,fetchApi}=require('./helpers/harness');test.after(stopTestServer);
test('both requests remain available through selection and follow-up',async()=>{
 await startTestServer();const a=await require('../auth/accountStore').createAccount({email:'multi@company.com',name:'Multi',role:'employee',department:'IT',password:'TestOnly!12345',active:true});const token=require('../auth/tokens').signToken(a);
 const chat=message=>fetchApi('/api/chat/message',{method:'POST',token,body:{message}});
 const first=await chat('I need to reset my VPN password and also apply for leave next Friday');
 assert.equal(first.status,200);assert.equal(first.data.message.metadata.pending_intents.length,2);assert.match(first.data.message.content,/VPN password/);assert.match(first.data.message.content,/leave next Friday/);
 const second=await chat('1');assert.equal(second.status,200);assert.equal(second.data.message.metadata.pending_intents.length,1);assert.match(second.data.message.content,/leave next Friday/);
 const third=await chat('next');assert.equal(third.status,200);assert.equal(third.data.message.metadata.pending_intents.length,0);assert.equal(third.data.message.metadata.department,'HR');
});
