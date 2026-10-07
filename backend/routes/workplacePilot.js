const crypto = require('crypto');
const QRCode = require('qrcode');
const { fail, staff } = require('../services/pilotAccess');
const accounts = require('../auth/accountStore');

// Company-owned records only. Empty installations intentionally have no fixture data.
function installWorkplace(router, { store, wrap, commit, id }, io) {
  const modules = ['holidays','announcements','menus','parking','transport','rooms','navigation'];
  const visible = (record, user) => user.role === 'main_manager' || (!record.department || record.department === user.department) && (!record.location || record.location === user.location);
  const active = record => !record.closed && (!record.expires_at || Date.parse(record.expires_at) > Date.now()) && (!record.publish_at || Date.parse(record.publish_at) <= Date.now());
  const init = data => { const w = data.workplace; for (const name of [...modules,'bookings','attendance','receipts','mealTokens']) w[name] ||= []; return w; };
  const notify = record => { const targets = accounts.listAccounts().filter(a => a.active && visible(record,a)); const eventId = id(); for (const a of targets) io.to(`user:${a.id}`).emit('workplace:changed',{eventId}); };
  router.get('/workplace',wrap(async(req,res)=>{
    const w = store.data.workplace;
    const roster = accounts.listAccounts().filter(a => visible(a,req.user)).map(a => ({ id:a.id, name:a.name, email:a.email, role:a.role, department:a.department, tier:a.tier, joined_at:a.created_at, active:a.active!==false }));
    res.json({timezone:'Asia/Kolkata',location:req.user.location || null,modules:Object.fromEntries(modules.map(name=>[name,(w[name]||[]).filter(r=>visible(r,req.user) && (staff(req.user)||active(r)))])),bookings:(w.bookings||[]).filter(b=>b.user_id===req.user.id || staff(req.user)&&visible(b,req.user)),attendance:(w.attendance||[]).filter(a=>a.user_id===req.user.id || staff(req.user)&&visible(a,req.user)),capabilities:{face_recognition:false,calling:false},readReceipts:(w.receipts||[]).filter(r=>r.user_id===req.user.id),staffRoster:roster});
  }));
  router.post('/workplace/records/:module',wrap(async(req,res)=>{
    if(!staff(req.user))fail(403,'Administrator access required');
    const name=req.params.module;if(!modules.includes(name))fail(404,'Unknown module');
    const body=req.body;
    if(!String(body.title||'').trim())fail(400,'Title is required');
    if(body.department && req.user.role!=='main_manager' && body.department!==req.user.department)fail(403,'Department access denied');
    for(const field of ['expires_at','publish_at'])if(body[field]&&!Number.isFinite(Date.parse(body[field])))fail(400,'Invalid date');
    if(['rooms','parking','transport'].includes(name)&&(!Number.isInteger(body.capacity)||body.capacity<1||body.capacity>1000))fail(400,'Enter a capacity between 1 and 1000');
    const output=await commit(req,data=>{
      const w=init(data),previous=body.id?w[name].find(r=>r.id===body.id):null;
      if(body.id&&!previous)fail(404,'Record not found');
      if(previous&&!visible(previous,req.user))fail(403,'Record access denied');
      if(previous&&body.version!==previous.version)fail(409,'Record changed. Refresh first');
      const record={id:previous?.id||id(),version:(previous?.version||0)+1,title:String(body.title).trim().slice(0,160),description:String(body.description||'').slice(0,4000),department:req.user.role==='main_manager'?(body.department||null):req.user.department,location:body.location||null,date:body.date||null,publish_at:body.publish_at||null,expires_at:body.expires_at||null,critical:!!body.critical,closed:!!body.closed,capacity:body.capacity||null,dietary_labels:Array.isArray(body.dietary_labels)?body.dietary_labels.map(String):[],directions:String(body.directions||'').slice(0,4000),accessible_directions:String(body.accessible_directions||'').slice(0,4000),created_by:req.user.id};
      if(previous)w[name][w[name].indexOf(previous)]=record;else w[name].push(record);
      return {record};
    });if(!output.replayed)notify(output.record);res.json(output);
  }));
  router.post('/workplace/bookings',wrap(async(req,res)=>{
    const body=req.body;
    if(!['parking','transport','rooms'].includes(body.module))fail(400,'Choose parking, transportation or a room');
    const start=Date.parse(body.start),end=Date.parse(body.end);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||start<Date.now()-60000)fail(400,'Choose a valid future time range');
    if(body.confirm!==true)fail(400,'Confirm this reservation before booking');
    const output=await commit(req,data=>{
      const w=init(data),resource=w[body.module].find(r=>r.id===body.resource_id);
      if(!resource||!visible(resource,req.user)||!active(resource))fail(404,'Resource unavailable');
      const participants=[...new Set([req.user.id,...(Array.isArray(body.participants)?body.participants:[])])];
      if(body.module==='rooms'&&participants.some(p=>!accounts.findById(p)?.active))fail(400,'Participant unavailable');
      const overlapping=w.bookings.filter(b=>b.status!=='cancelled'&&Date.parse(b.start)<end&&Date.parse(b.end)>start);
      const used=overlapping.filter(b=>b.resource_id===resource.id).reduce((n,b)=>n+(body.module==='rooms'?1:b.seats),0);
      if(used>=(body.module==='rooms'?1:resource.capacity))fail(409,'No availability for that time');
      if(overlapping.some(b=>b.module===body.module&&(b.user_id===req.user.id||body.module==='rooms'&&b.participants.some(p=>participants.includes(p)))))fail(409,'An employee already has an overlapping reservation');
      const booking={id:id(),version:1,module:body.module,resource_id:resource.id,title:resource.title,user_id:req.user.id,department:req.user.department,location:resource.location,start:new Date(start).toISOString(),end:new Date(end).toISOString(),participants,seats:1,status:'confirmed',checked_in:false,created_at:new Date().toISOString(),responses:Object.fromEntries(participants.map(p=>[p,p===req.user.id?'accepted':'pending']))};
      w.bookings.push(booking);return {booking};
    });if(!output.replayed)notify(output.booking);res.json(output);
  }));
  router.post('/workplace/bookings/:id/:action',wrap(async(req,res)=>{
    const output=await commit(req,data=>{
      const booking=init(data).bookings.find(b=>b.id===req.params.id);if(!booking)fail(404,'Booking not found');
      if(req.body.version!==booking.version)fail(409,'Booking changed. Refresh first');
      if(req.params.action==='respond'){
        if(!booking.participants.includes(req.user.id)||!['accepted','declined'].includes(req.body.response))fail(403,'Invitation access denied');
        booking.responses[req.user.id]=req.body.response;
      }else{
        if(booking.user_id!==req.user.id && !(staff(req.user)&&visible(booking,req.user)))fail(403,'Booking access denied');
        if(booking.status==='cancelled')fail(409,'Booking is cancelled');
        if(req.params.action==='cancel')booking.status='cancelled';
        else if(req.params.action==='check-in')booking.checked_in=true;
        else fail(404,'Unknown action');
      }
      booking.version++;return {booking};
    });if(!output.replayed)notify(output.booking);res.json(output);
  }));
  router.post('/workplace/announcements/:id/read',wrap(async(req,res)=>{
    const output=await commit(req,data=>{const w=init(data),record=w.announcements.find(r=>r.id===req.params.id);if(!record||!visible(record,req.user)||!active(record))fail(404,'Announcement not found');if(!w.receipts.some(r=>r.record_id===record.id&&r.user_id===req.user.id))w.receipts.push({record_id:record.id,user_id:req.user.id,at:new Date().toISOString()});return {read:true};});res.json(output);
  }));
  router.post('/workplace/attendance',wrap(async(req,res)=>{
    const output=await commit(req,data=>{const w=init(data),day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});if(w.attendance.some(a=>a.user_id===req.user.id&&a.day===day))fail(409,'Attendance already submitted today');const record={id:id(),version:1,user_id:req.user.id,department:req.user.department,location:req.user.location||null,day,status:'pending_verification',method:'manual',note:String(req.body.note||'').slice(0,1000)};w.attendance.push(record);return {record};});res.json(output);
  }));
  router.post('/workplace/attendance/:id/review',wrap(async(req,res)=>{
    if(!staff(req.user))fail(403,'Manager access required');
    const output=await commit(req,data=>{const record=init(data).attendance.find(a=>a.id===req.params.id);if(!record||!visible(record,req.user))fail(403,'Attendance access denied');if(req.body.version!==record.version)fail(409,'Attendance changed');if(!['present','absent','leave','holiday','pending_verification'].includes(req.body.status))fail(400,'Invalid attendance status');record.status=req.body.status;record.reviewed_by=req.user.id;record.version++;return {record};});res.json(output);
  }));
  router.post('/workplace/meals/token',wrap(async(req,res)=>{
    const output=await commit(req,data=>{const w=init(data),menu=w.menus.find(m=>m.id===req.body.menu_id);if(!menu||!visible(menu,req.user)||!active(menu))fail(404,'Menu unavailable');const token=crypto.randomBytes(32).toString('base64url');w.mealTokens.push({id:id(),hash:crypto.createHash('sha256').update(token).digest('hex'),user_id:req.user.id,menu_id:menu.id,department:menu.department,expires_at:Date.now()+15*60000,redeemed_at:null});return {token,expires_at:Date.now()+15*60000};});res.json({...output,qr:await QRCode.toDataURL(output.token)});
  }));
  router.post('/workplace/meals/redeem',wrap(async(req,res)=>{
    if(!staff(req.user))fail(403,'Authorized cafeteria administrator required');
    const output=await commit(req,data=>{const w=init(data),hash=crypto.createHash('sha256').update(String(req.body.token||'')).digest('hex'),token=w.mealTokens.find(t=>t.hash===hash),menu=token&&w.menus.find(m=>m.id===token.menu_id);if(!token||!menu||!visible(menu,req.user))fail(404,'Meal token not found');if(token.expires_at<Date.now())fail(410,'Meal token expired');if(token.redeemed_at)fail(409,'Meal token already redeemed');token.redeemed_at=Date.now();return {redeemed:true,menu:menu.title};});res.json(output);
  }));
}
module.exports={installWorkplace};
