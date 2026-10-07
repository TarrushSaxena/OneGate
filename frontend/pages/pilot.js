// Persisted support workspace. No sample records or invented operational metrics.
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function workspace(container, options = {}) {
    const user = PS18.user;
    if (!user) return navigate('login');
    const employee = user.role === 'employee';
    const orgManager = user.role === 'main_manager';
    let conversationId=sessionStorage.getItem('og-conversation-'+user.id)||'';
    const manager = ['department_manager','main_manager'].includes(user.role);
    let selected = null, tickets = [], disposed = false, loading = false, pendingSubmission = null;
    const unreadTicketIds = new Set();
    let chatHistory=[], view='chat', busy=false, loader=null, thinkingTimer=null, typingTimer=null, typingSentAt=0, actionCatalog=null;
    const socket = PS18.connectSocket();
    container.innerHTML = `<div class="og-work ${employee?'og-employee':''}"><aside class="og-nav"><a class="og-brand" href="#">OneGate<span>One place. Less friction.</span></a><div class="og-avatar">${escape((user.name || 'U').slice(0,1))}</div><p>${escape(user.name)}<small>${escape(user.department)}</small></p><button data-view="today">Today</button><button data-view="chat">${employee ? 'Ask OneGate' : orgManager ? 'Request details' : 'Assigned queue'}</button><button data-view="tickets">${employee ? 'My requests' : orgManager ? 'All requests' : 'Request queue'}</button>${manager ? '<button data-view="overview">Department overview</button>' : ''}<button id="og-logout">Sign out</button></aside><button type="button" class="og-sidebar-scrim" aria-label="Close navigation"></button><main class="og-main"><header><div><span class="og-eyebrow">YOUR WORKDAY, CONNECTED</span><h1>${employee ? 'Ask OneGate' : manager ? 'Your organization, in focus.' : 'Make someone’s day easier.'}</h1></div><span id="og-network" role="status">Connecting…</span></header><div id="og-error" role="alert"></div><div class="og-grid"><section id="og-request-list" class="og-panel og-list"><div class="og-list-heading"><div><span class="og-eyebrow">${employee?'YOUR WORK':'SUPPORT WORK'}</span><label for="og-search">${employee?'My requests':'Request queue'}</label></div><span id="og-request-count" class="og-request-count"></span></div><input id="og-search" type="search" placeholder="Search reference or subject"><div id="og-tickets"></div></section><section class="og-panel og-thread"><div id="og-context"></div><div id="og-messages" role="log" aria-label="Conversation" aria-live="polite"></div><form id="og-compose"><label for="og-draft" class="og-sr">Message</label><textarea id="og-draft" placeholder="Tell us what you need…" rows="2" maxlength="10000"></textarea><button type="submit">Send ↗</button></form><div id="og-actions"></div></section></div><section id="og-overview" class="og-panel" hidden></section></main></div>`;
    const el = id => container.querySelector('#og-' + id);
    const work = container.querySelector('.og-work');
    work.classList.add('og-sidebar-collapsed');
    if(employee)work.classList.add('og-chat-full');
    container.querySelector('.og-main>header').insertAdjacentHTML('afterbegin','<button type="button" class="og-sidebar-toggle" aria-label="Show navigation" aria-controls="og-primary-navigation" aria-expanded="false"><span aria-hidden="true">☰</span></button>');
    container.querySelector('.og-nav').id='og-primary-navigation';
    const sidebarToggle=container.querySelector('.og-sidebar-toggle');
    const closeSidebar=()=>{work.classList.remove('og-sidebar-expanded','og-mobile-list-open');work.classList.add('og-sidebar-collapsed');sidebarToggle.setAttribute('aria-expanded','false');sidebarToggle.setAttribute('aria-label','Show navigation');};
    sidebarToggle.onclick=()=>{const open=work.classList.toggle('og-sidebar-expanded');work.classList.toggle('og-sidebar-collapsed',!open);sidebarToggle.setAttribute('aria-expanded',String(open));sidebarToggle.setAttribute('aria-label',open?'Collapse navigation':'Show navigation');};
    container.querySelector('.og-sidebar-scrim').onclick=closeSidebar;
    container.addEventListener('keydown',event=>{if(event.key==='Escape'&&(work.classList.contains('og-sidebar-expanded')||work.classList.contains('og-mobile-list-open')))closeSidebar();});
    if(!employee){container.querySelector('.og-work').classList.add(orgManager?'og-org-manager':'og-specialist');container.querySelector('h1').textContent=manager?'Support oversight':'Specialist workspace';el('draft').placeholder='Write your reply to the employee…';}
    const serviceNav = document.createElement('div');
    serviceNav.innerHTML = '<button data-view="calendar">Calendar</button><button data-view="services">Workplace services</button><button data-view="actions">My actions</button><button data-view="policies">View all policies</button>';
    if(orgManager){serviceNav.querySelector('[data-view=actions]').textContent='Approvals';container.querySelector('[data-view=chat]').hidden=true;container.querySelector('[data-view=overview]').textContent='Organization overview';}
    container.querySelector('.og-nav').insertBefore(serviceNav, el('logout'));
    container.querySelectorAll('.og-nav button[data-view]').forEach(button=>button.title=button.textContent.trim());

    container.querySelector('[data-view="tickets"]').textContent=employee?'My requests':orgManager?'All requests':'Request queue';
    container.querySelector('.og-work').classList.add('og-glass-work');
    container.querySelector('.og-list').hidden=employee;
    el('tickets').insertAdjacentHTML('beforebegin','<div class="og-filters" role="group" aria-label="Request status"><button data-filter="active" aria-pressed="true">Active</button><button data-filter="resolved" aria-pressed="false">Resolved</button><button data-filter="all" aria-pressed="false">All</button></div>');
    let filter='active';
    if(employee){
      el('request-list').insertAdjacentHTML('afterbegin','<button type="button" class="og-rail-close" aria-label="Close requests">×</button>');
      el('request-list').querySelector('.og-rail-close').onclick=()=>work.classList.remove('og-mobile-list-open');
      el('request-list').onclick=e=>{if(e.target.closest('.og-rail-close'))work.classList.remove('og-mobile-list-open');};
    }
    container.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;container.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderList();});
    el('compose').insertAdjacentHTML('beforebegin','<div id="og-thinking" role="status" aria-live="polite" hidden></div><div id="og-typing" role="status" aria-live="polite" hidden></div><div id="og-suggestions" class="og-suggestions" aria-label="Suggested questions"></div>');
    el('compose').insertAdjacentHTML('afterend','<div id="og-handoff" hidden></div><p class="og-composer-note">Your conversation is saved. Shift + Enter for a new line.</p>');
    container.insertAdjacentHTML('beforeend','<dialog id="og-dialog" class="og-dialog"><form method="dialog"><div id="og-dialog-content"></div><div class="og-dialog-buttons"><button value="cancel" formnovalidate>Cancel</button><button id="og-dialog-confirm" value="confirm">Confirm</button></div></form></dialog>');
    const dialogForm = (html, confirmLabel='Confirm') => new Promise(resolve=>{
      const dialog=el('dialog');el('dialog-content').innerHTML=html;el('dialog-confirm').textContent=confirmLabel;
      dialog.onclose=()=>resolve(dialog.returnValue==='confirm'?Object.fromEntries(new FormData(dialog.querySelector('form'))):null);dialog.showModal();
    });
    const suggestions=()=>{
      if(selected || !employee || busy){
        el('suggestions').innerHTML='';
        el('suggestions').hidden=true;
        return;
      }
      el('suggestions').hidden=false;
      const prompts=['My VPN keeps disconnecting','What is the leave policy?','I need help with a reimbursement'];
      el('suggestions').innerHTML=prompts.map(p=>`<button type="button" data-suggestion="${escape(p)}">${escape(p)} <span>↗</span></button>`).join('');
    };
    const workflowButtons = (message,submittedTypes) => {
      if(!employee||message.role!=='assistant')return '';
      const actions=(message.metadata?.suggestedActions||[]).filter(action=>!submittedTypes.has(action.id)).slice(0,2);
      return actions.length?`<div class="og-context-actions" aria-label="Actions you can take">${actions.map(action=>`<button type="button" data-workflow="${escape(action.id)}"><span>${escape(action.label)}</span><small>${escape(action.description)}</small><b aria-hidden="true">↗</b></button>`).join('')}</div><div class="og-inline-action-host"></div>`:'';
    };
    const workflowCard = message => {
      const item=message.metadata?.workflow;if(!item)return '';
      const state=item.status||'pending',title=state==='pending'?'Submitted for approval':state==='approved'?'Approved':state==='denied'?'Declined':state==='complete'?'Ready':'Security team alerted';
      return `<article class="og-workflow-card" data-status="${escape(state)}"><div class="og-workflow-icon" aria-hidden="true">${state==='approved'?'✓':state==='denied'?'×':'↗'}</div><div class="og-workflow-body"><div class="og-workflow-title"><strong>${escape(item.label)}</strong><span>${escape(title)}</span></div><p>${escape(item.summary)}</p><div class="og-approval-path"><span><b>Approver</b>${escape(item.approver_name)}</span><span><b>Visible to</b>${escape((item.viewers||[]).join(' · '))}</span></div>${item.decision_notes?`<small>Decision note: ${escape(item.decision_notes)}</small>`:''}<code>${escape(item.id)}</code></div></article>`;
    };
    el('suggestions').onclick=e=>{const b=e.target.closest('[data-suggestion]');if(b){el('draft').value=b.dataset.suggestion;el('draft').focus();}};
    const thinking = active => {
      loader?.destroy();loader=null;clearTimeout(thinkingTimer);busy=active;el('thinking').hidden=!active;el('draft').disabled=active;suggestions();
      if(active){el('thinking').dataset.state='thinking';container.querySelector('.og-work').dataset.state='thinking';}
      if(active){el('thinking').innerHTML='';loader=new LatticeLoader({label:employee?'OneGate is reviewing your message':'Delivering your reply',showTimer:false});el('thinking').appendChild(loader.element);thinkingTimer=setTimeout(()=>{if(!disposed&&busy)el('thinking').querySelector('.lattice-text').textContent='This is taking longer than usual. Your message is still being processed.';},12000);}
    };
    const etaText=t=>{
      if(t.status==='resolved')return 'Resolved';
      if(t.status==='waiting_on_user')return 'Waiting for your details';
      if(t.status==='ai_attempted')return 'Try the suggested steps';
      if(t.needs_director_review)return 'Leadership alerted';
      if(t.awaiting_staff_reply===false)return 'Specialist replied';
      if(!t.eta_updated_at)return t.eta_text||'Reply estimate not available yet';
      const target=t.reply_target_at||t.eta_updated_at+t.eta_high_min*60000,remaining=Math.max(0,target-Date.now()),high=Math.ceil(remaining/60000);
      if(!high)return `Window passed${t.eta_clock?` (${t.eta_clock})`:''}`;
      if(t.eta_clock)return `Reply expected by ${t.eta_clock}`;
      return `Reply expected within ${high} min`;
    };
    const error = e => {
      if (disposed) return;
      const msg = typeof e === 'string' ? e : e?.message || 'A network error occurred.';
      el('error').innerHTML = `
        <div class="og-error-content">
          <span style="font-size:15px;flex-shrink:0;">⚠️</span>
          <span style="line-height:1.4;">${escape(msg)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          ${pendingSubmission ? `<button type="button" id="og-retry-draft" style="font-size:11px;font-weight:700;padding:4px 10px;background:#fff;border:1px solid #fda4af;color:#be123c;border-radius:6px;cursor:pointer;">↺ Retry send</button>` : ''}
          <button type="button" class="og-error-close" aria-label="Dismiss error">✕</button>
        </div>
      `;
      const close = el('error').querySelector('.og-error-close');
      if (close) close.onclick = () => { el('error').innerHTML = ''; };
      const retry = el('error').querySelector('#og-retry-draft');
      if (retry) retry.onclick = () => { el('compose').requestSubmit(); };
    };
    const renderMessages = messages => {
      const target = el('messages');
      container.querySelector('.og-thread').classList.toggle('og-empty-chat',employee&&!selected&&messages.length===0);

      let activeMessages = messages || [];
      if (employee && view === 'chat' && selected) {
        const map = new Map();
        for (const m of chatHistory) { if (m && m.id) map.set(m.id, m); }
        for (const m of (messages || [])) { if (m && m.id) map.set(m.id, m); }
        for (const m of (selected.transcript || [])) { if (m && m.id) map.set(m.id, m); }
        activeMessages = Array.from(map.values()).sort((a,b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
      }

      const signature=JSON.stringify(activeMessages);
      if(target.dataset.signature===signature)return;
      target.dataset.signature=signature;
      const previousIds=new Set((target.dataset.messageIds||'').split('|').filter(Boolean));
      const animateNew=previousIds.size>0;
      const submittedTypes=new Set(activeMessages.filter(m=>m.metadata?.type==='workflow_submission').map(m=>m.metadata.workflow?.type).filter(Boolean));
      target.dataset.messageIds=activeMessages.map(m=>m.id).filter(Boolean).join('|');

      const ticketStartId = selected?.transcript?.[0]?.id;

      target.innerHTML = activeMessages.map(m => {
        const isTicketStart = selected && m.id === ticketStartId;
        const dividerHtml = isTicketStart ? `<div class="og-ticket-divider"><span class="og-divider-line"></span><span class="og-divider-badge">Request ${escape(selected.reference)} opened · Queued for ${escape(selected.department)}</span><span class="og-divider-line"></span></div>` : '';
        const bodyHtml = m.metadata?.workflow ? workflowCard(m) : `<article class="og-message ${m.role === 'user' ? 'og-own' : m.role==='system'?'og-event':''} ${animateNew&&m.id&&!previousIds.has(m.id)?'og-message-new':''}"><small>${escape(m.senderName || m.employeeName || (m.role === 'user' ? employee?'You':'Employee' : m.role === 'employee' ? 'Specialist' : m.role==='system'?'Request update':'OneGate · AI assistant'))}${m.employeeLevel?` · ${escape(m.employeeLevel)}`:''} · ${escape(PS18.formatTime(m.timestamp))}</small><div>${PS18.md(m.content)}</div>${m.metadata?.kbArticle&&m.role==='assistant'?`<details class="og-routing-trace"><summary>Answered by ${escape(m.metadata.department || 'Knowledge Base')} · policy source checked</summary><span>${escape(m.metadata.kbArticle?.source_citation||'OneGate knowledge guidance')}</span></details>`:''}${workflowButtons(m,submittedTypes)}</article>`;
        return dividerHtml + bodyHtml;
      }).join('') || `<div class="og-empty og-welcome"><div class="og-spark" aria-hidden="true">✦</div><span class="og-eyebrow">ONE CONVERSATION. THE RIGHT NEXT STEP.</span><h2>What can we get done?</h2><p>${employee?'Ask a question or complete a workplace task. OneGate can answer, route and submit the next step here.':'Select a request from the sidebar to see its conversation and next actions.'}</p></div>`;

      target.scrollTop = target.scrollHeight;
      requestAnimationFrame(() => { target.scrollTop = target.scrollHeight; });

      if(employee){
        const latest=[...chatHistory].reverse().find(m=>m.role==='user');
        const answer=[...chatHistory].reverse().find(m=>m.role==='assistant');
        const uncertain=!!answer&&(['clarification','multi_intent_clarification','blocked'].includes(answer.metadata?.type)||(!answer.metadata?.kbArticle&&answer.resolution_type!=='human_required'));
        const needsStaff=answer?.resolution_type==='human_required'||['ticket','ai_attempted'].includes(answer?.metadata?.type);
        const show=!!latest&&!selected&&(uncertain||needsStaff);
        el('handoff').hidden=!show;
        el('handoff').innerHTML=show?'<span>Still unresolved or needs staff action?</span><button id="og-connect" type="button">Connect to a specialist <span>↗</span></button>':'';
      }
    };
    const fieldMarkup=field=>{
      const common=`name="${escape(field.name)}" ${field.required?'required':''} ${field.maxLength?`maxlength="${field.maxLength}"`:''}`;
      let control;
      if(field.type==='select')control=`<select ${common}><option value="">Choose…</option>${field.options.map(option=>`<option value="${escape(option.value)}">${escape(option.label)}</option>`).join('')}</select>`;
      else if(field.type==='textarea')control=`<textarea ${common} rows="3"></textarea>`;
      else control=`<input ${common} type="${escape(field.type)}" ${field.min!=null?`min="${field.min}"`:''} ${field.max!=null?`max="${field.max}"`:''} ${field.accept?`accept="${escape(field.accept)}"`:''}>`;
      const wide=['textarea','file'].includes(field.type)?' og-action-field--wide':'';
      return `<label class="og-action-field${wide}"><span>${escape(field.label)}${field.required?'<i aria-hidden="true">Required</i>':''}</span>${control}<small class="og-field-error" data-field-error="${escape(field.name)}" role="alert"></small></label>`;
    };
    const actionFormMarkup=(action,verification=false)=>`<form class="og-action-form" data-action-form="${escape(action.id)}" ${verification?'data-verification="true"':''} novalidate><header class="og-action-form-header"><span class="og-eyebrow">${verification?'SECURE STEP':'COMPLETE IT IN ONEGATE'}</span><h3>${escape(verification?'Verify your identity':action.label)}</h3><p>${escape(verification?'Confirm your account password before opening this sensitive action.':action.description)}</p></header>${verification?'<div class="og-action-fields"><label class="og-action-field og-action-field--wide"><span>Account password<i aria-hidden="true">Required</i></span><input name="password" type="password" autocomplete="current-password" required><small class="og-field-error" data-field-error="password" role="alert"></small></label></div>':`<div class="og-action-approval"><span><b>${action.kind==='incident'?'Response':'Approver'}</b>${escape(action.kind==='incident'?action.owner:action.approver?.name||'Organization leadership')}</span><span><b>Can view</b>${escape((action.viewers||[]).join(' · '))}</span></div><div class="og-action-fields">${action.fields.map(fieldMarkup).join('')}</div>`}<footer class="og-action-form-footer"><p class="og-form-status" role="status" aria-live="polite"></p><div class="og-inline-action-buttons"><button type="button" data-action-cancel>Cancel</button><button type="submit">${verification?'Verify and continue':action.kind==='read_only'?'Show now':'Submit request'}</button></div></footer></form>`;
    const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,type:file.type,size:file.size,data:reader.result});reader.onerror=()=>reject(new Error('The receipt could not be read'));reader.readAsDataURL(file);});
    const catalogAction=async type=>{actionCatalog||=await PS18.request('/workplace/actions/catalog');return actionCatalog.actions.find(action=>action.id===type);};
    const appendWorkflowMessage=result=>{if(selected){selected.transcript=[...(selected.transcript||[]),result.message];renderMessages(selected.transcript);}else{chatHistory.push(result.message);renderMessages(chatHistory);}};
    el('messages').onclick=async e=>{
      const cancel=e.target.closest('[data-action-cancel]');if(cancel){cancel.closest('.og-inline-action-host').innerHTML='';return;}
      const button=e.target.closest('[data-workflow]');if(!button||busy)return;
      button.disabled=true;
      try{
        const action=await catalogAction(button.dataset.workflow);if(!action)throw new Error('This action is not available');
        const host=button.closest('.og-message').querySelector('.og-inline-action-host');
        if(action.kind==='read_only'){const result=await PS18.request(`/workplace/actions/${encodeURIComponent(action.id)}`,{method:'POST',body:JSON.stringify({conversationId,...(selected?{ticketId:selected.id}:{})})});appendWorkflowMessage(result);return;}
        host.innerHTML=actionFormMarkup(action,action.requiresVerification);host.querySelector('input,select,textarea')?.focus();
      }catch(err){error(err);}finally{button.disabled=false;}
    };
    el('messages').onsubmit=async e=>{
      const form=e.target.closest('[data-action-form]');if(!form)return;e.preventDefault();
      const action=await catalogAction(form.dataset.actionForm),submit=form.querySelector('[type="submit"]'),status=form.querySelector('.og-form-status');
      form.querySelectorAll('.og-field-error').forEach(node=>node.textContent='');form.querySelectorAll('[aria-invalid]').forEach(node=>node.removeAttribute('aria-invalid'));status.textContent='';submit.disabled=true;
      try{
        if(form.dataset.verification==='true'){
          const result=await PS18.request('/workplace/actions/verify-identity',{method:'POST',body:JSON.stringify({actionId:action.id,password:new FormData(form).get('password')})});
          form.closest('.og-inline-action-host').innerHTML=actionFormMarkup(action).replace('<form class="og-action-form"',`<form data-verification-token="${escape(result.verificationToken)}" class="og-action-form"`);return;
        }
        const details={};for(const field of action.fields){const input=form.elements[field.name];details[field.name]=field.type==='file'&&input.files[0]?await readFile(input.files[0]):input.value;}
        const verificationToken=form.dataset.verificationToken||'';
        const result=await PS18.request(`/workplace/actions/${encodeURIComponent(action.id)}`,{method:'POST',body:JSON.stringify({...details,verificationToken,conversationId,...(selected?{ticketId:selected.id}:{})})});appendWorkflowMessage(result);
      }catch(err){
        if(err.fieldErrors){for(const [name,message] of Object.entries(err.fieldErrors)){const input=form.elements[name],slot=form.querySelector(`[data-field-error="${CSS.escape(name)}"]`);if(input)input.setAttribute('aria-invalid','true');if(slot)slot.textContent=message;}form.querySelector('[aria-invalid]')?.focus();}
        else status.textContent=err.message;
      }finally{submit.disabled=false;}
    };
    const renderList = () => {
      const query = el('search').value.toLowerCase();
      const active=tickets.filter(t=>t.status!=='resolved');
      const resolved=tickets.length-active.length;
      el('request-count').textContent=employee?`${active.length} active`:`${active.length} open`;
      const visible=tickets.filter(t => (filter==='all'||(filter==='resolved'?t.status==='resolved':t.status!=='resolved'))&&`${t.reference} ${t.title} ${t.department}`.toLowerCase().includes(query));
      el('tickets').innerHTML = visible.map(t => {
        const latest=t.timeline?.at(-1)||t.transcript?.at(-1);
        const unread=unreadTicketIds.has(t.id);
        const statusLabel=({acknowledged:'Specialist assigned',in_progress:'In progress',waiting_on_user:'Waiting on you',open:'In queue',resolved:'Resolved',ai_attempted:'Try the suggested fix',escalated:'Escalated'})[t.status]||t.status.replaceAll('_',' ');
        const owner=t.assigned_name||(t.status==='ai_attempted'?'Self-service guidance':'Awaiting assignment');
        const reply=t.status==='resolved'?'Request complete':t.status==='waiting_on_user'?'Reply needed':t.status==='ai_attempted'?'Check if the fix worked':t.eta_text||'Reply estimate not available yet';
        return `<button class="og-ticket ${selected?.id===t.id?'og-selected':''} ${unread?'og-ticket-unread':''}" data-ticket="${escape(t.id)}" aria-current="${selected?.id===t.id?'true':'false'}">
          <span class="og-ticket-top"><small>${escape(t.reference)} · ${escape(t.department)}</small>${unread?'<span class="og-unread-dot" aria-label="New update"></span>':''}</span>
          <strong>${escape(t.title)}</strong><span class="og-ticket-status" data-status="${escape(t.status)}">${escape(statusLabel)}</span>
          <span class="og-ticket-meta">${escape(owner)}</span><span class="og-ticket-eta">${escape(reply)}</span>
          <span class="og-ticket-updated">${latest?`Updated ${escape(PS18.formatTime(latest.timestamp))}`:'Request created'}</span>
        </button>`;
      }).join('') || `<p class="og-empty">${filter==='resolved'&&resolved===0?'Resolved requests will appear here.':'No matching requests. New requests will appear here.'}</p>`;
    };
    const showTicket = t => {
      const switched=selected?.id!==t?.id;
      selected = t;
      if(t)unreadTicketIds.delete(t.id);
      renderList();
      const lifecycle=t?.timeline?.at(-1)?.type;
      const state=t?.status==='resolved'?'resolved':t?.status==='waiting_on_user'?'waiting':lifecycle==='reroute'?'rerouted':['escalate','auto_escalated'].includes(lifecycle)?'escalated':t?.status==='ai_attempted'?'self-service':t?.assigned_to?'assigned':t?'queued':'ready';
      container.querySelector('.og-work').dataset.state=state;
      el('typing').hidden=true;clearTimeout(typingTimer);el('handoff').hidden=!!t;
      const priorityText = t?.priority === 'high' || t?.priority === 'critical' ? 'High priority' : t?.priority === 'low' ? 'Low priority' : 'Standard priority';
      const priorityLabel = `${priorityText}${t?.priority_reason ? ` · ${t.priority_reason}` : ''}`;
      const statusLabel = t ? (({acknowledged:'Specialist assigned',in_progress:'In progress',waiting_on_user:'Waiting on you',open:'In queue',resolved:'Resolved',ai_attempted:'Try suggested fix',escalated:'Escalated'})[t.status] || t.status.replaceAll('_',' ')) : '';
      const etaDisplay = t ? etaText(t) : '';

      if (employee && view === 'chat' && t) {
        el('context').innerHTML = `
          <div class="og-compact-bar" data-ticket-id="${escape(t.id)}">
            <div class="og-compact-bar-main">
              <div class="og-compact-bar-left">
                <span class="og-compact-pill og-compact-ref">${escape(t.reference)}</span>
                <span class="og-compact-pill og-compact-dept">${escape(t.department)}</span>
                <span class="og-compact-pill og-compact-status" data-status="${escape(t.status)}">${escape(statusLabel)}</span>
                <span class="og-compact-eta">${escape(etaDisplay)}</span>
              </div>
              <div class="og-compact-bar-right">
                <div class="og-compact-actions">
                  ${t.status !== 'resolved' ? `
                    <button type="button" class="og-compact-btn" data-add-details="true">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>
                      <span>Add details</span>
                    </button>
                    <button type="button" class="og-compact-btn" data-action="priority">⚡ Priority</button>
                    <button type="button" class="og-compact-btn" data-action="reroute">⇄ Wrong team?</button>
                  ` : `
                    <button type="button" class="og-compact-btn" data-action="reopen">↩ Reopen</button>
                    <button type="button" class="og-compact-btn" data-action="feedback">★ Rate</button>
                  `}
                </div>
                <button type="button" id="og-compact-toggle" class="og-compact-toggle" aria-expanded="false" aria-label="Toggle request details">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 6 8 10 4"/></svg>
                </button>
                <button id="og-new" class="og-btn-new-q" type="button" aria-label="Ask an unrelated question">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>
                  <span>New question</span>
                </button>
              </div>
            </div>
            <div class="og-compact-drawer" id="og-compact-drawer" hidden>
              <div style="font-weight:700;font-size:13px;color:#183626;margin-bottom:4px;">${escape(t.title)}</div>
              <div style="font-size:11.5px;color:#496552;margin-bottom:8px;">${escape(priorityLabel)}</div>
              <div class="og-route-steps" style="margin:8px 0;">
                <span class="is-done">● Request saved</span>
                <span class="${t.assigned_to ? 'is-done' : 'is-current'}">${t.assigned_to ? '● Assigned' : '○ In queue'}</span>
                <span class="${t.status === 'resolved' ? 'is-done' : ''}">${t.status === 'resolved' ? '● Resolved' : '○ In triage'}</span>
              </div>
              ${t.timeline && t.timeline.length ? `
                <details class="og-timeline">
                  <summary>Request timeline · ${t.timeline.length} ${t.timeline.length === 1 ? 'update' : 'updates'}</summary>
                  ${t.timeline.map(e => `<p><strong>${escape(e.type.replaceAll('_',' '))}</strong><span>${escape(PS18.formatTime(e.timestamp))}</span><br>${escape(e.content||'')}</p>`).join('')}
                </details>
              ` : ''}
            </div>
          </div>
        `;
        const toggle = el('context').querySelector('#og-compact-toggle');
        if (toggle) {
          toggle.onclick = () => {
            const drawer = el('context').querySelector('#og-compact-drawer');
            if (drawer) {
              drawer.hidden = !drawer.hidden;
              toggle.setAttribute('aria-expanded', String(!drawer.hidden));
            }
          };
        }
      } else {
        el('context').innerHTML = t ? `
          <div class="og-ticket-heading">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="og-source" style="margin:0;font-weight:700;">${escape(t.reference)} · ${escape(t.department)}</span>
              <span class="og-status-pill">${escape(statusLabel)}</span>
              ${t.priority === 'high' || t.priority === 'critical' ? `<span style="font-size:10px;font-weight:800;padding:4px 8px;border-radius:99px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;">⚡ ${escape(priorityText.toUpperCase())}</span>` : ''}
            </div>
          </div>
          <h2 style="font-size:16.5px;font-weight:700;line-height:1.35;margin:8px 0 10px;color:#183626;word-break:break-word;">${escape(t.title)}</h2>
          <div class="og-route-card">
            <div class="og-route-person">
              <span class="og-mini-avatar">${escape(t.assigned_name?.slice(0,1)||'✦')}</span>
              <div>
                <strong>${escape(t.assigned_name || (t.status==='ai_attempted'?'Self-service guidance':'Queued for a specialist'))}</strong>
                <small>${escape(t.assigned_tier||t.department)}${t.assigned_name?` · ${t.assigned_connected?'Active in OneGate':'Not currently in live chat'} · ${escape(t.assigned_presence || 'online')}`:''}</small>
              </div>
            </div>
            <p style="font-size:12px;margin:8px 0 6px;"><strong>${escape(priorityText)}</strong> · ${escape(t.priority_reason||'Standard request')}</p>
            <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
              <p id="og-eta" aria-live="off" style="margin:0;">${escape(etaDisplay)}</p>
              ${!['resolved','ai_attempted','waiting_on_user'].includes(t.status)&&t.awaiting_staff_reply!==false?`
                <span class="og-deadline-help">
                  <button type="button" class="og-info-button" style="width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;padding:0;font-size:11px;" aria-label="What happens if the reply target is missed?" aria-describedby="og-deadline-tip">i</button>
                  <span class="og-deadline-tip" id="og-deadline-tip" role="tooltip">If no specialist replies by the end of this window, OneGate automatically routes this same request to ${escape(t.escalation_destination||'a senior specialist')}. If no senior is available, it stays in the senior queue. Your history is preserved.</span>
                </span>
              `:''}
            </div>
            <div class="og-route-steps">
              <span class="is-done">● Request saved</span>
              <span class="${t.assigned_to?'is-done':'is-current'}">${t.assigned_to?'● Assigned':'○ In queue'}</span>
              <span class="${t.status==='resolved'?'is-done':''}">${t.status==='resolved'?'● Resolved':'○ In triage'}</span>
            </div>
            ${employee ? `
              <div class="og-card-actions">
                ${t.status !== 'resolved' ? `
                  <button type="button" data-add-details="true">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>
                    <span>Add details</span>
                  </button>
                  <button type="button" data-action="priority">⚡ Change priority</button>
                  <button type="button" data-action="reroute">⇄ Wrong team?</button>
                ` : `
                  <button type="button" data-action="reopen" style="background:#fef2f2;border-color:#fecaca;color:#991b1b;">↩ It’s not fixed (Reopen)</button>
                  <button type="button" data-action="feedback" style="background:#f0fdf4;border-color:#bbf7d0;color:#166534;">★ Rate support</button>
                `}
              </div>
            ` : ''}
            ${t.routing_explanation ? `
              <details class="og-routing-why" style="margin-top:10px;padding-top:8px;border-top:1px solid #dae5d4;font-size:11px;">
                <summary style="cursor:pointer;font-weight:600;color:#355c41;">Why this team?</summary>
                <p style="margin:4px 0 0;font-size:11px;color:#5a7364;line-height:1.5;">${escape(t.routing_explanation)}</p>
              </details>
            ` : ''}
          </div>
          ${t.resolution_summary ? `<div class="og-resolution"><strong>What was fixed</strong><p>${escape(t.resolution_summary)}</p></div>` : ''}
          <details class="og-timeline">
            <summary>Request timeline · ${(t.timeline||[]).length} ${(t.timeline||[]).length === 1 ? 'update' : 'updates'}</summary>
            ${(t.timeline||[]).map(e=>`<p><strong>${escape(e.type.replaceAll('_',' '))}</strong><span>${escape(PS18.formatTime(e.timestamp))}</span><br>${escape(e.content||'')}</p>`).join('')||'<p>No updates yet.</p>'}
          </details>
        ` : `<div class="og-ticket-heading"><div><h2>Ask OneGate <span class="og-ai-badge">AI + people</span></h2><p>Your workday, without the runaround.</p></div><button id="og-new" class="og-btn-new-q" type="button" aria-label="Ask an unrelated question"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg><span>New question</span></button></div>`;
      }
      el('compose').hidden = !!t && t.status === 'resolved' || !employee && !t;
      if(!t&&!employee)el('context').innerHTML='<h2>Request workspace</h2><p>Select a request from the sidebar to read the conversation and take the next step.</p>';
      if(t&&!employee){
        const card=el('context').querySelector('.og-route-card');
        if(t.status==='waiting_on_user')el('context').querySelector('.og-status-pill').textContent='↩ Waiting on employee';
        if(t.resolution_type==='dismissed'){el('context').querySelector('.og-status-pill').textContent='Closed without a fix';const label=el('context').querySelector('.og-resolution strong');if(label)label.textContent='Closure reason';}
        if(card){
          card.querySelector('.og-route-person').innerHTML=`<span class="og-mini-avatar">${escape((t.employee_name||'E').slice(0,1))}</span><div><strong>${escape(t.employee_name||'Employee')}</strong><small>${escape(t.employee_department||'')} · Submitted this request</small></div>`;
          card.insertAdjacentHTML('afterbegin','<span class="og-eyebrow">INCOMING EMPLOYEE REQUEST</span>');
        }
        el('context').querySelector('.og-route-steps').innerHTML=`<span>Assigned to ${escape(t.assigned_name||'the queue')}</span><span>Full history below</span>`;
        el('context').scrollTop=0;
        el('messages').setAttribute('aria-label','Full employee conversation history');
        const close=el('actions').querySelector('[data-action="dismiss"]');if(close)close.textContent='Dismiss / close';
      }
      if (employee) {
        el('actions').style.display = 'none';
        el('actions').innerHTML = '';
      } else {
        el('actions').style.display = 'flex';
        el('actions').innerHTML = (t?.allowed_actions || []).filter(a => a !== 'reply').map(a => `<button type="button" data-action="${a}">${escape({ waiting_on_user:'Request information', resolve:'Resolve', escalate:'Escalate', reopen:'It’s not fixed', priority:'Change priority', feedback:'Rate support' }[a] || a)}</button>`).join('');
      }
      if (t?.status === 'ai_attempted' && employee) el('actions').innerHTML += '<button data-ai="confirm">It worked</button><button data-ai="escalate">I still need help</button>';
      if (t) renderMessages(t.transcript);
      else renderMessages(chatHistory);
      if(t&&!employee){
        el('actions').insertAdjacentHTML('beforeend',`
          <details class="og-assist" open>
            <summary style="font-weight:800;color:#284d77;display:flex;align-items:center;gap:6px;cursor:pointer;">
              <span>🤖 Specialist AI Co-Pilot</span>
              <span style="font-size:10px;background:#dbe8fa;color:#1e40af;padding:2px 7px;border-radius:99px;font-weight:700;">Triage Assistant</span>
            </summary>
            <p style="font-size:11.5px;color:#536d8b;margin:6px 0 10px;">Automated case analysis, handbook policy alignment, and editable reply generator.</p>
            <button type="button" id="og-assist-run" style="padding:9px 14px;background:#2563eb;color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;">Generate Case Summary & Draft</button>
            <div id="og-assist-result" role="status"></div>
          </details>
        `);
        el('assist-run').onclick=async()=>{
          const ticketId=t.id,button=el('assist-run');button.disabled=true;button.textContent='Reading request & policy handbooks…';
          try{
            const result=await PS18.request(`/tickets/${ticketId}/assist`,{method:'POST',body:'{}'});
            if(disposed||selected?.id!==ticketId)return;
            el('assist-result').innerHTML=`
              <div class="og-assist-result">
                ${result.limitations ? `<div style="font-size:11px;background:#fef3c7;border:1px solid #fde68a;color:#92400e;padding:6px 10px;border-radius:8px;margin-bottom:8px;">⚠️ <strong>Policy Notice:</strong> ${escape(result.limitations)}</div>` : ''}
                <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#475569;margin-bottom:4px;">Executive Summary</div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:8px 10px;border-radius:8px;font-size:12px;margin-bottom:10px;">${PS18.md(result.summary)}</div>
                <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#475569;margin-bottom:4px;">Suggested Reply</div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:8px 10px;border-radius:8px;font-size:12px;margin-bottom:10px;">${PS18.md(result.draft)}</div>
                <div class="og-assist-actions">
                  <button type="button" id="og-assist-use" style="background:#16a34a;color:white;border:none;">✍️ Use draft in reply box</button>
                  <button type="button" id="og-assist-copy" style="background:#ffffff;border:1px solid #cbd5e1;color:#1e293b;">📋 Copy draft</button>
                </div>
              </div>
            `;
            el('assist-use').onclick=()=>{el('draft').value=result.draft;el('draft').focus();PS18.showToast('Draft inserted into reply box','info');};
            el('assist-copy').onclick=()=>{navigator.clipboard.writeText(result.draft);PS18.showToast('Draft copied to clipboard','success');};
          }catch(e){error(e);}finally{button.disabled=false;button.textContent='Regenerate Summary & Draft';}
        };
      }
      el('messages').scrollTop=el('messages').scrollHeight;
      requestAnimationFrame(() => { el('messages').scrollTop=el('messages').scrollHeight; });
      suggestions();
    };
    const refresh = async () => {
      if (loading || disposed) return; loading = true;
      try {
        const result = await PS18.request('/tickets?limit=100');
        if (disposed) return;
        tickets = result.tickets; renderList();
        if (employee) {
          const history = await PS18.request(`/chat/conversation/${encodeURIComponent(user.id)}?conversationId=${encodeURIComponent(conversationId)}`);
          if (!disposed) { chatHistory = history.messages || history; }
        }
        if (selected) showTicket(tickets.find(t => t.id === selected.id) || null);
        else if (!employee) showTicket(tickets.find(t=>t.status!=='resolved')||null);
        else if (employee) renderMessages(chatHistory);
      } catch(e) { error(e); } finally { loading = false; }
    };
    const overview = async () => {
      const [data,workflowData] = await Promise.all([PS18.request('/pilot/dashboard'),PS18.request('/workplace/actions')]);
      if (disposed) return;
      el('overview').hidden = false;
      container.querySelector('.og-grid').hidden = true;
      const allStaff = data.departments.flatMap(d => d.staff);
      const onlineStaff = allStaff.filter(s => s.status === 'online').length;
      const totalStaff = allStaff.length;
      const avgCsat = data.csat && data.csat.length ? (data.csat.reduce((sum, f) => sum + (f.rating || 5), 0) / data.csat.length).toFixed(1) : null;

      el('overview').innerHTML = `
        <div class="og-overview-header" style="margin-bottom:18px;">
          <span class="og-eyebrow">TELEMETRY & OPERATIONS</span>
          <h2>${escape(user.role === 'main_manager' ? 'Organization-Wide Department Oversight' : `${user.department} Operations Console`)}</h2>
          <p style="font-size:13px;color:#607b70;margin-top:4px;">${escape(user.role === 'main_manager' ? 'Live cross-departmental queue health and specialist capacity across all 11 departments.' : `Operational performance and specialist availability for ${user.department}.`)}</p>
        </div>

        <div class="og-scorecards-grid">
          <div class="og-scorecard">
            <div class="og-scorecard-header">
              <span class="og-scorecard-label">Active Triage</span>
              <span style="display:flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:${data.open > 0 ? '#b45309' : '#15803d'};">
                <span class="og-presence-dot ${data.open > 0 ? 'away' : 'online'}"></span>${data.open > 0 ? 'Active Queue' : 'Queue Clear'}
              </span>
            </div>
            <div class="og-scorecard-num">${data.open}</div>
            <div class="og-scorecard-sub">${data.open === 1 ? '1 active ticket requiring triage' : `${data.open} active tickets requiring triage`}</div>
          </div>

          <div class="og-scorecard">
            <div class="og-scorecard-header">
              <span class="og-scorecard-label">Resolved</span>
              <span style="font-size:10px;font-weight:700;color:#15803d;">✓ Lifetime</span>
            </div>
            <div class="og-scorecard-num">${data.resolved}</div>
            <div class="og-scorecard-sub">${data.resolved === 0 ? 'No resolved tickets yet' : `${data.resolved} requests fulfilled`}</div>
          </div>

          <div class="og-scorecard">
            <div class="og-scorecard-header">
              <span class="og-scorecard-label">Specialist Staffing</span>
              <span style="font-size:10px;font-weight:700;color:#0369a1;">Live Shift</span>
            </div>
            <div class="og-scorecard-num">${onlineStaff} <span style="font-size:16px;font-weight:600;color:#73887a;">/ ${totalStaff}</span></div>
            <div class="og-scorecard-sub">${totalStaff ? Math.round((onlineStaff/totalStaff)*100) : 0}% specialists active on duty</div>
          </div>

          <div class="og-scorecard">
            <div class="og-scorecard-header">
              <span class="og-scorecard-label">Satisfaction CSAT</span>
              <span style="font-size:10px;font-weight:700;color:#d97706;">★ Verified</span>
            </div>
            <div class="og-scorecard-num">${avgCsat ? `${avgCsat} <span style="font-size:18px;">★</span>` : '—'}</div>
            <div class="og-scorecard-sub">${data.csat.length ? `${data.csat.length} verified ratings submitted` : 'Awaiting initial employee ratings'}</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin:24px 0 12px;">
          <div>
            <h3 style="font-size:18px;margin:0;color:#183626;">Department Operational Health</h3>
            <p style="font-size:12px;color:#73887a;margin:3px 0 0;">${user.role === 'main_manager' ? 'Specialist load distribution across all 11 enterprise departments' : `Active personnel and ticket assignment in ${user.department}`}</p>
          </div>
        </div>

        <div class="og-dept-grid">
          ${data.departments.map(d => {
            const deptOnline = d.staff.filter(s => s.status === 'online').length;
            const maxCap = Math.max(1, d.staff.length * 5);
            const loadPct = Math.min(100, Math.round((d.open / maxCap) * 100));
            return `
              <div class="og-dept-card">
                <div class="og-dept-header">
                  <div class="og-dept-title">${escape(d.department)}</div>
                  <span class="og-dept-badge">${d.open} active · ${deptOnline}/${d.staff.length} staff</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:10.5px;color:#6b8273;">
                  <span>Queue Load</span>
                  <span>${loadPct}% Capacity</span>
                </div>
                <div class="og-dept-loadbar">
                  <div class="og-dept-loadbar-fill" style="width:${loadPct}%;background:${loadPct > 75 ? '#dc2626' : loadPct > 40 ? '#ea580c' : 'linear-gradient(90deg,#3b7952,#1b4e34)'};"></div>
                </div>
                <div class="og-staff-list">
                  ${d.staff.length ? d.staff.map(s => `
                    <div class="og-staff-chip">
                      <div style="display:flex;align-items:center;">
                        <span class="og-presence-dot ${escape(s.status || 'offline')}"></span>
                        <strong>${escape(s.name)}</strong>
                        <span style="font-size:10px;color:#73887a;margin-left:6px;">· ${escape(s.tier)}</span>
                      </div>
                      <span style="font-size:10.5px;font-weight:700;color:${s.load > 0 ? '#b45309' : '#15803d'};">${s.load} assigned</span>
                    </div>
                  `).join('') : '<p style="font-size:11.5px;color:#94a3b8;font-style:italic;padding:6px 0;">No specialists provisioned in this department.</p>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <section class="og-approval-queue" aria-labelledby="og-approval-title">
          <div class="og-approval-queue-head"><div><span class="og-eyebrow">EMPLOYEE OPERATIONS</span><h3 id="og-approval-title">Approvals waiting for you</h3></div><span>${workflowData.actions.filter(a=>a.status==='pending').length} pending</span></div>
          <div class="og-approval-items">${workflowData.actions.length?workflowData.actions.slice(0,12).map(a=>`<article class="og-approval-item" data-status="${escape(a.status)}"><div><small>${escape(a.type.replaceAll('_',' '))} · ${escape(a.department)}</small><strong>${escape(a.user_name)}</strong><p>${escape(a.summary)}</p><span>Submitted ${escape(PS18.formatTime(a.submitted_at))} · visible to ${escape((a.viewers||[]).join(' and '))}</span></div><div><b>${escape(a.status)}</b>${a.can_decide?`<button type="button" data-workflow-decision="approved" data-workflow-id="${escape(a.id)}">Approve</button><button type="button" data-workflow-decision="denied" data-workflow-id="${escape(a.id)}">Decline</button>`:''}</div></article>`).join(''):'<p class="og-empty">No employee operation requests are waiting.</p>'}</div>
        </section>
      `;
      el('overview').querySelector('.og-approval-queue')?.addEventListener('click',async event=>{
        const button=event.target.closest('[data-workflow-decision]');if(!button)return;
        const notes=prompt(`${button.dataset.workflowDecision==='approved'?'Approval':'Decline'} note (optional)`)||'';button.disabled=true;
        try{await PS18.request(`/workplace/actions/${button.dataset.workflowId}`,{method:'PATCH',body:JSON.stringify({decision:button.dataset.workflowDecision,notes})});PS18.showToast(`Request ${button.dataset.workflowDecision}`,'success');await overview();}catch(err){error(err);button.disabled=false;}
      });
    };
    let calendarMonth = new Date(), calViewRange = '30d', calStaffFilter = 'all', selectedCalDate = new Date().toISOString().slice(0, 10), workplaceActionFilter='all';
    const workplace = async view => {
      const [data, demoSchedule, actionData] = await Promise.all([PS18.request('/workplace'),PS18.request('/workplace/demo-schedule'),PS18.request('/workplace/actions')]); if (disposed) return;
      const panel = el('overview'); panel.hidden = false;
      container.querySelector('.og-grid').hidden = true;
      const labels = {holidays:'Holiday calendar',announcements:'Announcements',menus:'Cafeteria',parking:'Parking',transport:'Transportation',rooms:'Meetings',navigation:'Office navigation'};
      const tomorrow=demoSchedule.date, demoModules={
        holidays:[{id:'demo-holiday',title:'Founders Day',description:'Optional company celebration with the office closing at 3:00 PM.',date:`${tomorrow.slice(0,8)}24`,demo:true}],
        announcements:[{id:'demo-announcement',title:'Quarterly town hall',description:'Join the leadership Q&A in the Atrium at 4:00 PM. A recording will be shared afterwards.',date:tomorrow,demo:true}],
        menus:demoSchedule.cafeteria.map(menu=>({id:menu.id,title:menu.title,description:`${menu.time} · ${menu.detail}`,date:tomorrow,dietary_labels:menu.dietary_labels,demo:true})),
        parking:[{id:'demo-parking',title:'Visitor parking · Garage A',description:'12 presentation spaces available near the main lobby. Register the vehicle at reception.',capacity:12,demo:true}],
        transport:demoSchedule.transport.map((ride,index)=>({id:`demo-transport-${index}`,title:`${ride.time} · ${ride.title}`,description:`${ride.stop} · ${ride.detail} · ${ride.seats}`,date:tomorrow,demo:true})),
        rooms:[{id:'demo-room',title:'Orchid collaboration room',description:'Floor 3 · 8 seats · display, whiteboard and video conferencing.',capacity:8,demo:true},{id:'demo-room-2',title:'Atrium focus room',description:'Floor 2 · 4 seats · quiet room with accessible seating.',capacity:4,demo:true}],
        navigation:[{id:'demo-navigation',title:'Reception to Innovation Lab',description:'Enter through Gate 2, pass reception and take Lift B to Floor 4.',directions:'Gate 2 → Reception → Lift B → Floor 4',accessible_directions:'Step-free route via Lift B; accessible entrance beside Gate 2.',demo:true}],
      };
      const rowsFor=key=>(data.modules[key]||[]).length?data.modules[key]:demoModules[key];
      const demoActions=[
        {id:'DEMO-LEAVE-2048',type:'hr.apply_leave',label:'Annual leave',summary:'Paid time off · 14 Oct to 16 Oct',status:'approved',approver_name:'Tarrush Saxena',owner_team:'HR',viewers:['Your department manager','HR'],submitted_at:new Date(Date.now()-3*86400000).toISOString(),decided_at:new Date(Date.now()-2*86400000).toISOString(),values:{leaveType:'pto',startDate:'2026-10-14',endDate:'2026-10-16',reason:'Family event'},demo:true},
        {id:'DEMO-EXP-7312',type:'finance.submit_expense_claim',label:'Expense claim',summary:'Travel · ₹1,250 · 01 Oct 2026',status:'pending',approver_name:'Tarrush Saxena',owner_team:'Finance',viewers:['Your department manager','Finance'],submitted_at:new Date(Date.now()-5*3600000).toISOString(),values:{amount:1250,expenseDate:'2026-10-01',category:'Travel',reason:'Client visit'},demo:true},
        {id:'DEMO-ID-4107',type:'facilities.report_lost_id',label:'Lost ID card report',summary:'ID card · last seen at the cafeteria',status:'submitted',priority:'critical',approver_name:'Immediate security response',owner_team:'Facilities Security',viewers:['Your department manager','Facilities Security'],submitted_at:new Date(Date.now()-70*60000).toISOString(),values:{lastSeen:'2026-10-06T12:20',reason:'Badge may have been left near the cafeteria'},demo:true},
      ];
      const liveActions=actionData.actions||[], actions=liveActions.length?liveActions:demoActions;

      const renderCal = () => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const monthName = calendarMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayIndex = new Date(year, month, 1).getDay();

        let dayList = [];
        if (calViewRange === '30d') {
          for (let d = 1; d <= daysInMonth; d++) dayList.push(d);
        } else if (calViewRange === '15d') {
          const startDay = new Date(selectedCalDate).getDate() <= 15 ? 1 : 16;
          const endDay = startDay === 1 ? 15 : daysInMonth;
          for (let d = startDay; d <= endDay; d++) dayList.push(d);
        } else if (calViewRange === '7d') {
          const curDate = new Date(selectedCalDate);
          const dayOfWeek = curDate.getDay();
          const start = new Date(curDate);
          start.setDate(curDate.getDate() - dayOfWeek);
          for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            dayList.push(d);
          }
        }

        const isRange7 = calViewRange === '7d';
        const roster = data.staffRoster || [];
        const holidays = data.modules.holidays || [];
        const attendance = data.attendance || [];
        const bookings = data.bookings || [];

        const selectedStr = selectedCalDate;
        const selDayHolidays = holidays.filter(h => h.date === selectedStr);
        const selDayJoiners = roster.filter(r => r.joined_at && r.joined_at.slice(0, 10) === selectedStr);
        const selDayAttendance = attendance.filter(a => a.day === selectedStr);
        const selDayBookings = bookings.filter(b => b.start && b.start.slice(0, 10) === selectedStr && b.status !== 'cancelled');

        const filteredRoster = roster.filter(s => {
          if (calStaffFilter === 'support') return s.role === 'support_executive';
          if (calStaffFilter === 'company') return s.role === 'employee';
          if (calStaffFilter === 'leaves') return selDayAttendance.some(a => a.user_id === s.id && a.status === 'leave');
          return true;
        });

        const dayCells = isRange7 ? dayList.map(dt => {
          const dStr = dt.toISOString().slice(0, 10);
          const dNum = dt.getDate();
          const hols = holidays.filter(h => h.date === dStr);
          const joins = roster.filter(r => r.joined_at && r.joined_at.slice(0, 10) === dStr);
          const leaves = attendance.filter(a => a.day === dStr && a.status === 'leave');
          const bks = bookings.filter(b => b.start && b.start.slice(0, 10) === dStr && b.status !== 'cancelled');
          const isSel = dStr === selectedCalDate;
          const isToday = dStr === new Date().toISOString().slice(0, 10);

          return `
            <div class="og-cal-cell ${isSel ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}" data-cal-date="${dStr}">
              <div class="og-cal-cell-day">${dt.toLocaleDateString('en-IN', { weekday: 'short' })} ${dNum}</div>
              ${hols.map(h => `<span class="og-cal-pill holiday">🏛️ ${escape(h.title)}</span>`).join('')}
              ${joins.map(j => `<span class="og-cal-pill joined">🎉 ${escape(j.name)} joined</span>`).join('')}
              ${leaves.length ? `<span class="og-cal-pill leave">🏖️ ${leaves.length} on leave</span>` : ''}
              ${bks.length ? `<span class="og-cal-pill room">📅 ${bks.length} booking${bks.length>1?'s':''}</span>` : ''}
            </div>
          `;
        }).join('') : [
          ...Array(calViewRange === '30d' ? firstDayIndex : 0).fill('<div class="og-cal-cell" style="opacity:0.25;background:transparent;border-style:dashed;cursor:default;"></div>'),
          ...dayList.map(dNum => {
            const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
            const hols = holidays.filter(h => h.date === dStr);
            const joins = roster.filter(r => r.joined_at && r.joined_at.slice(0, 10) === dStr);
            const leaves = attendance.filter(a => a.day === dStr && a.status === 'leave');
            const bks = bookings.filter(b => b.start && b.start.slice(0, 10) === dStr && b.status !== 'cancelled');
            const isSel = dStr === selectedCalDate;
            const isToday = dStr === new Date().toISOString().slice(0, 10);

            return `
              <div class="og-cal-cell ${isSel ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}" data-cal-date="${dStr}">
                <div class="og-cal-cell-day">${dNum}</div>
                ${hols.map(h => `<span class="og-cal-pill holiday">🏛️ ${escape(h.title)}</span>`).join('')}
                ${joins.map(j => `<span class="og-cal-pill joined">🎉 ${escape(j.name)} joined</span>`).join('')}
                ${leaves.length ? `<span class="og-cal-pill leave">🏖️ ${leaves.length} leave</span>` : ''}
                ${bks.length ? `<span class="og-cal-pill room">📅 ${bks.length} mtg</span>` : ''}
              </div>
            `;
          })
        ].join('');

        panel.innerHTML = `
          <div class="og-calendar-wrap">
            <div class="og-overview-header">
              <span class="og-eyebrow">WORKPLACE DIRECTORY & SCHEDULE</span>
              <h2>${monthName} Calendar</h2>
              <p style="font-size:13px;color:#607b70;margin-top:4px;">Choose a date to see workplace events, team availability and tomorrow’s cafeteria and shuttle schedule.</p>
            </div>

            <section class="og-demo-schedule" aria-labelledby="og-demo-schedule-title">
              <div class="og-demo-heading"><div><span class="og-eyebrow">TOMORROW AT WORK</span><h3 id="og-demo-schedule-title">${new Date(`${demoSchedule.date}T12:00:00+05:30`).toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</h3></div><span class="og-demo-badge">DEMO SCHEDULE</span></div>
              <div class="og-demo-columns">
                <section class="og-demo-group"><h4>☕ Cafeteria</h4>${demoSchedule.cafeteria.map(menu=>`<article class="og-demo-item"><div class="og-demo-item-head"><strong>${escape(menu.title)}</strong><span>${escape(menu.time)}</span></div><p>${escape(menu.detail)}</p><div class="og-demo-menu-items">${menu.items.map(item=>`<span>${escape(item)}</span>`).join('')}</div><div class="og-demo-item-foot"><span>${menu.dietary_labels.map(label=>`<i>${escape(label)}</i>`).join('')}</span><button type="button" data-demo-qr="${escape(menu.id)}">Show meal QR</button></div><div id="og-demo-qr-${escape(menu.id)}" class="og-demo-qr-result" aria-live="polite"></div></article>`).join('')}</section>
                <section class="og-demo-group"><h4>🚌 Shuttle times</h4><div class="og-demo-transit-list">${demoSchedule.transport.map(ride=>`<article class="og-demo-transit"><time>${escape(ride.time)}</time><div><strong>${escape(ride.title)}</strong><span>${escape(ride.stop)} · ${escape(ride.detail)}</span></div><small>${escape(ride.seats)}</small></article>`).join('')}</div><p class="og-demo-note">Sample routes and seat counts for the presentation.</p></section>
              </div>
              <p class="og-demo-disclaimer">Demo information · Meal QR codes are samples and cannot be redeemed. No reservation is created.</p>
            </section>

            <div class="og-calendar-bar">
              <div style="display:flex;align-items:center;gap:8px;">
                <button class="btn-glass" data-month="-1" style="padding:6px 12px;font-size:12px;cursor:pointer;">← Prev</button>
                <strong style="font-size:14px;color:#183626;min-width:130px;text-align:center;">${monthName}</strong>
                <button class="btn-glass" data-month="1" style="padding:6px 12px;font-size:12px;cursor:pointer;">Next →</button>
              </div>

              <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <div class="og-cal-btn-group" role="group" aria-label="View Range">
                  <button type="button" class="og-cal-btn ${calViewRange === '30d' ? 'active' : ''}" data-range="30d">30 Days</button>
                  <button type="button" class="og-cal-btn ${calViewRange === '15d' ? 'active' : ''}" data-range="15d">15 Days</button>
                  <button type="button" class="og-cal-btn ${calViewRange === '7d' ? 'active' : ''}" data-range="7d">7 Days</button>
                </div>

                <div class="og-cal-btn-group" role="group" aria-label="Staff Filter">
                  <button type="button" class="og-cal-btn ${calStaffFilter === 'all' ? 'active' : ''}" data-filter-staff="all">All Staff</button>
                  <button type="button" class="og-cal-btn ${calStaffFilter === 'support' ? 'active' : ''}" data-filter-staff="support">Support</button>
                  <button type="button" class="og-cal-btn ${calStaffFilter === 'company' ? 'active' : ''}" data-filter-staff="company">Company</button>
                  <button type="button" class="og-cal-btn ${calStaffFilter === 'leaves' ? 'active' : ''}" data-filter-staff="leaves">Leaves</button>
                </div>
              </div>
            </div>

            <div class="og-calendar-grid">
              <div class="og-cal-head">Sun</div>
              <div class="og-cal-head">Mon</div>
              <div class="og-cal-head">Tue</div>
              <div class="og-cal-head">Wed</div>
              <div class="og-cal-head">Thu</div>
              <div class="og-cal-head">Fri</div>
              <div class="og-cal-head">Sat</div>
              ${dayCells}
            </div>

            <!-- Selected Day Detail Drawer -->
            <div class="og-cal-drawer">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div>
                  <span class="og-eyebrow">DAILY WORKPLACE ROSTER</span>
                  <h3 style="font-size:18px;margin:2px 0 0;color:#183626;">${new Date(selectedCalDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
                </div>
                <span class="og-status-pill">${selDayHolidays.length ? '🏛️ Company Holiday' : 'Standard Working Day'}</span>
              </div>

              ${selDayHolidays.map(h => `
                <div style="padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;margin-bottom:12px;">
                  <strong style="color:#991b1b;font-size:13px;">🏛️ ${escape(h.title)}</strong>
                  <p style="margin:4px 0 0;font-size:12px;color:#7f1d1d;">${escape(h.description)}</p>
                </div>
              `).join('')}

              ${selDayJoiners.map(j => `
                <div style="padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:12px;">
                  <strong style="color:#166534;font-size:13px;">🎉 New Joiner — First Day at Company</strong>
                  <p style="margin:4px 0 0;font-size:12px;color:#14532d;">${escape(j.name)} joined on this day as <strong>${escape(j.role === 'support_executive' ? `Support Specialist (${j.tier || 'L1'})` : j.role === 'department_manager' ? 'Department Manager' : 'Employee')}</strong> in ${escape(j.department)}.</p>
                </div>
              `).join('')}

              <div class="og-cal-drawer-section">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                  <h4 style="font-size:13px;margin:0;color:#183626;text-transform:uppercase;letter-spacing:0.04em;">
                    Staff Attendance & Directory (${filteredRoster.length} listed)
                  </h4>
                  <span style="font-size:11px;color:#6b8273;">Filter: <strong>${calStaffFilter}</strong></span>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:8px;">
                  ${filteredRoster.map(s => {
                    const att = selDayAttendance.find(a => a.user_id === s.id);
                    const status = att ? att.status : 'present_office';
                    const isJoinDay = s.joined_at && s.joined_at.slice(0, 10) === selectedCalDate;
                    const isSupport = s.role === 'support_executive';

                    return `
                      <div style="padding:9px 12px;background:#ffffff;border:1px solid #e2ecdf;border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <div style="min-width:0;flex:1;">
                          <div style="font-size:12.5px;font-weight:700;color:#183626;display:flex;align-items:center;gap:6px;">
                            <span>${escape(s.name)}</span>
                            ${isJoinDay ? '<span style="font-size:10px;background:#dcfce7;color:#15803d;padding:1px 5px;border-radius:4px;font-weight:800;">NEW</span>' : ''}
                          </div>
                          <div style="font-size:10.5px;color:#6b8273;margin-top:2px;">
                            ${isSupport ? `<span style="color:#0284c7;font-weight:700;">Support (${s.tier || 'L1'})</span>` : 'Company Staff'} · ${escape(s.department)}
                          </div>
                          ${s.joined_at ? `<div style="font-size:9.5px;color:#94a3b8;margin-top:2px;">Joined: ${new Date(s.joined_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>` : ''}
                        </div>
                        <span style="font-size:10.5px;font-weight:700;padding:3px 7px;border-radius:6px;background:${status==='leave'?'#fef3c7':status==='pending_verification'?'#fff7ed':'#f0fdf4'};color:${status==='leave'?'#92400e':status==='pending_verification'?'#c2410c':'#166534'};border:1px solid ${status==='leave'?'#fde68a':status==='pending_verification'?'#ffedd5':'#bbf7d0'};white-space:nowrap;">
                          ${status === 'leave' ? '🏖️ On Leave' : status === 'pending_verification' ? '⏱ Pending' : '🏢 In Office'}
                        </span>
                      </div>
                    `;
                  }).join('') || '<p style="font-size:12px;color:#94a3b8;font-style:italic;">No staff members match this filter.</p>'}
                </div>
              </div>

              ${selDayBookings.length ? `
                <div class="og-cal-drawer-section">
                  <h4 style="font-size:13px;margin:0 0 10px;color:#183626;text-transform:uppercase;letter-spacing:0.04em;">Scheduled Meetings & Rooms (${selDayBookings.length})</h4>
                  <div style="display:flex;flex-direction:column;gap:6px;">
                    ${selDayBookings.map(b => `
                      <div style="padding:8px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;font-size:12px;display:flex;justify-content:space-between;align-items:center;">
                        <div><strong>${escape(b.title)}</strong> <span style="color:#0284c7;font-size:11px;">(${new Date(b.start).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })} - ${new Date(b.end).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })})</span></div>
                        <span style="font-size:10px;font-weight:700;color:#0369a1;">${escape(b.status)}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      };

      if (view === 'calendar') {
        renderCal();
      } else if(view==='actions') {
        const filtered=actions.filter(action=>workplaceActionFilter==='all'||(workplaceActionFilter==='active'?['pending','submitted'].includes(action.status):action.status===workplaceActionFilter));
        const counts={all:actions.length,active:actions.filter(action=>['pending','submitted'].includes(action.status)).length,approved:actions.filter(action=>action.status==='approved').length,denied:actions.filter(action=>action.status==='denied').length};
        panel.innerHTML=`<div class="og-actions-page"><header class="og-actions-hero"><div><span class="og-eyebrow">INTELLIGENT ACTIONS</span><h2>Everything you’ve submitted</h2><p>Track leave, expenses and security requests without leaving OneGate.</p></div><div class="og-actions-summary"><strong>${counts.active}</strong><span>awaiting action</span></div></header>${!liveActions.length?'<p class="og-demo-strip"><b>Presentation demo</b> These sample actions show how employee submissions will appear.</p>':''}<div class="og-actions-filters" role="group" aria-label="Filter intelligent actions">${[['all','All'],['active','In progress'],['approved','Approved'],['denied','Declined']].map(([id,label])=>`<button type="button" data-action-filter="${id}" aria-pressed="${workplaceActionFilter===id}">${label}<span>${counts[id]}</span></button>`).join('')}</div><div class="og-action-history">${filtered.map(action=>`<details class="og-action-history-card" data-status="${escape(action.status)}" ${filtered.length===1?'open':''}><summary><span class="og-action-kind">${action.type.startsWith('hr.')?'◷':action.type.startsWith('finance.')?'₹':'!'}</span><span><small>${escape(action.owner_team||action.type.split('.')[0])}${action.demo?' · DEMO':''}</small><strong>${escape(action.label)}</strong><em>${escape(action.summary)}</em></span><span class="og-action-state">${escape(action.status==='submitted'?'Team alerted':action.status.replaceAll('_',' '))}</span></summary><div class="og-action-history-detail"><div><b>Submitted</b><span>${escape(PS18.formatTime(action.submitted_at))}</span></div><div><b>${action.status==='submitted'?'Response owner':'Approver'}</b><span>${escape(action.approver_name||'Organization leadership')}</span></div><div><b>Visible to</b><span>${escape((action.viewers||[]).join(' · '))}</span></div><div><b>Reference</b><span>${escape(action.id)}</span></div>${action.decision_notes?`<p><b>Decision note</b>${escape(action.decision_notes)}</p>`:''}</div></details>`).join('')||'<div class="og-actions-empty"><strong>No actions here yet</strong><p>Relevant actions will appear below policy answers in chat.</p></div>'}</div></div>`;
      } else {
        const month = calendarMonth.toISOString().slice(0,7);
        const keys = view === 'today' ? ['announcements','holidays'] : Object.keys(labels);
        panel.innerHTML = `<div class="og-services-page"><header class="og-services-hero"><span class="og-eyebrow">WORKPLACE SERVICES</span><h2>${view === 'today' ? 'Today at work' : 'Your workplace, in one place'}</h2><p>Useful information, spaces and services for your day.</p></header><div class="og-service-grid">${keys.map(key=>`<section class="og-service-group"><div class="og-service-group-head"><span>${({holidays:'◷',announcements:'⌁',menus:'☕',parking:'P',transport:'→',rooms:'□',navigation:'⌖'})[key]}</span><div><small>${labels[key]}</small><strong>${rowsFor(key).length} available</strong></div></div>${rowsFor(key).filter(r=>!r.date||r.date.startsWith(month)||r.demo).map(r=>`<article class="og-service"><div>${r.demo?'<span class="og-demo-tag">DEMO</span>':''}<h3>${escape(r.title)}</h3></div><p>${escape(r.description)}</p>${r.date?`<time>${escape(r.date)}</time>`:''}${key==='navigation'?`<p class="og-route">${escape(r.directions)}<br><b>Accessible:</b> ${escape(r.accessible_directions||'Not configured')}</p>`:''}${!r.demo&&key==='announcements'?`<button data-read="${escape(r.id)}">Mark read</button>`:''}${!r.demo&&['parking','transport','rooms'].includes(key)?`<button data-book="${escape(r.id)}" data-module="${key}">Reserve</button>`:''}${key==='menus'&&r.demo?`<button data-demo-qr="${escape(r.id)}">Show sample QR</button><div id="og-demo-qr-${escape(r.id)}"></div>`:key==='menus'?`<button data-meal="${escape(r.id)}">Get meal QR</button>`:''}</article>`).join('')}</section>`).join('')}</div><div class="og-workplace-bottom"><section><span class="og-eyebrow">ATTENDANCE</span><h3>${data.attendance.at(-1)?escape(data.attendance.at(-1).status.replaceAll('_',' ')):'Not checked in'}</h3><p>${data.attendance.at(-1)?escape(data.attendance.at(-1).day):'Submit a manual check-in if attendance automation is unavailable.'}</p><button data-attendance="true">Submit manual check-in</button></section><section><span class="og-eyebrow">MY RESERVATIONS</span>${data.bookings.filter(b=>b.user_id===user.id).map(b=>`<p><b>${escape(b.title)}</b><br>${escape(b.start)} · ${escape(b.status)} ${b.status!=='cancelled'?`<button data-cancel="${escape(b.id)}" data-version="${b.version}">Cancel</button>`:''}</p>`).join('') || '<h3>No upcoming reservations</h3><p>Room, parking and shuttle bookings will appear here.</p>'}</section></div><p class="og-demo-disclaimer">Presentation demo data is clearly marked. Sample controls do not create operational reservations.</p></div>`;
      }

      panel.onclick = async e => {
        const button = e.target.closest('button');
        const calCell = e.target.closest('[data-cal-date]');

        if (calCell) {
          selectedCalDate = calCell.dataset.calDate;
          renderCal();
          return;
        }

        if (!button) return;

        if(button.dataset.actionFilter){workplaceActionFilter=button.dataset.actionFilter;await workplace('actions');return;}

        if (button.dataset.range) {
          calViewRange = button.dataset.range;
          renderCal();
          return;
        }

        if (button.dataset.filterStaff) {
          calStaffFilter = button.dataset.filterStaff;
          renderCal();
          return;
        }

        if (button.dataset.month) {
          calendarMonth.setMonth(calendarMonth.getMonth() + Number(button.dataset.month));
          renderCal();
          return;
        }

        if (!['read','attendance','cancel','book','meal','demoQr'].some(key => button.dataset[key])) return;
        button.disabled = true;
        try {
          if(button.dataset.demoQr){
            const result=await PS18.request('/workplace/demo-meal-qr',{method:'POST',body:JSON.stringify({menuId:button.dataset.demoQr})});
            const mount=panel.querySelector(`#og-demo-qr-${CSS.escape(button.dataset.demoQr)}`);
            if(mount)mount.innerHTML=`<div class="og-demo-qr-card"><img src="${escape(result.qr)}" alt="Sample meal QR code. Not redeemable."><div><strong>Demo QR · not redeemable</strong><span>Generated for ${escape(result.date)}. It does not book a meal or change cafeteria records.</span></div></div>`;
            return;
          }
          if(button.dataset.read)await PS18.request(`/workplace/announcements/${button.dataset.read}/read`,{method:'POST',body:'{}'});
          if(button.dataset.attendance)await PS18.request('/workplace/attendance',{method:'POST',body:'{}'});
          if(button.dataset.cancel)await PS18.request(`/workplace/bookings/${button.dataset.cancel}/cancel`,{method:'POST',body:JSON.stringify({version:Number(button.dataset.version)})});
          if(button.dataset.book){const start=prompt('Start date/time (example: 2026-10-06T09:00:00+05:30)');if(!start)return;const end=prompt('End date/time');if(!end)return;if(!confirm('Confirm this reservation?'))return;await PS18.request('/workplace/bookings',{method:'POST',body:JSON.stringify({module:button.dataset.module,resource_id:button.dataset.book,start,end,confirm:true})});}
          if(button.dataset.meal){const result=await PS18.request('/workplace/meals/token',{method:'POST',body:JSON.stringify({menu_id:button.dataset.meal})});const img=document.createElement('img');img.src=result.qr;img.alt='Single-use meal QR, valid for 15 minutes';panel.appendChild(img);return;}
          await workplace(view);
        }catch(e){error(e);}finally{button.disabled=false;}
      };

      if(manager){
        const form=document.createElement('form');form.className='og-record-form';
        form.innerHTML=`<h3>Publish company information</h3><label>Module<select name="module">${Object.entries(labels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>Title<input name="title" required maxlength="160"></label><label>Details / menu / directions<textarea name="description" rows="3" maxlength="4000"></textarea></label><label>Date<input name="date" type="date"></label><label>Capacity (rooms, parking or transport)<input name="capacity" type="number" min="1" max="1000" value="1"></label><button type="submit">Publish</button>`;
        form.onsubmit=async e=>{e.preventDefault();const values=new FormData(form),button=form.querySelector('button');button.disabled=true;try{await PS18.request(`/workplace/records/${values.get('module')}`,{method:'POST',body:JSON.stringify({title:values.get('title'),description:values.get('description'),directions:values.get('description'),date:values.get('date'),capacity:Number(values.get('capacity'))})});await workplace(view);}catch(e){error(e);}finally{button.disabled=false;}};
        panel.appendChild(form);
        const attendance=document.createElement('section');attendance.innerHTML=`<h3>Attendance exceptions</h3>${data.attendance.filter(a=>a.status==='pending_verification').map(a=>`<p>${escape(a.user_id)} · ${escape(a.day)} <button data-review="${escape(a.id)}" data-version="${a.version}">Review</button></p>`).join('')||'<p>No pending exceptions.</p>'}`;
        attendance.onclick=async e=>{const b=e.target.closest('[data-review]');if(!b)return;const status=prompt('Status: present, absent, leave, holiday, pending_verification');if(!status)return;try{await PS18.request(`/workplace/attendance/${b.dataset.review}/review`,{method:'POST',body:JSON.stringify({version:Number(b.dataset.version),status})});await workplace(view);}catch(e){error(e);}};
        panel.appendChild(attendance);
      }
    };
    el('search').oninput = renderList;
    el('tickets').onclick = e => { const button = e.target.closest('[data-ticket]'); if (button){showTicket(tickets.find(t => t.id === button.dataset.ticket));if(employee)work.classList.remove('og-mobile-list-open');} };
    const newConversation=()=>{conversationId=crypto.randomUUID();sessionStorage.setItem('og-conversation-'+user.id,conversationId);chatHistory=[];selected=null;el('draft').value='';showTicket(null);renderMessages([]);el('handoff').hidden=true;el('draft').focus();};
    el('context').onclick=e=>{
      if(e.target.closest('#og-new')&&!busy)return newConversation();
      if(e.target.closest('[data-add-details]')){el('draft').focus();el('draft').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
      const act=e.target.closest('[data-action]');
      if(act&&!busy)return el('actions').onclick({target:act});
    };
    el('handoff').onclick=async e=>{
      const button=e.target.closest('#og-connect');if(!button||busy)return;button.disabled=true;
      try{
        const details=await dialogForm('<h2>Do you still need a person?</h2><p>If the answer helped, no request is needed. Connect only when something remains unresolved or needs staff action.</p><label>What still needs help?<textarea name="reason" required rows="3" maxlength="1000" placeholder="For example: my leave balance is incorrect, or I need a policy exception"></textarea></label>','Request specialist help');
        if(!details)return;
        const latest=[...chatHistory].reverse().find(m=>m.role==='user');
        thinking(true);loader.element.querySelector('.lattice-text').textContent='Finding the right team for your request';
        const result=await PS18.request('/chat/handoff',{method:'POST',body:JSON.stringify({messageId:latest.id,conversationId,reason:details.reason})});
        if(disposed)return;thinking(false);selected=result.ticket;showTicket(result.ticket);await refresh();
      }catch(e){error(e);}finally{if(!disposed)thinking(false);button.disabled=false;}
    };
    el('draft').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!busy)el('compose').requestSubmit();}};
    el('draft').oninput=()=>{
      if (el('error').textContent) el('error').innerHTML = '';
      if(employee&&!selected){const text=el('draft').value.toLowerCase();const related=/vpn|wifi|laptop|password/.test(text)?['My VPN keeps disconnecting','I can’t sign in to my account','My laptop is running slowly']:/leave|holiday|attendance/.test(text)?['What is the leave policy?','How do I correct my attendance?','Where can I find company holidays?']:/expense|finance|reimburs/.test(text)?['I need help with a reimbursement','What documents do I need for an expense claim?']:null;if(related)el('suggestions').innerHTML=related.map(p=>`<button type="button" data-suggestion="${escape(p)}">${escape(p)} <span>↗</span></button>`).join('');else suggestions();}
      if(!employee&&selected&&socket.connected&&Date.now()-typingSentAt>1500){typingSentAt=Date.now();socket.emit('employee:typing',{ticketId:selected.id});}
    };
    if(user.role==='support_executive'){
      const presence=document.createElement('label');presence.className='og-presence-control';presence.innerHTML=`Your availability<select id="og-presence">${['online','busy','away','offline'].map(s=>`<option ${s===(user.status||'offline')?'selected':''} value="${s}">${s==='online'?'Available for requests':s}</option>`).join('')}</select>`;
      container.querySelector('.og-nav').insertBefore(presence,container.querySelector('[data-view="today"]'));
      el('presence').onchange=async()=>{const control=el('presence');control.disabled=true;try{await PS18.request(`/employees/${user.id}/availability`,{method:'PATCH',body:JSON.stringify({status:control.value})});user.status=control.value;}catch(e){control.value=user.status||'offline';error(e);}finally{control.disabled=false;}};
    }
    el('compose').onsubmit = async e => {
      e.preventDefault(); const draft = el('draft').value.trim(); if (!draft||busy) return;

      // Duplicate open ticket check (C16)
      if (employee && !selected) {
        const openDup = tickets.find(t => t.status !== 'resolved' && (
          (draft.toLowerCase().includes('salary') && t.title.toLowerCase().includes('salary')) ||
          (t.title && draft.toLowerCase() === t.title.toLowerCase())
        ));
        if (openDup) {
          PS18.showToast(`You already have an open request about this (${openDup.reference})`, 'warning');
        }
      }

      const path=employee?'/chat/message':`/tickets/${selected.id}/reply`;
      const body=employee?{message:draft,conversationId,...(selected?{ticketId:selected.id}:{})}:{version:selected.version,message:draft};
      const fingerprint = JSON.stringify({path,body});
      if (pendingSubmission?.fingerprint !== fingerprint) pendingSubmission = {fingerprint,key:crypto.randomUUID()};
      const headers = {'Idempotency-Key':pendingSubmission.key};
      const button = el('compose').querySelector('button'); 
      button.disabled = true; 
      button.innerHTML = '<span class="og-btn-spinner" aria-hidden="true" style="width:11px;height:11px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;display:inline-block;animation:og-spin 0.6s linear infinite;margin-right:4px;"></span> Sending…'; 
      el('error').textContent = '';
      
      // Optimistic user bubble (C13)
      const optMessage = {
        id: 'opt-' + Date.now(),
        role: 'user',
        content: draft,
        timestamp: new Date().toISOString(),
        senderName: employee ? 'You' : 'Your reply'
      };
      if (employee) chatHistory.push(optMessage);
      if (selected) selected.transcript = [...(selected.transcript||[]), optMessage];
      renderMessages(selected ? selected.transcript : chatHistory);
      el('draft').value = '';
      el('messages').scrollTop = el('messages').scrollHeight;
      
      thinking(true);
      const submitStart = Date.now();
      try {
        if (employee) {
          const result = await PS18.request(path, { method:'POST', headers, body:JSON.stringify(body) });
          if(result.ticket) selected = result.ticket;
        } else {
          await PS18.request(path, { method:'POST', headers, body:JSON.stringify(body) });
        }
        pendingSubmission = null;

        // Visible typing/thinking indicator for at least 450ms (C13)
        const elapsed = Date.now() - submitStart;
        if (elapsed < 450) {
          await new Promise(r => setTimeout(r, 450 - elapsed));
        }

        if (!disposed) { 
          thinking(false);
          socket.emit('employee:typing-stop',{ticketId:selected?.id});
          await refresh(); 
        }
      } catch(e) {
        if(e.status===409&&/Idempotency key/i.test(e.message||''))pendingSubmission.key=crypto.randomUUID();
        error(e.status===409&&/Idempotency key/i.test(e.message||'')?'This message was not sent because its retry record was stale. Retry now to send it safely.':e);
      } finally { 
        if (!disposed) {
          thinking(false);
          button.disabled = false;
          button.textContent = pendingSubmission ? 'Retry ↗' : 'Send ↗';
          el('messages').scrollTop = el('messages').scrollHeight;
        } 
      }
    };
    el('actions').onclick = async e => {
      const button = e.target.closest('button[data-action],button[data-ai]'); if (!button || !selected) return;
      let action = button.dataset.action, body = {version:selected.version};
      el('error').textContent='';
      if(action==='dismiss'){const details=await dialogForm('<h2>Close without a fix</h2><p>This is not a resolution or deletion. The employee sees the reason and can reopen it. Use Wrong team instead for a routing error.</p><label>Category<select name="category"><option value="duplicate">Duplicate request</option><option value="withdrawn">Employee withdrew request</option><option value="no_action_needed">No staff action needed</option></select></label><label>Reason<textarea name="reason" required rows="3" maxlength="4000"></textarea></label>','Close request');if(!details)return;Object.assign(body,details);}
      if(action==='reroute'){
        const status=await PS18.request('/chat/support-status').catch(e=>{error(e);return null;});if(!status)return;
        const details=await dialogForm(`<span class="og-eyebrow">CORRECT THE ROUTE, KEEP THE CONTEXT</span><h2>Not the right team?</h2><p>We’ll release the current assignment and route this same request to the team you choose. Your reference, conversation and earlier work stay together.</p><label>Correct department<select name="department" required>${status.departments.filter(d=>d.department!==selected.department).map(d=>`<option value="${escape(d.department)}">${escape(d.department)}</option>`).join('')}</select></label><label>What should we know?<textarea name="reason" required rows="3" maxlength="1000" placeholder="Explain why this team is a better fit"></textarea></label>`,'Move this request');
        if(!details)return;Object.assign(body,details);
      }
      if (['resolve','escalate','waiting_on_user'].includes(action)) { const field=action==='resolve'?'resolutionSummary':action==='escalate'?'reason':'message';const details=await dialogForm(`<h2>${action==='resolve'?'Resolve this request':action==='escalate'?'Escalate with context':'Ask for one more detail'}</h2><p>Your note stays in the employee’s conversation.</p><label>${action==='resolve'?'What was fixed?':'What does the next person need to know?'}<textarea name="${field}" required rows="4" maxlength="4000"></textarea></label>`,'Save update');if(!details)return;Object.assign(body,details); }
      if (action === 'priority') {const details=await dialogForm(`<h2>What changed?</h2><p>Tell the team how this issue is affecting your work.</p><label>Priority<select name="priority">${['low','normal','high','critical'].map(p=>`<option ${selected.priority===p?'selected':''} value="${p}">${p}</option>`).join('')}</select></label><label>Reason<textarea name="reason" required rows="3" maxlength="1000"></textarea></label>`,'Update priority');if(!details)return;Object.assign(body,details);}
      if (action === 'feedback') {
        const details=await dialogForm(`
          <div style="text-align:center;padding:6px 0 12px;">
            <div style="font-size:36px;margin-bottom:6px;">⭐</div>
            <h2 style="font-size:20px;margin:0 0 6px;color:#183626;">How was your support experience?</h2>
            <p style="font-size:12.5px;color:#6b8273;margin:0 0 16px;">Your feedback directly helps improve our specialist response quality.</p>
            <div style="display:flex;justify-content:center;gap:12px;margin:16px 0 20px;">
              ${[5,4,3,2,1].map(r => `
                <label style="display:flex;flex-direction:column;align-items:center;cursor:pointer;font-size:11.5px;font-weight:700;color:#183626;">
                  <input type="radio" name="rating" value="${r}" ${r===5?'checked':''} style="width:18px;height:18px;accent-color:#16a34a;margin-bottom:6px;">
                  <span>${r} ★</span>
                  <span style="font-size:9.5px;color:#73887a;font-weight:normal;">${{5:'Excellent',4:'Good',3:'Okay',2:'Poor',1:'Very poor'}[r]}</span>
                </label>
              `).join('')}
            </div>
            <label style="text-align:left;font-size:12px;display:block;color:#374151;margin-top:10px;">Optional details or comments
              <textarea name="comment" rows="2" maxlength="500" placeholder="Tell us what went well or how we can do better…"></textarea>
            </label>
          </div>
        `,'Submit Feedback');
        if(!details)return;
        body.rating=Number(details.rating);
      }
      button.disabled = true;
      try { await PS18.request(`/tickets/${selected.id}/${button.dataset.ai ? `ai-attempt/${button.dataset.ai}` : action}`, {method:'POST',body:JSON.stringify(body)}); await refresh(); } catch(e) { error(e); } finally { if (!disposed) button.disabled = false; }
    };
    container.querySelectorAll('[data-view]').forEach(button => button.onclick = async () => {
      if(busy)return;
      closeSidebar();
      view=button.dataset.view;container.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('og-nav-active',b===button);b.setAttribute('aria-current',b===button?'page':'false');});
      container.querySelector('.og-main>header h1').textContent=({chat:employee?'How can we help?':'Assigned queue',tickets:employee?'My requests':'Request queue',today:'Today at work',calendar:'Workplace calendar',services:'Workplace services',actions:'My actions',policies:'Company policies',overview:manager?'Support oversight':'Department overview'})[view]||'OneGate';
      if(view==='chat')button.classList.remove('og-nav-unread');
      work.classList.toggle('og-chat-full',employee&&view==='chat');
      container.querySelector('.og-list').hidden=!['tickets','chat'].includes(view)||employee&&view==='chat';
      if(employee&&view==='tickets'&&matchMedia('(max-width:680px)').matches)work.classList.add('og-mobile-list-open');
      if (button.dataset.view === 'policies') {
        el('overview').hidden=false;container.querySelector('.og-grid').hidden=true;
        el('overview').innerHTML='<div class="policy-page"><p role="status">Loading company policies…</p></div>';
        try {
          const data=await PS18.request('/policies');
          el('overview').innerHTML=`<div class="policy-page"><header class="policy-heading"><span class="og-eyebrow">COMPANY KNOWLEDGE</span><h2>All your policies. One place.</h2><p>Read the full handbook or browse ${data.articles.length} source articles by team.</p></header><div class="policy-tools"><button class="hero-primary" id="read-policy-pdf">Read policy PDF ↗</button><a id="download-policy-pdf" download="onegate-company-policies.pdf" hidden>Download PDF ↓</a></div><div id="policy-pdf-area"></div><div class="policy-grid">${[...new Set(data.articles.map(a=>a.department))].map(dept=>`<section class="policy-card"><small>${escape(dept)}</small><h3>${escape(dept)} policies</h3><p>${data.articles.filter(a=>a.department===dept).length} articles in the handbook</p><button data-policy-team="${escape(dept)}">Browse articles →</button><div hidden>${data.articles.filter(a=>a.department===dept).map(a=>`<p><b>${escape(a.title)}</b><br><small>${escape(a.source_citation)}</small></p>`).join('')}</div></section>`).join('')}</div></div>`;
          el('overview').querySelectorAll('[data-policy-team]').forEach(b=>b.onclick=()=>{b.nextElementSibling.hidden=!b.nextElementSibling.hidden;b.textContent=b.nextElementSibling.hidden?'Browse articles →':'Hide articles ↑';});
          el('overview').querySelector('#read-policy-pdf').onclick=async e=>{
            const b=e.currentTarget;b.disabled=true;b.textContent='Opening PDF…';
            try{const token=localStorage.getItem('ps18_token');const res=await fetch(data.pdf,{headers:token?{Authorization:`Bearer ${token}`}:{}});if(!res.ok)throw new Error('Unable to open the policy handbook');const url=URL.createObjectURL(await res.blob());const area=el('overview').querySelector('#policy-pdf-area');if(area.dataset.url)URL.revokeObjectURL(area.dataset.url);area.dataset.url=url;area.innerHTML=`<iframe class="policy-reader" title="Company policy PDF" src="${url}"></iframe>`;const download=el('overview').querySelector('#download-policy-pdf');download.href=url;download.hidden=false;b.textContent='Read policy PDF ↗';}catch(err){error(err);b.textContent='Retry policy PDF';}finally{b.disabled=false;}
          };
        }catch(err){error(err);}
      }
      else if (button.dataset.view === 'overview') { try { await overview(); } catch(e) { error(e); } }
      else if (['today','calendar','services','actions'].includes(button.dataset.view)) { try { await workplace(button.dataset.view); } catch(e) { error(e); } }
      else { el('overview').hidden = true; container.querySelector('.og-grid').hidden = false; if (employee && button.dataset.view === 'chat') newConversation(); }
    });
    el('logout').onclick = async () => { try { await PS18.request('/auth/logout',{method:'POST'}); } finally { socket.disconnect(); localStorage.removeItem('ps18_token'); PS18.user = null; PS18.conversations = {}; navigate('hero'); } };
    socket.on('connect', () => { if (!disposed) { el('network').textContent = 'Live';el('network').dataset.connected='true'; refresh(); } });
    socket.on('disconnect', () => { if (!disposed) {el('network').textContent = 'Offline — reconnecting';el('network').dataset.connected='false';} });
    socket.on('connect_error', e => { if (!disposed) el('network').textContent = 'Live updates unavailable'; });
    const liveRefresh=()=>{if(!busy)refresh();};
    socket.on('ticket:changed',event=>{const ticket=event?.ticket;if(employee&&ticket&&ticket.id!==selected?.id)unreadTicketIds.add(ticket.id);liveRefresh();});
    socket.on('message',message=>{if(employee&&message?.ticketId&&message.ticketId!==selected?.id)unreadTicketIds.add(message.ticketId);if(employee&&message?.metadata?.workflow&&view!=='chat')container.querySelector('[data-view="chat"]').classList.add('og-nav-unread');liveRefresh();});
    socket.on('presence:changed',liveRefresh);
    socket.on('chat:progress',event=>{if(busy&&loader){loader.element.querySelector('.lattice-text').textContent=event.label;const state=({reviewing:'thinking',routing:'routing',assigning:'assigning',delivering:'delivering'}[event.state]||'thinking');el('thinking').dataset.state=state;container.querySelector('.og-work').dataset.state=state;}});
    socket.on('typing:start',event=>{if(disposed||selected?.id!==event.ticketId)return;el('typing').hidden=false;el('typing').innerHTML=`<span class="og-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span> ${escape(event.name||'Your specialist')} is typing`;clearTimeout(typingTimer);typingTimer=setTimeout(()=>{if(!disposed)el('typing').hidden=true;},4500);});
    socket.on('typing:stop',event=>{if(selected?.id===event.ticketId){clearTimeout(typingTimer);el('typing').hidden=true;}});
    socket.on('workplace:changed', () => {
      if (disposed || el('overview').hidden) return;
      if (['today','calendar','services','actions'].includes(view)) workplace(view).catch(error);
      else if (view === 'overview') overview().catch(error);
    });
    socket.on('dashboard:invalidate', () => {liveRefresh();if (!el('overview').hidden&&view==='overview')overview().catch(error);});
    const etaTimer=setInterval(()=>{if(!disposed&&selected&&el('eta'))el('eta').textContent=etaText(selected);},1000);
    PS18.cleanup = () => { disposed = true;loader?.destroy();clearInterval(etaTimer);clearTimeout(thinkingTimer);clearTimeout(typingTimer);if(el('dialog').open)el('dialog').close('cancel');socket.disconnect(); };
    container.querySelector('[data-view="chat"]').classList.add('og-nav-active');
    showTicket(null); await refresh();
    if (manager) {
      view='overview';
      container.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('og-nav-active',active);b.setAttribute('aria-current',active?'page':'false');});
      await overview().catch(error);
    }
  }
  window.renderChat = workspace;
  window.renderInbox = workspace;
  window.renderHistory = workspace;
  window.renderManager = workspace;
})();
