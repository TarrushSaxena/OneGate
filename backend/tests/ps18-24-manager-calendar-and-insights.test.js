const test=require('node:test');
const assert=require('node:assert/strict');
const {startTestServer,stopTestServer,fetchApi}=require('./helpers/harness');
const accounts=require('../auth/accountStore');
const {signToken}=require('../auth/tokens');
const create=async(role,department,email)=>accounts.createAccount({role,department,email:email+'@company.com',name:email,tier:'L2',password:'TestOnly!12345',active:true,must_change_password:false});
test.before(startTestServer);test.after(stopTestServer);

test('calendar uses published holidays and persisted leave, with cross-department access denied',async()=>{
 const manager=await create('department_manager','IT','calendar-manager');
 const foreign=await create('department_manager','HR','calendar-foreign');
 const employee=await create('employee','IT','calendar-employee');
 const token=signToken(manager),date=new Date(Date.now()+30*86400000).toISOString().slice(0,10),month=date.slice(0,7);
 const holiday=await fetchApi('/api/workplace/records/holidays',{method:'POST',token,body:{title:'Company holiday',date}});assert.equal(holiday.status,200);
 const leave=await fetchApi('/api/workplace/actions/hr.apply_leave',{method:'POST',token:signToken(employee),body:{leaveType:'pto',startDate:date,endDate:date,reason:'Family event'}});assert.equal(leave.status,200);
 const path=`/api/workplace/actions/${leave.data.action.id}`;
 assert.equal((await fetchApi(path,{method:'PATCH',token:signToken(foreign),body:{decision:'approved'}})).status,403);
 const approved=await fetchApi(path,{method:'PATCH',token,body:{decision:'approved'}});assert.equal(approved.status,200);
 const cal=await fetchApi('/api/manager/calendar?month='+month,{token});assert.equal(cal.status,200);
 const day=cal.data.days.find(d=>d.date===date);assert.equal(day.holiday.title,'Company holiday');assert.equal(day.onLeave[0].status,'approved');
 assert.equal(cal.data.days.length,cal.data.daysInMonth);
 assert.equal((await fetchApi('/api/manager/calendar?department=All',{token})).status,403);
 assert.equal((await fetchApi('/api/manager/calendar',{token:signToken(employee)})).status,403);
 const foreignCal=await fetchApi('/api/manager/calendar?month='+month,{token:signToken(foreign)});assert.equal(foreignCal.data.days.find(d=>d.date===date).onLeave.length,0);
 const load=await fetchApi('/api/manager/workload',{token});assert.equal(load.status,200);assert.ok(Array.isArray(load.data.staff));
});
