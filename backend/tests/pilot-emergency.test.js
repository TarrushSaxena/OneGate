const test=require('node:test');
const assert=require('node:assert/strict');
const {startTestServer,stopTestServer,fetchApi}=require('./helpers/harness');
test.after(stopTestServer);
test('chat emergencies bypass classification, assignment and queue ETA',async()=>{
 await startTestServer();
 const accounts=require('../auth/accountStore');
 const employee=await accounts.createAccount({email:'emergency-test@company.com',name:'Employee',role:'employee',department:'IT',password:'Aa1!'+require('crypto').randomBytes(24).toString('hex'),active:true,must_change_password:false});
 const token=require('../auth/tokens').signToken(employee);
 for(const message of ['Someone fainted on the 3rd floor, need help','Someone is unconscious','There is smoke in the office','chest pain','harassment-in-progress']) {
  const r=await fetchApi('/api/chat/message',{method:'POST',token,body:{message}});
  assert.equal(r.status,200);assert.equal(r.data.ticket.department,'Facilities');assert.equal(r.data.ticket.priority,'critical');
  assert.match(r.data.message.content,/112/);assert.doesNotMatch(r.data.message.content,/\d+ to \d+ min/);assert.equal(r.data.ticket.eta_text,undefined);
 }
 assert.ok(require('../services/emergency').getSosAuditLog().length>=5);
});
