const accounts=require('../auth/accountStore');
const {fail,staff}=require('../services/pilotAccess');
function installManager(router,{store,wrap,commit},io) {
  const scope=(user,department)=>user.role==='main_manager'||department===user.department;
  const guard=req=>{if(!staff(req.user))fail(403,'Manager access required');if(req.query.department&&req.query.department!=='All'&&!scope(req.user,req.query.department))fail(403,'Department access denied');if(req.query.department==='All'&&req.user.role!=='main_manager')fail(403,'Organization access required');};
  const leaves=user=>(store.data.workplace.actions||[]).filter(a=>a.type==='hr.apply_leave'&&scope(user,a.department));
  router.patch('/manager/staff/:id',wrap(async(req,res)=>{
    guard(req);const account=accounts.findById(req.params.id);
    if(!account||account.role!=='support_executive'||!scope(req.user,account.department))fail(403,'Staff access denied');
    const updates={};
    for(const [field,values] of Object.entries({tier:['L1','L2','L3'],status:['online','away','busy','offline'],work_mode:['office','remote_wfh']})){
      if(req.body[field]!==undefined){if(!values.includes(req.body[field]))fail(400,'Invalid '+field);updates[field]=req.body[field];}
    }
    const updated=await accounts.updateAccount(account.id,updates);res.json({staff:accounts.toPublic(updated)});
  }));
  router.patch('/manager/queue/:id/assign',wrap(async(req,res)=>{
    guard(req);
    const output=await commit(req,data=>{
      const ticket=data.tickets.find(t=>t.id===req.params.id),agent=accounts.findById(req.body.agentId);
      if(!ticket||!scope(req.user,ticket.department))fail(403,'Ticket access denied');
      if(!agent||!agent.active||agent.role!=='support_executive'||agent.department!==ticket.department)fail(403,'Assignee access denied');
      if(ticket.version!==req.body.version)fail(409,'Ticket changed');
      if(ticket.status==='resolved'||ticket.is_emergency)fail(409,'Ticket cannot be reassigned');
      const previous_assignee=ticket.assigned_to;
      ticket.assigned_to=agent.id;ticket.status='acknowledged';ticket.version++;
      return {ticket:{id:ticket.id,assigned_to:agent.id,status:ticket.status,version:ticket.version},previous_assignee,department:ticket.department};
    });
    if(!output.replayed){for(const target of [output.previous_assignee,output.ticket.assigned_to].filter(Boolean))io.to(`employee:${target}`).emit('dashboard:invalidate',{ticketId:output.ticket.id});io.to(`department:${output.department}`).emit('dashboard:invalidate',{ticketId:output.ticket.id});}
    res.json(output);
  }));
  router.get('/manager/calendar',wrap(async(req,res)=>{
    guard(req);
    const month=req.query.month||new Date().toISOString().slice(0,7);
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail(400,'Invalid month');
    const [year,m]=month.split('-').map(Number),daysInMonth=new Date(year,m,0).getDate();
    const w=store.data.workplace,holidays=(w.holidays||[]).filter(h=>!h.department||scope(req.user,h.department));
    const days=Array.from({length:daysInMonth},(_,i)=>{
      const date=`${month}-${String(i+1).padStart(2,'0')}`,holiday=holidays.find(h=>h.date===date)||null;
      const onLeave=leaves(req.user).filter(a=>['pending','approved'].includes(a.status)&&a.values.startDate<=date&&a.values.endDate>=date);
      const attendance=(w.attendance||[]).filter(a=>a.day===date&&scope(req.user,a.department));
      return {date,dayNumber:i+1,holiday,onLeave,attendance,attendanceStatus:holiday?'holiday':onLeave.length?'leave':'normal'};
    });res.json({month,daysInMonth,days});
  }));
  router.get('/manager/workload',wrap(async(req,res)=>{
    guard(req);
    res.json({staff:accounts.listAccounts().filter(a=>a.role==='support_executive'&&scope(req.user,a.department)).map(a=>({id:a.id,name:a.name,department:a.department,open:store.data.tickets.filter(t=>t.assigned_to===a.id&&t.status!=='resolved').length}))});
  }));
  router.get('/employees/:id/performance',wrap(async(req,res)=>{
    const a=accounts.findById(req.params.id);if(!a)fail(404,'Employee not found');
    if(req.user.id!==a.id&&!(staff(req.user)&&scope(req.user,a.department)))fail(403,'Profile access denied');
    const tickets=store.data.tickets.filter(t=>t.assigned_to===a.id);
    res.json({employee_id:a.id,tier:a.tier||'L1',resolved:tickets.filter(t=>t.status==='resolved').length,open:tickets.filter(t=>t.status!=='resolved').length});
  }));
}
module.exports={installManager};
