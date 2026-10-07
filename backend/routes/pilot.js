const express = require('express');
const crypto = require('crypto');
const { PilotStore } = require('../services/pilotStore');
const { canRead, fail, staff } = require('../services/pilotAccess');
const accounts = require('../auth/accountStore');
const { orchestrate, redactPII } = require('../services/orchestrator');
const { assignTicket } = require('../services/assignment');
const { computeETA, getSLAHours, formatETAMessage, levelLabel } = require('../services/priority');
const { getAction, matchActions, publicDefinition, definitions: actionDefinitions } = require('../services/actionRegistry');
const audit = require('../services/audit');
const { verifyPassword } = require('../auth/passwords');
const { assertProfessionalStaffText } = require('../services/contentSafety');
const QRCode = require('qrcode');

function installPilot(app, io, runtime) {
  const store = new PilotStore();
  const ready = store.init();
  app.set('pilotStore', store);
  const router = express.Router();
  let callTimer;
  const id = () => crypto.randomUUID();
  const sync = () => {
    runtime.tickets = store.data.tickets;
    runtime.conversations = store.data.conversations;
    for (const agent of runtime.employees) agent.current_load = runtime.tickets.filter(t => t.assigned_to === agent.id && !['resolved','ai_attempted'].includes(t.status)).length;
  };
  ready.then(sync).catch(error => console.error('[Pilot storage]', error.message));
  const wrap = fn => async (req, res, next) => { try { await ready; await store.refresh(); sync(); await fn(req, res); } catch (e) { if (!e.status) console.error('[Pilot request]', req.method, req.path, e.stack); res.status(e.status || 500).json({ error: e.status ? e.message : 'Unable to complete request', ...(e.payload||{}) }); } };
  const clean = value => redactPII(String(value || '')).text;
  const staffText = value => assertProfessionalStaffText(clean(value));
  const actionAttempts = new Map(), verifiedActions = new Map();
  const fieldError = errors => { const error=new Error('Check the highlighted fields');error.status=400;error.payload={code:'validation_failed',fieldErrors:errors};throw error; };
  const rateLimitAction = userId => {const now=Date.now(),attempts=(actionAttempts.get(userId)||[]).filter(time=>now-time<60000);if(attempts.length>=8){const error=new Error('Too many action submissions. Wait a minute and try again.');error.status=429;throw error;}attempts.push(now);actionAttempts.set(userId,attempts);};
  const workflowApprover = user => accounts.listAccounts().find(a=>a.active&&a.role==='department_manager'&&a.department===user.department)
    || accounts.listAccounts().find(a=>a.active&&a.role==='main_manager') || null;
  const workflowView = (record, user) => ({...record, can_decide:record.status==='pending'&&(user.role==='main_manager'||user.id===record.approver_id)});
  const workflowText = (type, values) => {
    if(type==='hr.apply_leave')return `${values.leaveType.replaceAll('_',' ')} · ${values.startDate} to ${values.endDate}`;
    if(type==='finance.submit_expense_claim')return `${values.category} · ₹${Number(values.amount).toLocaleString('en-IN')} · ${values.expenseDate}`;
    if(type==='it.report_lost_device')return `${values.device} · last seen ${values.lastSeen}`;
    if(type==='facilities.report_lost_id')return `ID card · last seen ${values.lastSeen}`;
    return getAction(type)?.label||type;
  };
  const conversationKey=(user,value)=>{if(!value)return user.id;if(!/^[a-zA-Z0-9-]{1,80}$/.test(String(value)))fail(400,'Invalid conversation');return `${user.id}:${value}`;};
  const safeTicket = (t, user) => {
    const agent = accounts.findById(t.assigned_to);
    const result = {
      id: t.id, reference: t.reference || t.id, version: t.version, user_id: t.user_id,
      conversation_id: t.conversation_id, title: t.title, department: t.department,
      employee_name:accounts.findById(t.user_id)?.name||'Employee', employee_department:accounts.findById(t.user_id)?.department||null,
      priority: t.priority, priority_reason: t.priority_reason, status: t.status,
      resolution_type: t.resolution_type, assigned_to: t.assigned_to,
      assigned_name: agent?.name || null, assigned_tier: agent ? levelLabel(agent.role==='department_manager'?'manager':agent.tier || 'L1') : null,
      assigned_presence: agent ? (runtime.employees.find(e=>e.id===agent.id)?.status || 'offline') : null,
      assigned_connected: agent ? !!io.sockets.adapter.rooms.get(`employee:${agent.id}`)?.size : false,
      created_at: t.created_at, resolved_at: t.resolved_at, resolution_summary: t.resolution_summary,
      eta_low_min: t.eta_low_min, eta_high_min: t.eta_high_min,
      eta_clock: t.eta_clock, eta_text: t.status === 'waiting_on_user' ? 'Waiting for your reply. Reply target paused.' : t.status === 'resolved' ? 'Resolved' : t.eta_text,
      eta_updated_at: t.eta_updated_at, queue_position: t.queue_position,
      reply_target_at:t.reply_target_at || (t.eta_updated_at&&t.eta_high_min?t.eta_updated_at+t.eta_high_min*60000:null),
      awaiting_staff_reply:t.awaiting_staff_reply ?? !t.first_reply_at,
      escalation_destination:agent?.role==='department_manager'?'organization leadership':(agent?.tier==='L3'||t.required_tier==='L3'||t.required_tier==='manager')?'the department lead':'a senior specialist',
      needs_director_review:!!t.needs_director_review,
      sla_deadline: t.sla_deadline, transcript: t.transcript || [], warm_summary: t.warm_summary,
      ai_attempt: t.ai_attempt, timeline: t.timeline || [],
      routing_explanation: t.routing_explanation || 'Matched to the team responsible for this request',
      allowed_actions: user.role === 'employee' ? (t.status === 'resolved' ? ['reopen','feedback'] : ['reply','priority']) : (t.status === 'resolved' ? [] : ['reply','waiting_on_user','resolve','escalate','dismiss']),
    };
    return result;
  };
  const ticketFor = (data, req) => {
    const t = data.tickets.find(t => t.id === req.params.id);
    if (!t) fail(404, 'Ticket not found');
    if (!canRead(req.user, t)) fail(403, 'Ticket access denied');
    return t;
  };
  const event = (data, type, ticket, content) => {
    const e = { id: id(), type, ticketId: ticket?.id, department: ticket?.department, version: ticket?.version || 1, content, timestamp: new Date().toISOString() };
    data.events.push(e);
    return e;
  };
  const message = (data, t, role, content, extra = {}) => {
    const m = { id: id(), role, content, ticketId: t?.id, timestamp: new Date().toISOString(), ...extra };
    const key = t.conversation_id || t.user_id;
    (data.conversations[key] ||= []).push(m);
    (t.transcript ||= []).push(m);
    return m;
  };
  const publish = (t, e, m) => {
    sync();
    const owner = accounts.findById(t.user_id) || { id: t.user_id, role: 'employee' };
    io.to(`user:${t.user_id}`).emit('ticket:changed', { eventId: e.id, ticket: safeTicket(t, owner) });
    if (m) io.to(`user:${t.user_id}`).emit('message', m);
    const assignedAccount = accounts.findById(t.assigned_to);
    if (assignedAccount) io.to(`employee:${t.assigned_to}`).emit('ticket:changed', { eventId: e.id, ticket: safeTicket(t, assignedAccount) });
    io.to(`department:${t.department}`).to('director').emit('dashboard:invalidate', { eventId: e.id, version: t.version });
  };
  const eta = t => {
    const eligible = runtime.employees.filter(e => e.department === t.department && e.status === 'online');
    const value = computeETA(runtime.tickets.filter(x => x.department === t.department && x.status !== 'resolved').length, eligible.length, t.priority);
    t.eta_low_min = value.etaLowMin; t.eta_high_min = value.etaHighMin;
    t.eta_text = formatETAMessage(value.etaLowMin, value.etaHighMin);
    t.eta_updated_at = Date.now();t.queue_position = value.queuePosition;
    if(t.awaiting_staff_reply!==false)t.reply_target_at=t.eta_updated_at+value.etaHighMin*60000;
    t.eta_clock = t.eta_text.split('by ')[1] || null;
  };
  const assign = (t, data) => {
    t.awaiting_staff_reply=true;t.reply_target_at=null;t.needs_director_review=false;
    if(t.required_tier==='manager'){
      t.assigned_to=accounts.listAccounts().find(a=>a.active&&a.role==='department_manager'&&a.department===t.department)?.id||null;
      eta(t);return;
    }
    const eligible = runtime.employees.map(e => ({...e,current_load:data.tickets.filter(x=>x.id!==t.id&&x.assigned_to===e.id&&x.status!=='resolved').length})).filter(e => e.status === 'online' && e.current_load < 10 && accounts.findById(e.id)?.active);
    const result = assignTicket(t, eligible);
    t.assigned_to = result.assigned ? result.assignedTo : null;
    if (t.assigned_to) t.assignment = result;
    eta(t);
  };
  const requestKey = req => {
    const key = req.get('Idempotency-Key');
    // Browser clients provide this header. Older clients and presentation
    // tooling may not, so isolate those writes instead of rejecting chat.
    if (key && key.length > 128) fail(400, 'Invalid Idempotency-Key');
    return `${req.user.id}:${req.method}:${req.path}:${key || `server-${id()}`}`;
  };
  const commit = async (req, fn) => {
    const key = requestKey(req), fingerprint = crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
    return store.transaction(async data => {
      const previous = data.idempotency[key];
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail(409, 'Idempotency key was already used for another request');
        return { ...previous.result, replayed: true };
      }
      const result = await fn(data);
      data.idempotency[key] = { fingerprint, result };
      return result;
    });
  };

  router.get('/health', wrap(async (_, res) => res.json({ status: 'ok', storage: store.pool ? 'postgresql' : store.memory ? 'test-memory' : 'development-file', production_ready: false, release_gate: 'Full pilot acceptance remains incomplete' })));
  router.get('/conversations', wrap(async (req, res) => res.json(Object.entries(store.data.conversations).filter(([key, msgs]) => key === req.user.id || msgs.some(m => m.owner_id === req.user.id)).map(([key, msgs]) => ({ id: key, count: msgs.length, updated_at: msgs.at(-1)?.timestamp })))));
  router.get('/chat/conversation/:userId', wrap(async (req, res) => {
    if (req.params.userId !== req.user.id) fail(403, 'Conversation access denied');
    res.json({ messages: store.data.conversations[conversationKey(req.user,req.query.conversationId)] || [] });
  }));
  router.get('/chat/support-status',wrap(async(req,res)=>{
    const departments=[...new Set(['IT','HR','Finance','Facilities',...accounts.listAccounts().filter(a=>a.active&&a.role==='support_executive').map(a=>a.department)])];
    res.json({departments:departments.map(department=>({department,available:runtime.employees.filter(e=>e.department===department&&e.status==='online'&&e.current_load<10&&accounts.findById(e.id)?.active).length}))});
  }));
  router.get('/workplace/actions/catalog',wrap(async(req,res)=>{
    const approver=workflowApprover(req.user);
    res.json({actions:actionDefinitions.map(value=>({...publicDefinition(value),approver:approver?{id:approver.id,name:approver.name,role:'Department manager'}:{id:null,name:'Organization leadership',role:'Manager'}}))});
  }));
  router.post('/workplace/actions/verify-identity',wrap(async(req,res)=>{
    if(req.user.role!=='employee')fail(403,'Employee verification only');
    const definition=getAction(String(req.body.actionId||''));if(!definition?.requiresVerification)fail(400,'This action does not require verification');
    const account=accounts.findById(req.user.id),valid=await verifyPassword(String(req.body.password||''),account?.password_hash);if(!valid)fail(401,'Identity verification failed');
    const token=crypto.randomBytes(24).toString('hex');verifiedActions.set(`${req.user.id}:${definition.id}`,{token,expiresAt:Date.now()+5*60*1000});
    audit.recordAudit({actor:req.user,action:'intelligent_action_identity_verified',targetType:'action_definition',targetId:definition.id,metadata:{expiresInSeconds:300}});
    res.json({verified:true,verificationToken:token,expiresInSeconds:300});
  }));
  router.get('/workplace/actions',wrap(async(req,res)=>{
    const actions=store.data.workplace?.actions||[];
    const allowed=req.user.role==='employee'?actions.filter(a=>a.user_id===req.user.id):req.user.role==='main_manager'?actions:actions.filter(a=>a.department===req.user.department||a.approver_id===req.user.id);
    res.json({actions:allowed.sort((a,b)=>Date.parse(b.submitted_at)-Date.parse(a.submitted_at)).map(a=>workflowView(a,req.user))});
  }));
  router.post('/workplace/actions/:type',wrap(async(req,res)=>{
    if(req.user.role!=='employee')fail(403,'Employee action only');
    rateLimitAction(req.user.id);
    const type=req.params.type,definition=getAction(type);if(!definition)fail(404,'Action not found');
    if(definition.requiresVerification){const verification=verifiedActions.get(`${req.user.id}:${type}`);if(!verification||verification.expiresAt<Date.now()||verification.token!==req.body.verificationToken)fail(403,'Verify your identity before continuing');verifiedActions.delete(`${req.user.id}:${type}`);}
    const values={},errors={};
    for(const field of definition.fields){
      if(field.type==='file'){
        const file=req.body[field.name];if(field.required&&!file)errors[field.name]=`${field.label} is required`;
        else if(file){if(!file.name||!file.type||!file.data)errors[field.name]='Choose a valid receipt file';else if(Number(file.size)>field.maxBytes||String(file.data).length>1500000)errors[field.name]='Receipt must be 1 MB or smaller';else if(!String(field.accept).split(',').includes(file.type))errors[field.name]='Use a PNG, JPEG or PDF receipt';else values[field.name]={name:clean(file.name).slice(0,180),type:file.type,size:Number(file.size),data:file.data};}
        continue;
      }
      const value=String(req.body[field.name]??'').trim();if(field.required&&!value){errors[field.name]=`${field.label} is required`;continue;}if(!value)continue;
      if(field.maxLength&&value.length>field.maxLength){errors[field.name]=`${field.label} is too long`;continue;}
      if(field.type==='number'&&(!Number.isFinite(Number(value))||Number(value)<field.min||Number(value)>field.max)){errors[field.name]=`Enter an amount from ${field.min} to ${field.max}`;continue;}
      if(field.type==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(value)){errors[field.name]='Enter a valid date';continue;}
      if(field.type==='datetime-local'&&Number.isNaN(Date.parse(value))){errors[field.name]='Enter a valid date and time';continue;}
      if(field.type==='select'&&!field.options.some(option=>option.value===value)){errors[field.name]='Choose a valid option';continue;}
      values[field.name]=clean(value);
    }
    if(Object.keys(errors).length)fieldError(errors);
    const approver=workflowApprover(req.user),conversationId=String(req.body.conversationId||'');
    const output=await commit(req,async data=>{
      const w=data.workplace||=( {});w.actions||=[];
      const ticket=req.body.ticketId?data.tickets.find(t=>t.id===req.body.ticketId&&t.user_id===req.user.id):null;if(req.body.ticketId&&!ticket)fail(403,'Ticket access denied');
      if(type==='hr.apply_leave'){
        const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});if(values.startDate<today)fieldError({startDate:'Leave cannot begin in the past'});if(values.endDate<values.startDate)fieldError({endDate:'End date must be on or after the start date'});
        const start=Date.parse(`${values.startDate}T00:00:00Z`),end=Date.parse(`${values.endDate}T00:00:00Z`),days=Math.floor((end-start)/86400000)+1;values.days=days;
        const own=w.actions.filter(a=>a.user_id===req.user.id&&a.type==='hr.apply_leave'&&['pending','approved'].includes(a.status));if(own.some(a=>values.startDate<=a.values.endDate&&values.endDate>=a.values.startDate))fieldError({startDate:'These dates overlap another pending or approved leave request'});
        if(values.leaveType==='pto'){const used=own.reduce((sum,a)=>sum+Number(a.values.days||0),0),available=Math.max(0,18-used);if(days>available)fieldError({endDate:`Only ${available} PTO day${available===1?' is':'s are'} available`});}
      }
      const readOnly=definition.kind==='read_only';
      if(readOnly){const leaves=w.actions.filter(a=>a.user_id===req.user.id&&a.type==='hr.apply_leave'),used=leaves.filter(a=>a.status==='approved').reduce((s,a)=>s+Number(a.values.days||0),0),pending=leaves.filter(a=>a.status==='pending').reduce((s,a)=>s+Number(a.values.days||0),0);const balance={total:18,used,pending,available:Math.max(0,18-used-pending)};const key=ticket?.conversation_id||conversationKey(req.user,conversationId),m={id:id(),role:'system',owner_id:req.user.id,content:`Leave balance: ${balance.available} days available, ${balance.pending} pending, ${balance.used} used.`,timestamp:new Date().toISOString(),metadata:{type:'workflow_read_only',workflow:{id:`BAL-${Date.now().toString(36).toUpperCase()}`,type,label:definition.label,summary:`${balance.available} days available`,status:'complete',viewers:['You'],approver_name:'No approval needed',balance}}};(data.conversations[key]||=[]).push(m);if(ticket)(ticket.transcript||=[]).push(m);return {action:m.metadata.workflow,message:m};}
      const urgent=definition.kind==='incident';
      const record={id:`ACT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,version:1,type,label:definition.label,summary:workflowText(type,values),values,user_id:req.user.id,user_name:req.user.name,department:req.user.department,ticket_id:ticket?.id||null,status:urgent?'submitted':'pending',priority:urgent?'critical':'normal',owner_team:definition.owner,approver_id:urgent?null:approver?.id||null,approver_name:urgent?'Immediate security response':approver?.name||'Organization leadership',approver_role:urgent?'Security incident team':'Department manager',viewers:definition.viewers,submitted_at:new Date().toISOString(),decided_at:null,decision_notes:null};
      w.actions.push(record);
      const key=ticket?.conversation_id||conversationKey(req.user,conversationId);
      const m={id:id(),role:'system',owner_id:req.user.id,conversationId:key,ticketId:ticket?.id||null,content:urgent?`${definition.label} submitted as a critical incident. ${record.summary}. ${definition.owner} has been alerted immediately.`:`${definition.label} submitted. ${record.summary}. ${record.approver_name} will approve or decline it; ${definition.owner} can view it.`,timestamp:new Date().toISOString(),metadata:{type:'workflow_submission',workflow:record}};
      (data.conversations[key]||=[]).push(m);
      if(ticket)(ticket.transcript||=[]).push(m);
      return {action:record,message:m};
    });
    if(!output.replayed){audit.recordAudit({actor:req.user,action:'intelligent_action_submitted',targetType:'workflow_action',targetId:output.action.id,department:req.user.department,metadata:{type,status:output.action.status,priority:output.action.priority||'normal'}});io.to(`user:${req.user.id}`).emit('message',output.message);if(output.action.approver_id)io.to(`manager:${output.action.approver_id}`).emit('workplace:changed',{type:'workflow_action',id:output.action.id});io.to(`department:${req.user.department}`).to('director').emit('dashboard:invalidate',{type:'workflow_action',id:output.action.id});}
    res.json(output);
  }));
  router.patch('/workplace/actions/:id',wrap(async(req,res)=>{
    if(!['department_manager','main_manager'].includes(req.user.role))fail(403,'Manager action required');
    const decision=String(req.body.decision||'');if(!['approved','denied'].includes(decision))fail(400,'Decision must be approved or denied');
    const output=await commit(req,async data=>{
      const record=(data.workplace?.actions||[]).find(a=>a.id===req.params.id);if(!record)fail(404,'Action request not found');
      if(req.user.role!=='main_manager'&&record.department!==req.user.department&&record.approver_id!==req.user.id)fail(403,'Request belongs to another department');
      if(record.status!=='pending')fail(409,'Request was already decided');
      record.status=decision;record.decided_at=new Date().toISOString();record.decided_by=req.user.id;record.decided_by_name=req.user.name;record.decision_notes=clean(req.body.notes||'');record.version++;
      const conversation=Object.entries(data.conversations).find(([,messages])=>messages.some(m=>m.metadata?.workflow?.id===record.id));
      const m={id:id(),role:'system',owner_id:record.user_id,conversationId:conversation?.[0]||null,ticketId:record.ticket_id||null,content:`${record.label} ${decision} by ${req.user.name}.${record.decision_notes?` ${record.decision_notes}`:''}`,timestamp:new Date().toISOString(),metadata:{type:'workflow_decision',workflow:record}};
      if(conversation)conversation[1].push(m);
      if(record.ticket_id){const ticket=data.tickets.find(t=>t.id===record.ticket_id);if(ticket)(ticket.transcript||=[]).push(m);}
      return {action:record,message:m};
    });
    if(!output.replayed){audit.recordAudit({actor:req.user,action:`intelligent_action_${decision}`,targetType:'workflow_action',targetId:output.action.id,department:output.action.department,metadata:{type:output.action.type,employeeId:output.action.user_id}});io.to(`user:${output.action.user_id}`).emit('message',output.message);io.to(`user:${output.action.user_id}`).emit('workplace:changed',{type:'workflow_action',id:output.action.id});}
    res.json(output);
  }));
  // Presentation-only workplace data. This deliberately stays read-only so it
  // cannot be mistaken for an operational booking or catering system.
  router.get('/workplace/demo-schedule', wrap(async (req, res) => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const [year, month, day] = today.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    res.json({
      demo: true,
      date,
      timezone: 'Asia/Kolkata',
      cafeteria: [
        { id: 'demo-breakfast', time: '08:00–10:30', title: 'Breakfast counter', detail: 'Idli, poha, fruit and filter coffee', items: ['Steamed idli', 'Vegetable poha', 'Seasonal fruit', 'Filter coffee'], dietary_labels: ['Vegetarian', 'Vegan options'], status: 'Open for pre-order' },
        { id: 'demo-lunch', time: '12:15–14:30', title: 'Lunch service', detail: 'North Indian, South Indian and vegan counters', items: ['Dal tadka and jeera rice', 'Paneer tikka', 'Seasonal vegetable thali', 'Vegan millet bowl'], dietary_labels: ['Vegetarian', 'Vegan', 'Contains dairy options'], status: 'Seats available' },
      ],
      transport: [
        { time: '08:10', title: 'Metro shuttle', stop: 'Gate 2', detail: 'Tech Park via Central Metro', seats: '8 seats' },
        { time: '08:35', title: 'City shuttle', stop: 'Gate 2', detail: 'Indiranagar · Domlur', seats: '14 seats' },
        { time: '18:20', title: 'Return shuttle', stop: 'Main lobby', detail: 'Central Metro · City Loop', seats: '12 seats' },
      ],
    });
  }));
  router.post('/workplace/demo-meal-qr', wrap(async (req, res) => {
    const validMenuIds = new Set(['demo-breakfast', 'demo-lunch']);
    if (!validMenuIds.has(String(req.body.menuId || ''))) fail(404, 'Demo menu not found');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const [year, month, day] = today.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    const payload = `ONEGATE-DEMO-MEAL|${req.body.menuId}|${date}`;
    res.json({ demo: true, redeemable: false, date, label: 'Demo QR · not redeemable', qr: await QRCode.toDataURL(payload) });
  }));
  router.post('/chat/handoff',wrap(async(req,res)=>{
    if(req.user.role!=='employee')fail(403,'Employee chat only');
    const output=await commit(req,async data=>{
      const key=conversationKey(req.user,req.body.conversationId),history=data.conversations[key]||[],latest=[...history].reverse().find(m=>m.role==='user');
      if(!latest)fail(400,'Describe your request in chat first');
      if(req.body.messageId!==latest.id)fail(409,'Conversation changed. Review the latest message first');
      const allowed=new Set(['IT','HR','Finance','Facilities',...accounts.listAccounts().filter(a=>a.active&&a.role==='support_executive').map(a=>a.department)]);
      const existing=data.tickets.find(t=>t.user_id===req.user.id&&t.source_message_id===latest.id);
      if(existing)return {ticket:safeTicket(existing,req.user),existing:true};
      // A previously routed answer/attempt is linked, never duplicated by the CTA.
      const linked=data.tickets.find(t=>t.user_id===req.user.id&&t.transcript.some(m=>m.id===latest.id));
      if(linked)return {ticket:safeTicket(linked,req.user),existing:true};
      io.to(`user:${req.user.id}`).emit('chat:progress',{state:'routing',label:'Finding the right team with the routing model'});
      const routing=await require('../services/supportRouting').routeSupport(req.body.reason?`${latest.content}\nUnresolved need: ${clean(req.body.reason)}`:latest.content,allowed);
      io.to(`user:${req.user.id}`).emit('chat:progress',{state:'assigning',label:`Checking eligible specialists in ${routing.department}`});
      const index=history.indexOf(latest),t={id:id(),reference:`OG-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,version:1,source_message_id:latest.id,user_id:req.user.id,conversation_id:req.user.id,title:latest.content.slice(0,160),department:req.body.department,priority:'normal',priority_reason:'Employee requested specialist support',required_tier:'L1',resolution_type:'human_required',status:'open',assigned_to:null,created_at:Date.now(),transcript:history.slice(index).filter(m=>m.role!=='system'),timeline:[],sla_deadline:Date.now()+getSLAHours('normal')*3600000};
      t.conversation_id=key;t.department=routing.department;t.routing_model=routing.model;t.routing_fallback=routing.fallback;t.routing_explanation='The routing model matched your message to '+routing.department+'. Your conversation goes with the request.';
      if(req.body.reason){const reason=clean(String(req.body.reason).trim());if(reason.length>1000)fail(400,'Reason is too long');t.priority_reason='Employee requested help: '+reason;t.title=reason.slice(0,160);t.transcript.push({id:id(),role:'user',owner_id:req.user.id,content:'Specialist help requested: '+reason,timestamp:new Date().toISOString()});}
      assign(t,data);if(t.assigned_to)t.status='acknowledged';data.tickets.push(t);
      const m=message(data,t,'system',t.assigned_to?`Your request is assigned to ${accounts.findById(t.assigned_to).name}, ${levelLabel(accounts.findById(t.assigned_to).tier||'L1')}. ${t.eta_text}.`:`Your request is queued for ${t.department}. No eligible specialist is available yet. ${t.eta_text} is an estimate, not a confirmed appointment.`);
      const e=event(data,'ticket_created',t,m.content);t.timeline.push(e);return {ticket:safeTicket(t,req.user),message:m,event:e};
    });if(!output.replayed&&!output.existing)publish(store.data.tickets.find(t=>t.id===output.ticket.id),output.event,output.message);res.json(output);
  }));
  router.get('/tickets', wrap(async (req, res) => {
    const rows = store.data.tickets.filter(t => canRead(req.user,t) && (!req.query.status || t.status === req.query.status) && (!req.query.q || `${t.title} ${t.reference}`.toLowerCase().includes(req.query.q.toLowerCase()))).sort((a,b) => b.created_at-a.created_at);
    const page = Math.max(1, Number(req.query.page) || 1), size = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    res.json({ tickets: rows.slice((page-1)*size,page*size).map(t => safeTicket(t,req.user)), total: rows.length, page });
  }));
  router.get('/tickets/:id', wrap(async (req,res) => res.json({ ticket: safeTicket(ticketFor(store.data,req),req.user) })));
  router.post('/tickets/:id/assist', wrap(async (req,res) => {
    if(req.user.role==='employee') fail(403,'Specialist access required');
    const t=ticketFor(store.data,req), messages=t.transcript||[];
    const latest=[...messages].reverse().find(m=>m.role==='user');
    res.json({mode:'local-transcript-assistant',version:t.version,
      summary:`Request: ${clean(t.title)}\nTeam: ${t.department}\nStatus: ${t.status}\nPriority: ${t.priority}\nLatest detail: ${clean(latest?.content||'No employee message recorded')}\nResolution: ${clean(t.resolution_summary||'Not recorded')}`,
      draft:`Hi, I’m reviewing your request about “${clean(t.title)}”. Could you confirm the specific outcome you need and any relevant dates? I’ll check the details before confirming the next step.`,
      limitations:'Transcript-based helper; no connected generative AI or policy verification. Review the draft before sending.'});
  }));
  router.get('/employees/:id/inbox', wrap(async (req,res) => {
    if (req.params.id !== req.user.id && !staff(req.user)) fail(403,'Inbox access denied');
    const target = accounts.findById(req.params.id);
    if (!target || (req.user.role === 'department_manager' && target.department !== req.user.department)) fail(403,'Inbox access denied');
    res.json(store.data.tickets.filter(t => t.assigned_to === req.params.id && t.status !== 'resolved').map(t => safeTicket(t,req.user)));
  }));
  router.patch('/employees/:id/availability', wrap(async (req,res) => {
    if (req.params.id !== req.user.id || req.user.role !== 'support_executive') fail(403,'Presence access denied');
    if (!['online','away','busy','offline'].includes(req.body.status)) fail(400,'Invalid presence');
    await accounts.updateAccount(req.user.id,{status:req.body.status});
    const agent = runtime.employees.find(x=>x.id===req.user.id); if(agent) agent.status=req.body.status;
    if(req.body.status==='online'){
      const updates=await store.transaction(data=>{
        const changes=[],rank={critical:0,high:1,normal:2,low:3};
        for(const t of data.tickets.filter(t=>t.department===req.user.department&&!t.assigned_to&&t.status==='open'&&t.resolution_type==='human_required').sort((a,b)=>(rank[a.priority]-rank[b.priority])||a.created_at-b.created_at)){
          assign(t,data);if(!t.assigned_to)continue;t.status='acknowledged';t.version++;
          const m=message(data,t,'system',`${accounts.findById(t.assigned_to).name} is assigned to your request. Your earlier notes are included. ${t.eta_text}.`),e=event(data,'assigned',t,m.content);t.timeline.push(e);changes.push({ticketId:t.id,message:m,event:e});
        }return changes;
      });
      for(const update of updates)publish(store.data.tickets.find(t=>t.id===update.ticketId),update.event,update.message);
    }
    for(const t of store.data.tickets.filter(t=>t.assigned_to===req.user.id))io.to(`user:${t.user_id}`).emit('presence:changed',{ticketId:t.id});
    io.to(`department:${req.user.department}`).to('director').emit('dashboard:invalidate',{eventId:id()});
    res.json({status:req.body.status});
  }));

  router.post('/chat/message', wrap(async (req,res) => {
    if(req.user.role !== 'employee') fail(403,'Employee chat only');
    const raw = String(req.body.message || '').trim(); if(!raw || raw.length>10000) fail(400,'Enter a message of up to 10000 characters');
    // Check identity before submitting to any classification or model service.
    if(req.body.userId && req.body.userId !== req.user.id) fail(403,'Identity mismatch');
    io.to(`user:${req.user.id}`).emit('chat:progress',{state:req.body.ticketId?'delivering':'reviewing',label:req.body.ticketId?'Delivering your details to the request':'Reviewing your message and checking relevant guidance'});
    const result = await commit(req, async data => {
      const text = clean(raw), key=conversationKey(req.user,req.body.conversationId), history = data.conversations[key] ||= [];
      const userMessage = {id:id(),role:'user',content:text,owner_id:req.user.id,timestamp:new Date().toISOString()};
      history.push(userMessage);
      if(req.body.ticketId) {
        const t=data.tickets.find(t=>t.id===req.body.ticketId);
        if(!t || t.user_id!==req.user.id) fail(403,'Ticket access denied');
        if(t.status==='resolved') fail(409,'Reopen this ticket before replying');
        t.transcript.push({...userMessage,ticketId:t.id});
        if(t.status==='waiting_on_user')t.status='in_progress';
        t.awaiting_staff_reply=true;t.reply_target_at=null;eta(t);
        t.version++;
        const e=event(data,'employee_reply',t,text);t.timeline.push(e);
        return {ticket:safeTicket(t,req.user),message:null,userMessage,event:e};
      }
      const outcome = await orchestrate(text,history,req.user.id);
      io.to(`user:${req.user.id}`).emit('chat:progress',{state:'routing',department:outcome.department,label:['ticket','ai_attempted'].includes(outcome.action)?`Preparing the next step for ${outcome.department}`:'Preparing your answer'});
      let t=null;
      if(['ticket','ai_attempted'].includes(outcome.action)) {
        const cleanTitle = (rawText => {
          const firstLine = (rawText || '').split('\n')[0].replace(/^details\s+of\s+the\s+issue\s*[:\-]?\s*/i, '').trim();
          if (firstLine.length <= 110) return firstLine;
          const chunk = firstLine.slice(0, 110);
          const lastSpace = chunk.lastIndexOf(' ');
          return (lastSpace > 60 ? chunk.slice(0, lastSpace) : chunk) + '…';
        })(text);
        t={id:id(),reference:`OG-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,version:1,user_id:req.user.id,conversation_id:req.user.id,title:cleanTitle,department:outcome.department,priority:outcome.priority==='medium'?'normal':outcome.priority || 'normal',priority_reason:outcome.priority_reason || 'Standard support request',required_tier:['high','critical'].includes(outcome.priority)?'L2':'L1',resolution_type:outcome.action==='ai_attempted'?'ai_attempted':'human_required',status:outcome.action==='ai_attempted'?'ai_attempted':'open',assigned_to:null,created_at:Date.now(),transcript:[userMessage],timeline:[],sla_deadline:Date.now()+getSLAHours(outcome.priority)*3600000,ai_attempt:outcome.fix || null};
        if(t.status!=='ai_attempted') assign(t,data);
        if(t.assigned_to) t.status='acknowledged';
        t.conversation_id=key;data.tickets.push(t);
      }
      const m={id:id(),role:'assistant',owner_id:req.user.id,content:outcome.response,timestamp:new Date().toISOString(),ticket_id:t?.id,resolution_type:t?.resolution_type || 'answer',metadata:{department:outcome.department,kbArticle:outcome.kbArticle || null,type:outcome.type,intents:outcome.intents,suggestedActions:matchActions(outcome.kbArticle)}};
      // Replace optimistic assignment promises with actual assignment truth.
      if(t && t.resolution_type==='human_required') m.content=t.assigned_to?`Connecting you with ${accounts.findById(t.assigned_to)?.name || 'a specialist'}. ${t.eta_text}. Your notes go with the request.`:`Your request is queued for ${t.department}. No specialist is available yet. ${t.eta_text}.`;
      history.push(m); if(t) t.transcript.push(m);
      const e=event(data,t?'ticket_created':'answered',t,m.content); if(t)t.timeline.push(e);
      return {message:m,ticket:t?safeTicket(t,req.user):null,event:e,content_filter_applied:text!==raw};
    });
    if(!result.replayed && result.ticket) {
      const t=store.data.tickets.find(t=>t.id===result.ticket.id);publish(t,result.event,req.body.ticketId?result.userMessage:null);
    }
    res.json(result);
  }));

  router.post('/tickets/:id/:action', wrap(async (req,res) => {
    const action=req.params.action;
    if(!['reply','resolve','dismiss','reopen','escalate','waiting_on_user','priority','feedback','reroute'].includes(action)) fail(404,'Unknown ticket action');
    const output=await commit(req, async data=>{
      const t=ticketFor(data,req);
      if(req.body.version!==t.version) fail(409,'Ticket changed. Refresh before trying again');
      const employee=req.user.role==='employee';
      if(employee && !['reply','reopen','priority','feedback','reroute'].includes(action)) fail(403,'Staff action required');
      if(!employee && ['reopen','feedback','priority'].includes(action)) fail(403,'Employee action required');
      let m;
      if(action==='feedback') {
        if(t.status!=='resolved' || !Number.isInteger(req.body.rating) || req.body.rating<1 || req.body.rating>5) fail(400,'Rate a resolved ticket from 1 to 5');
        data.feedback=data.feedback.filter(f=>f.ticket_id!==t.id);data.feedback.push({ticket_id:t.id,user_id:req.user.id,rating:req.body.rating});t.csat=req.body.rating;
      } else if(action==='reopen') {
        if(t.status!=='resolved') fail(409,'Only resolved tickets can be reopened');
        t.status='open';t.resolved_at=null;t.resolution_summary=null;
        t.awaiting_staff_reply=true;t.reply_target_at=null;t.needs_director_review=false;
        const priorities=['low','normal','high','critical'];t.priority=priorities[Math.min(3,priorities.indexOf(t.priority)+1)];t.priority_reason='Reopened — moved to the front of the queue';t.sla_deadline=Date.now()+getSLAHours(t.priority)*3600000;
        const old=runtime.employees.find(e=>e.id===t.assigned_to && e.status==='online' && e.current_load<10);
        if(!old) assign(t,data);else eta(t);
        if(t.assigned_to)t.status='acknowledged';m=message(data,t,'system','Reopened. Your earlier notes are included. '+t.eta_text);
      } else {
        if(t.status==='resolved') fail(409,'Ticket is already resolved');
        if(action==='reroute') {
          const allowed=new Set(['IT','HR','Finance','Facilities',...accounts.listAccounts().filter(a=>a.active&&a.role==='support_executive').map(a=>a.department)]);
          if(!allowed.has(req.body.department)||req.body.department===t.department||!String(req.body.reason||'').trim())fail(400,'Choose a different support team and explain the correction');
          const correctionReason=employee?clean(req.body.reason):staffText(req.body.reason);
          const previousDepartment=t.department,previousAssignee=t.assigned_to;
          t.department=req.body.department;t.assigned_to=null;t.assignment=null;t.required_tier='L1';t.resolution_type='human_required';t.first_reply_at=null;t.sla_deadline=Date.now()+getSLAHours(t.priority)*3600000;
          t.routing_explanation=`Team corrected from ${previousDepartment} to ${t.department}. Earlier notes are preserved.`;
          assign(t,data);t.status=t.assigned_to?'acknowledged':'open';
          m=message(data,t,'system',`Team corrected: ${previousDepartment} → ${t.department}. ${correctionReason}. The old assignment was released. This is the same request; all earlier notes are included. ${t.eta_text}.`);
          t.routing_corrections ||= [];t.routing_corrections.push({from:previousDepartment,to:t.department,previous_assignee:previousAssignee,actor:req.user.id,reason:correctionReason,at:Date.now()});
        } else if(action==='reply') {
          const text=String(req.body.message||'').trim();if(!text)fail(400,'Enter a reply');
          m=message(data,t,employee?'user':'employee',employee?clean(text):staffText(text),employee?{}:{employeeName:req.user.name,employeeLevel:levelLabel(req.user.role==='department_manager'?'manager':req.user.tier||'L1'),employeeAvatar:req.user.avatar||'👤'});
          t.status='in_progress';
          if(employee){t.awaiting_staff_reply=true;t.reply_target_at=null;eta(t);}else{t.first_reply_at ||=Date.now();t.awaiting_staff_reply=false;t.reply_target_at=null;}
        } else if(action==='dismiss') {
          if(employee)fail(403,'Specialist action required');
          if(!['duplicate','withdrawn','no_action_needed'].includes(req.body.category)||!String(req.body.reason||'').trim())fail(400,'Choose a closure category and explain the reason');
          const dismissalReason=staffText(req.body.reason);
          t.status='resolved';t.resolved_at=Date.now();t.resolution_type='dismissed';t.closure_category=req.body.category;t.resolution_summary=dismissalReason;t.awaiting_staff_reply=false;t.reply_target_at=null;
          m=message(data,t,'system',`Closed without a fix (${req.body.category.replaceAll('_',' ')}). ${t.resolution_summary}. You can reopen this request if you still need help.`);
        } else if(action==='resolve') {
          if(!String(req.body.resolutionSummary||'').trim())fail(400,'Enter a resolution summary');
          const resolutionSummary=employee?clean(req.body.resolutionSummary):staffText(req.body.resolutionSummary);
          t.status='resolved';t.resolved_at=Date.now();t.resolution_summary=resolutionSummary;
          m=message(data,t,'system',`Marked resolved. ${t.resolution_summary}`,{isResolution:true});
        } else if(action==='waiting_on_user') {
          if(!String(req.body.message||'').trim())fail(400,'Specify the detail needed');
          const detailNeeded=staffText(req.body.message);
          t.status='waiting_on_user';m=message(data,t,'system',`${req.user.name} needs one more detail: ${detailNeeded}. Reply target is paused.`);
          t.awaiting_staff_reply=false;t.reply_target_at=null;
        } else if(action==='priority') {
          if(!['low','normal','high','critical'].includes(req.body.priority) || !String(req.body.reason||'').trim())fail(400,'Select a priority and give a reason');
          t.priority=req.body.priority;t.priority_reason=clean(req.body.reason);eta(t);m=message(data,t,'system',`Priority changed to ${t.priority}: ${t.priority_reason}`);
        } else if(action==='escalate') {
          if(!String(req.body.reason||'').trim())fail(400,'Enter the escalation reason');
          const escalationReason=staffText(req.body.reason);
          const levels=['L1','L2','L3','manager'];const current=accounts.findById(t.assigned_to);const index=levels.indexOf(current?.role==='department_manager'?'manager':current?.tier||t.required_tier);if(index===3)fail(409,'This request is already with the department lead');t.required_tier=levels[Math.min(3,index+1)];
          t.previous_assignee=t.assigned_to;
          t.assigned_to=null;assign(t,data);t.status=t.assigned_to?'acknowledged':'open';
          m=message(data,t,'system',`Escalated to ${levelLabel(t.required_tier)}. ${escalationReason}. Your notes went with the ticket. ${t.eta_text}`);
        }
      }
      t.version++;const e=event(data,action,t,m?.content||'Feedback saved');t.timeline.push(e);
      return {ticket:safeTicket(t,req.user),event:e,message:m};
    });
    if(!output.replayed){publish(store.data.tickets.find(t=>t.id===output.ticket.id),output.event,output.message);if(action==='escalate'){const old=store.data.tickets.find(t=>t.id===output.ticket.id).previous_assignee;if(old)io.to(`employee:${old}`).emit('dashboard:invalidate',{eventId:output.event.id});}if(action==='reroute'){
      const correction=store.data.tickets.find(t=>t.id===output.ticket.id).routing_corrections.at(-1);
      io.to(`department:${correction.from}`).to('director').emit('dashboard:invalidate',{eventId:output.event.id});
      if(correction.previous_assignee)io.to(`employee:${correction.previous_assignee}`).emit('dashboard:invalidate',{eventId:output.event.id});
    }}
    res.json(output);
  }));
  router.post('/tickets/:id/ai-attempt/:action',wrap(async(req,res)=>{
    const output=await commit(req,data=>{
      const t=ticketFor(data,req);if(req.user.role!=='employee')fail(403,'Employee action required');
      if(req.body.version!==t.version)fail(409,'Ticket changed. Refresh before trying again');
      if(t.status!=='ai_attempted')fail(409,'This attempt has already been handled');
      if(req.params.action==='confirm'){t.status='resolved';t.resolved_at=Date.now();t.resolution_summary='Resolved after the recommended self-service fix.';}
      else if(req.params.action==='escalate'){t.resolution_type='human_required';assign(t,data);t.status=t.assigned_to?'acknowledged':'open';}
      else fail(404,'Unknown attempt action');
      t.version++;const m=message(data,t,'system',t.status==='resolved'?t.resolution_summary:`Your attempted fix is included for the specialist. ${t.eta_text}`);const e=event(data,req.params.action,t,m.content);t.timeline.push(e);return {ticket:safeTicket(t,req.user),event:e,message:m};
    });if(!output.replayed)publish(store.data.tickets.find(t=>t.id===output.ticket.id),output.event,output.message);res.json(output);
  }));
  router.get('/pilot/dashboard',wrap(async(req,res)=>{
    if(!staff(req.user))fail(403,'Manager access required');
    const rows=store.data.tickets.filter(t=>req.user.role==='main_manager'||t.department===req.user.department);
    const departments=[...new Set(accounts.listAccounts().filter(a=>a.department!=='All').map(a=>a.department))];
    res.json({open:rows.filter(t=>t.status!=='resolved').length,resolved:rows.filter(t=>t.status==='resolved').length,csat:store.data.feedback.filter(f=>rows.some(t=>t.id===f.ticket_id)),departments:departments.filter(d=>req.user.role==='main_manager'||d===req.user.department).map(department=>({department,open:rows.filter(t=>t.department===department&&t.status!=='resolved').length,staff:runtime.employees.filter(e=>e.department===department).map(e=>({id:e.id,name:e.name,status:e.status,tier:levelLabel(e.tier||'L1'),load:e.current_load}))}))});
  }));
  router.post('/outages/:id/subscribe',wrap(async(req,res)=>{await commit(req,data=>{if(!runtime.outages.some(o=>o.id===req.params.id))fail(404,'Outage not found');data.subscriptions.push({outage_id:req.params.id,user_id:req.user.id});return {subscribed:true};});res.json({subscribed:true});}));
  router.get('/pilot/outages',wrap(async(req,res)=>res.json(runtime.outages.filter(o=>!o.department||o.department===req.user.department))));

  require('./workplacePilot').installWorkplace(router,{store,wrap,commit,id},io);
  // Durable deadline worker: catch up after restart; serial transactions prevent
  // repeated ticks or concurrent workers from escalating the same version twice.
  const sweepReplyTargets=async(now=Date.now())=>{
    await ready;
    await store.refresh();
    if(!store.data.tickets.some(t=>!['resolved','ai_attempted','waiting_on_user'].includes(t.status)&&(t.awaiting_staff_reply??!t.first_reply_at)!==false&&(t.reply_target_at||(t.eta_updated_at&&t.eta_high_min?t.eta_updated_at+t.eta_high_min*60000:Infinity))<=now))return [];
    const updates=await store.transaction(data=>{
      const changes=[];
      for(const t of data.tickets){
        if(['resolved','ai_attempted','waiting_on_user'].includes(t.status)||(t.awaiting_staff_reply??!t.first_reply_at)===false)continue;
        const deadline=t.reply_target_at||(t.eta_updated_at&&t.eta_high_min?t.eta_updated_at+t.eta_high_min*60000:null);
        if(!deadline||deadline>now||t.deadline_alerted_at===deadline)continue;
        const oldAssignee=t.assigned_to,account=accounts.findById(oldAssignee),oldLevel=account?.role==='department_manager'?'manager':account?.tier||t.required_tier||'L1';
        t.deadline_alerted_at=deadline;
        if(oldLevel==='manager'){
          t.reply_target_at=null;t.awaiting_staff_reply=false;t.needs_director_review=true;
        }else{
          t.required_tier=({L1:'L2',L2:'L3',L3:'manager'}[oldLevel]||'L2');t.assigned_to=null;t.assignment=null;
          assign(t,data);t.status=t.assigned_to?'acknowledged':'open';
        }
        t.version++;
        const destination=t.needs_director_review?'organization leadership':levelLabel(t.required_tier);
        const content=t.needs_director_review?'The department lead’s reply target passed. Leadership has been alerted; no further reply time is confirmed.':`The reply target passed without a specialist response. Routed to ${destination}. ${t.assigned_to?'A new owner is assigned.':'No eligible senior is available yet; your request remains in the senior queue.'} Your earlier notes are included. ${t.eta_text}.`;
        const m=message(data,t,'system',content),e=event(data,'auto_escalated',t,content);t.timeline.push(e);changes.push({ticketId:t.id,oldAssignee,message:m,event:e});
      }return changes;
    });
    for(const update of updates){publish(store.data.tickets.find(t=>t.id===update.ticketId),update.event,update.message);if(update.oldAssignee)io.to(`employee:${update.oldAssignee}`).emit('dashboard:invalidate',{eventId:update.event.id});}
    return updates;
  };
  const replyTimer=process.env.NODE_ENV==='test'?null:setInterval(()=>sweepReplyTargets().catch(e=>console.error('[Reply deadline worker]',e.message)),5000);
  replyTimer?.unref();io.httpServer?.once('close',()=>clearInterval(replyTimer));
  ready.then(()=>{if(replyTimer)sweepReplyTargets().catch(e=>console.error('[Reply deadline recovery]',e.message));}).catch(()=>{});
  app.set('sweepReplyTargets',sweepReplyTargets);
  app.use('/api',router);
  return {store,ready,sync,safeTicket,commit,wrap,event,id};
}
module.exports = { installPilot };
