const accounts = require('../auth/accountStore');
const { fail, staff } = require('../services/pilotAccess');
const { EMERGENCY_REPLY } = require('../services/emergency');

// All mutable safety records share the pilot transaction and persistence boundary.
function installSafety(router, { store, wrap, commit, id }, io) {
  const init = data => {
    const w = data.workplace;
    for (const key of ['swipes', 'sosAudit', 'cardAudit']) w[key] ||= [];
    w.cards ||= {};
    return w;
  };
  const security = user => user.role === 'main_manager' || staff(user) && ['Facilities', 'Cybersecurity'].includes(user.department);
  const scope = (user, account) => user.id === account.id || user.role === 'main_manager' || staff(user) && user.department === account.department;
  const attendance = (employeeId, date) => {
    const swipes = (store.data.workplace.swipes || []).filter(s => s.employee_id === employeeId && s.timestamp.startsWith(date)).sort((a,b) => a.timestamp.localeCompare(b.timestamp));
    const first = swipes.find(s => s.direction === 'in')?.timestamp || null;
    const last = swipes.filter(s => s.direction === 'out').at(-1)?.timestamp || null;
    const hours = first && last ? Math.max(0, (Date.parse(last)-Date.parse(first))/3600000) : 0;
    return {employee_id:employeeId,date,status:first?'present':'absent',first_swipe_in:first,last_swipe_out:last,total_hours:hours,swipes};
  };
  const history = employeeId => Array.from({length:7},(_,i)=>attendance(employeeId,new Date(Date.now()-i*86400000).toISOString().slice(0,10)));
  router.post('/corporate/swipes/simulate', wrap(async(req,res)=>{
    if(process.env.NODE_ENV === 'production') fail(403,'Swipe simulation is disabled in production');
    const output = await commit(req,data=>{
      const w=init(data), cardId=req.body.card_id || `badge-${req.user.id}`;
      const card=w.cards[cardId];
      if(card && card.employee_id!==req.user.id) fail(403,'Card access denied');
      if(card?.status==='deactivated') fail(403,'card_deactivated');
      if(!['in','out'].includes(req.body.direction || 'in')) fail(400,'Invalid direction');
      const timestamp=req.body.timestamp ? Date.parse(req.body.timestamp) : Date.now();
      if(!Number.isFinite(timestamp)) fail(400,'Invalid timestamp');
      w.cards[cardId] ||= {employee_id:req.user.id,status:'active'};
      const event={id:id(),employee_id:req.user.id,card_id:cardId,direction:req.body.direction||'in',timestamp:new Date(timestamp).toISOString(),door_id:String(req.body.door_id||'main')};
      w.swipes.push(event);return {event};
    });res.status(201).json(output);
  }));
  router.get('/corporate/attendance/my',wrap(async(req,res)=>{const records=history(req.user.id);res.json({dataClassification:'SENSITIVE',employee_id:req.user.id,presence_status:req.account.status||'online',today:records[0],records});}));
  router.get('/corporate/attendance/team',wrap(async(req,res)=>{
    if(!staff(req.user))fail(403,'Manager access required');
    const team=accounts.listAccounts().filter(a=>scope(req.user,a)).map(a=>({...attendance(a.id,new Date().toISOString().slice(0,10)),name:a.name,department:a.department,presence_status:a.status||'online'}));
    res.json({team});
  }));
  router.get('/corporate/attendance/:employeeId',wrap(async(req,res)=>{
    const account=accounts.findById(req.params.employeeId);if(!account)fail(404,'Employee not found');
    if(!scope(req.user,account))fail(403,'Attendance access denied');
    res.json({employee_id:account.id,presence_status:account.status||'online',records:history(account.id)});
  }));
  router.post('/corporate/emergency/sos',wrap(async(req,res)=>{
    if(!String(req.body.location||'').trim())fail(400,'Location is required');
    const output=await commit(req,data=>{
      const w=init(data),ticketId=id();
      const alert={id:id(),employee_id:req.user.id,department:req.user.department,location:String(req.body.location).slice(0,500),priority:'urgent',ticket_id:ticketId,created_at:new Date().toISOString()};
      data.tickets.push({id:ticketId,version:1,user_id:req.user.id,department:'Facilities',title:'Emergency SOS',priority:'critical',priority_reason:'Immediate safety assistance required',status:'open',resolution_type:'human_required',is_emergency:true,assigned_to:null,created_at:Date.now(),transcript:[],timeline:[]});
      const notified_channels=['security:alerts','department:Facilities',`manager:dept:${req.user.department}`];
      w.sosAudit.push({id:id(),action:'EMERGENCY_SOS_TRIGGERED',dataClassification:'RESTRICTED',timestamp:alert.created_at,department:req.user.department,alert,ticket_id:ticketId,notified_channels});
      return {alert,notified_channels,broadcast_to_all:false,message:EMERGENCY_REPLY};
    });
    if(!output.replayed)for(const channel of output.notified_channels)io.to(channel).emit('emergency:sos:alert',{alert:output.alert});
    res.status(201).json(output);
  }));
  router.get('/corporate/emergency/sos/audit',wrap(async(req,res)=>{
    if(!security(req.user))fail(403,'Security manager access required');
    res.json({audit_log:[...(store.data.workplace.sosAudit||[])].reverse()});
  }));
  router.post('/corporate/id-cards/report-lost',wrap(async(req,res)=>{
    const employeeId=req.body.employee_id||req.user.id;
    if(employeeId!==req.user.id&&!security(req.user))fail(403,'Card access denied');
    if(!accounts.findById(employeeId))fail(404,'Employee not found');
    const output=await commit(req,data=>{
      const w=init(data),cardId=req.body.card_id||`badge-${employeeId}`,card=w.cards[cardId];
      if(!security(req.user) && ((card && card.employee_id!==employeeId)||(!card && cardId!==`badge-${employeeId}`)))fail(403,'Card access denied');
      w.cards[cardId]={employee_id:employeeId,status:'deactivated'};
      const ticketId=id(),incidentId=id();
      data.tickets.push({id:ticketId,version:1,user_id:employeeId,department:'Facilities',title:'Lost ID: deactivate and replace badge',priority:'high',priority_reason:'Lost access credential',status:'open',resolution_type:'human_required',assigned_to:null,created_at:Date.now(),transcript:[],timeline:[]});
      w.cardAudit.push({id:id(),action:'ID_CARD_DEACTIVATED',employee_id:employeeId,card_id:cardId,performed_by:req.user.id,timestamp:new Date().toISOString()});
      return {card_id:cardId,card_status:'deactivated',security_incident_id:incidentId,replacement_ticket_id:ticketId};
    });if(!output.replayed)io.to('security:alerts').to('department:Facilities').emit('security:badge:deactivated',output);res.status(201).json(output);
  }));
  router.get('/corporate/id-cards/audit',wrap(async(req,res)=>{if(!security(req.user))fail(403,'Security manager access required');res.json({audit_log:store.data.workplace.cardAudit||[]});}));
}
module.exports={installSafety};
