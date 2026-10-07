const test=require('node:test');
const assert=require('node:assert/strict');
const {startTestServer,stopTestServer,fetchApi}=require('./helpers/harness');
const accounts=require('../auth/accountStore');
const {signToken}=require('../auth/tokens');
const create=async(role,department,email)=>accounts.createAccount({role,department,email:email+'@company.com',name:email,tier:'L2',password:'TestOnly!12345',active:true,must_change_password:false});
test.before(startTestServer);test.after(stopTestServer);

test('department dashboard and queue scope cannot be overridden by a query',async()=>{
 const manager=await create('department_manager','Finance','scope-finance');
 const agent=await create('support_executive','Finance','scope-agent');
 const {app}=await startTestServer();
 await app.get('pilotStore').transaction(data=>{data.tickets.push({id:'fin',department:'Finance',priority:'high',required_tier:'L2',status:'open',assigned_to:agent.id},{id:'hr',department:'HR',status:'open'});});
 const token=signToken(manager);
 const dashboard=await fetchApi('/api/pilot/dashboard?department=HR',{token});
 assert.equal(dashboard.status,200);assert.equal(dashboard.data.open,1);
 assert.deepEqual(dashboard.data.departments.map(d=>d.department),['Finance']);
 assert.ok(dashboard.data.departments[0].staff.some(a=>a.id===agent.id));
 const queue=await fetchApi('/api/tickets?department=HR',{token});
 assert.equal(queue.status,200);assert.deepEqual(queue.data.tickets.map(t=>t.id),['fin']);
 const foreign=await fetchApi('/api/tickets/hr',{token});assert.equal(foreign.status,403);
 const employee=await create('employee','Finance','scope-employee');
 assert.equal((await fetchApi('/api/pilot/dashboard',{token:signToken(employee)})).status,403);
});
