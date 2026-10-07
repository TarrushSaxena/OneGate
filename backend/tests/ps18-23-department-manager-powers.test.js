const test=require('node:test');
const assert=require('node:assert/strict');
const {startTestServer,stopTestServer,fetchApi}=require('./helpers/harness');
const accounts=require('../auth/accountStore');
const {signToken}=require('../auth/tokens');
const create=async(role,department,email)=>accounts.createAccount({role,department,email:email+'@company.com',name:email,tier:'L2',password:'TestOnly!12345',active:true,must_change_password:false});
test.before(startTestServer);test.after(stopTestServer);

test('manager provisions scoped accounts, reviews attendance and publishes department notices',async()=>{
 const manager=await create('department_manager','IT','powers-manager');
 const foreign=await create('department_manager','HR','powers-foreign');
 const employee=await create('employee','IT','powers-employee');
 const token=signToken(manager);
 const provision=await fetchApi('/api/admin/accounts',{method:'POST',token,body:{name:'New specialist',email:'powers-new@company.com',role:'support_executive',department:'HR',tier:'L2'}});
 assert.equal(provision.status,201);assert.equal(provision.data.account.department,'IT');assert.equal(provision.data.account.tier,'L2');assert.equal(provision.data.account.password,undefined);
 const escalation=await fetchApi('/api/admin/accounts',{method:'POST',token,body:{name:'Director',email:'powers-director@company.com',role:'main_manager'}});assert.equal(escalation.status,403);
 const att=await fetchApi('/api/workplace/attendance',{method:'POST',token:signToken(employee),body:{note:'Office'}});assert.equal(att.status,200);
 const reviewPath=`/api/workplace/attendance/${att.data.record.id}/review`;
 assert.equal((await fetchApi(reviewPath,{method:'POST',token:signToken(foreign),body:{version:1,status:'present'}})).status,403);
 const review=await fetchApi(reviewPath,{method:'POST',token,body:{version:1,status:'present'}});assert.equal(review.status,200);assert.equal(review.data.record.status,'present');
 const notice=await fetchApi('/api/workplace/records/announcements',{method:'POST',token,body:{title:'Maintenance',description:'Scheduled maintenance',critical:true}});assert.equal(notice.status,200);
 const other=await fetchApi('/api/workplace',{token:signToken(foreign)});assert.equal(other.data.modules.announcements.length,0);
 const own=await fetchApi('/api/workplace',{token:signToken(employee)});assert.equal(own.data.modules.announcements.length,1);
 assert.equal((await fetchApi('/api/auth/signup',{method:'POST',body:{role:'main_manager',email:'powers-signup@company.com'}})).status,403);
});

test('manager updates and reassigns only staff and tickets within their department',async()=>{
 const manager=accounts.findByEmail('powers-manager@company.com'),foreign=accounts.findByEmail('powers-foreign@company.com'),agent=accounts.findByEmail('powers-new@company.com');
 const token=signToken(manager),path=`/api/manager/staff/${agent.id}`;
 assert.equal((await fetchApi(path,{method:'PATCH',token:signToken(foreign),body:{tier:'L1'}})).status,403);
 const update=await fetchApi(path,{method:'PATCH',token,body:{tier:'L3',status:'busy',work_mode:'remote_wfh'}});
 assert.equal(update.status,200);assert.equal(update.data.staff.tier,'L3');assert.equal(update.data.staff.status,'busy');
 const {app}=await startTestServer();await app.get('pilotStore').transaction(d=>d.tickets.push({id:'manager-assign',version:1,department:'IT',status:'open',assigned_to:null}));
 const assignment='/api/manager/queue/manager-assign/assign';
 assert.equal((await fetchApi(assignment,{method:'PATCH',token:signToken(foreign),body:{version:1,agentId:agent.id}})).status,403);
 const assigned=await fetchApi(assignment,{method:'PATCH',token,body:{version:1,agentId:agent.id}});assert.equal(assigned.status,200);assert.equal(assigned.data.ticket.assigned_to,agent.id);
 assert.equal((await fetchApi(assignment,{method:'PATCH',token,body:{version:1,agentId:agent.id}})).status,409);
});
