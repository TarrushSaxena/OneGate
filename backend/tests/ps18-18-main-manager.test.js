const test=require('node:test');
const assert=require('node:assert/strict');
const {startTestServer,stopTestServer,fetchApi}=require('./helpers/harness');
const accounts=require('../auth/accountStore');
const {signToken}=require('../auth/tokens');
const create=async(role,department,email)=>accounts.createAccount({role,department,email:email+'@company.com',name:email,tier:'L2',password:'TestOnly!12345',active:true,must_change_password:false});
test.before(startTestServer);test.after(stopTestServer);

test('organization dashboard aggregates current departments; department managers see only their own',async()=>{
 const director=await create('main_manager','All','scope-director');
 const legal=await create('department_manager','Legal','scope-legal');
 await create('support_executive','IT','scope-it');
 const {app}=await startTestServer();
 await app.get('pilotStore').transaction(data=>{data.tickets.push({id:'it',department:'IT',status:'open'},{id:'legal',department:'Legal',status:'resolved'});});
 const org=await fetchApi('/api/pilot/dashboard',{token:signToken(director)});
 assert.equal(org.status,200);assert.equal(org.data.open,1);assert.equal(org.data.resolved,1);
 assert.deepEqual(org.data.departments.map(d=>d.department).sort(),['IT','Legal']);
 const own=await fetchApi('/api/pilot/dashboard',{token:signToken(legal)});
 assert.equal(own.data.open,0);assert.equal(own.data.resolved,1);assert.equal(own.data.departments.length,1);
 assert.equal((await fetchApi('/api/tickets/it',{token:signToken(legal)})).status,403);
 assert.equal((await fetchApi('/api/tickets/it',{token:signToken(director)})).status,200);
});
