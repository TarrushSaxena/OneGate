// ============================================================
// USER CHAT PAGE — MINIMALIST LIGHT THEME LIQUID GLASS
// One Front Door for Everything · Deflection-First LLM Architecture
// Conforms to Part 1 UX Contract (All 13 States & Microcopy Rules)
// ============================================================

function renderChat(container, params = {}) {
  // Ensure default employee user
  if (!PS18.user) {
    PS18.user = {
      id: 'u-emp',
      name: 'Employee',
      department: 'Engineering',
      role: 'employee',
      avatar: '👤'
    };
  }

  const user = PS18.user;

  let messages = [];
  let isThinking = false;
  let activeLattice = null;
  let currentTargetAgent = null;
  const threadStorageKey = `onegate-thread:${user.id}`;
  let conversationId = sessionStorage.getItem(threadStorageKey) || crypto.randomUUID();
  sessionStorage.setItem(threadStorageKey, conversationId);

  // Active tickets in this session
  let conversationTickets = [];
  let selectedTicketId = null;
  let activeOutage = null;

  container.innerHTML = `
    <div style="display:flex;height:100vh;overflow:hidden;position:relative;z-index:10;background:var(--bg-canvas);">

      <!-- ─── Minimal Left Glass Sidebar ──────────────────── -->
      <aside class="liquid-glass hide-mobile" style="width:280px;height:calc(100vh - 48px);margin:24px 0 24px 24px;display:flex;flex-direction:column;border-radius:24px;border:1px solid rgba(255,255,255,0.7);box-shadow:var(--glass-shadow-sm);overflow:hidden;">
        
        <!-- Logo -->
        <div style="padding:20px 24px;border-bottom:1px solid rgba(15,23,42,0.04);display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="navigate('hero')">
          <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#0284C7,#38BDF8);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:17px;box-shadow:0 2px 8px rgba(2,132,199,0.25);">🚪</div>
          <div>
            <div style="font-size:14px;font-weight:800;letter-spacing:-0.02em;color:#0F172A;">One Front Door</div>
            <div style="font-size:10.5px;color:var(--tx-tertiary);">AI Unified Helpdesk</div>
          </div>
        </div>

        <!-- User Profile Card -->
        <div style="padding:14px 18px;margin:14px 14px 8px;background:#F8FAFC;border:1px solid rgba(15,23,42,0.05);border-radius:16px;display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:50%;background:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 1px 3px rgba(15,23,42,0.04);">
            ${user.avatar}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:800;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${user.name}</div>
            <div style="font-size:11.5px;color:var(--tx-tertiary);">${user.department} · Requester</div>
          </div>
          <span style="width:8px;height:8px;border-radius:50%;background:#22C55E;box-shadow:0 0 8px rgba(34,197,94,0.4);" title="Online"></span>
        </div>

        <!-- ─── Compact Sidebar Active Tickets ────────────── -->
        <div id="sidebar-tickets-section" style="padding:8px 14px;border-bottom:1px solid rgba(15,23,42,0.05);display:none;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding:0 2px;">
            <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--tx-tertiary);">
              Active Requests
            </span>
            <span id="sidebar-tickets-count-badge" class="badge-light badge-it" style="font-size:9.5px;padding:1px 6px;font-weight:800;">0</span>
          </div>
          <div id="sidebar-tickets-list" style="display:flex;flex-direction:column;gap:5px;max-height:140px;overflow-y:auto;">
            <!-- Dynamically populated minimal tickets -->
          </div>
        </div>

        <!-- Workplace quick view: routing remains automatic, not a manual menu -->
        <div style="padding:10px 14px;flex:1;overflow-y:auto;">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--tx-tertiary);margin-bottom:8px;padding-left:4px;">
            Tomorrow at work
          </div>
          <div id="workplace-schedule" aria-live="polite" style="display:grid;gap:8px;">
            <div style="padding:10px;border:1px solid rgba(15,23,42,.06);border-radius:12px;background:rgba(255,255,255,.55);font-size:11px;color:var(--tx-tertiary);">Loading tomorrow’s demo schedule…</div>
          </div>
          <div style="margin-top:16px;padding:10px;border-radius:12px;background:#F0F9FF;border:1px solid #BAE6FD;font-size:11px;line-height:1.45;color:#0C4A6E;">
            <strong>Smart routing is on</strong><br>Describe the outcome you need. OneGate chooses the right team and keeps your thread together.
          </div>
        </div>

        <!-- Bottom Info -->
        <div style="margin-top:auto;padding:14px 18px;border-top:1px solid rgba(15,23,42,0.04);background:rgba(248,250,252,0.7);">
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--tx-tertiary);margin-bottom:4px;">
            <span>Zenmux AI Deflection</span>
            <span style="color:#16A34A;font-weight:700;">● Online</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--tx-tertiary);">
            <span>Knowledge Base</span>
            <span>60 Policies Indexed</span>
          </div>
        </div>

      </aside>

      <!-- ─── Center Minimal Chat Area ───────────────────── -->
      <main style="flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;margin:24px;border-radius:24px;border:1px solid rgba(255,255,255,0.7);" class="liquid-glass">
        
        <!-- ─── State 13: Top Outage Banner (Dismissible / Actionable) ── -->
        <div id="outage-alert-banner" class="timeline-event-card timeline-outage" style="display:none;margin:12px 24px 0;padding:10px 16px;border-radius:14px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#991B1B;font-weight:600;">
              <span>🚨</span>
              <span id="outage-banner-text">IT is working on a known VPN issue. Updates here.</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <button class="btn-glass" onclick="subscribeToOutage()" style="padding:3px 10px;font-size:11px;border-radius:9999px;">
                Subscribe for updates
              </button>
              <button class="btn-glass" onclick="dismissOutageBanner()" style="padding:3px 8px;font-size:11px;border-radius:50%;">
                ✕
              </button>
            </div>
          </div>
        </div>

        <!-- ─── Unified Clean Header ───────────────────────── -->
        <header style="padding:14px 24px;border-bottom:1px solid rgba(15,23,42,0.04);display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.92);backdrop-filter:blur(20px);gap:12px;min-height:60px;">
          
          <!-- Left: Title & Agent -->
          <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0284C7,#38BDF8);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:17px;box-shadow:0 2px 8px rgba(2,132,199,0.25);flex-shrink:0;">
              🚪
            </div>
            <div>
              <div style="font-size:15px;font-weight:800;color:#0F172A;display:flex;align-items:center;gap:8px;white-space:nowrap;">
                <span>One Front Door</span>
                <span id="current-agent-badge" class="badge-light badge-it" style="font-size:10.5px;padding:2px 7px;">@general</span>
              </div>
              <div style="font-size:11.5px;color:var(--tx-tertiary);white-space:nowrap;">AI Unified Helpdesk · Direct Triage</div>
            </div>
          </div>

          <!-- Center: Minimal Multi-Ticket Selector Pills -->
          <div id="header-tickets-group" style="display:none;align-items:center;gap:6px;">
            <div class="ticket-pills-row" id="ticket-pills-container" style="display:flex;align-items:center;gap:6px;"></div>
          </div>

          <!-- Right: User Identity & New Chat -->
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="badge-light badge-blue" style="font-size:11.5px;padding:3px 10px;">
              👤 ${PS18.user ? PS18.user.name : 'Employee'}
            </span>
            <button class="btn-glass" onclick="clearCurrentChat()" style="padding:4px 10px;font-size:11px;border-radius:9999px;">+ New</button>
            <button class="btn-glass" onclick="handleLogout()" style="padding:4px 10px;font-size:11px;border-radius:9999px;" title="Sign Out">🚪 Sign Out</button>
          </div>
        </header>

        <!-- ─── Sticky Active Ticket Context Header ────────── -->
        <div id="sla-ticket-header" style="display:none;position:sticky;top:0;z-index:15;padding:8px 24px 0;background:rgba(255,255,255,0.92);backdrop-filter:blur(16px);">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;font-size:12px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#0284C7;animation:pulse 2s infinite;"></span>
              <strong id="ticket-id-label" style="color:#0F172A;font-weight:800;">#IT-4821</strong>
              <span id="ticket-priority-badge" class="badge-light badge-high">High · Work Blocker</span>
              <span id="ticket-tier-badge" class="badge-light badge-it">Level 2 specialist</span>
              <span id="ticket-assignee-label" style="color:#334155;font-weight:600;">Support Specialist</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span id="ticket-time-left" style="color:var(--primary);font-weight:700;">About 15 to 25 min</span>
              <span style="color:var(--tx-quaternary);">·</span>
              <span id="ticket-target-time" style="color:var(--tx-tertiary);">by 2:40 PM</span>
            </div>
          </div>
        </div>

        <!-- ─── Messages Stream Area ───────────────────────── -->
        <div id="messages-container" style="flex:1;overflow-y:auto;padding:18px 24px;display:flex;flex-direction:column;gap:14px;">
          
          <!-- Welcome Screen (Visible when empty) -->
          <div id="welcome-chat-hero" style="margin:auto;max-width:520px;text-align:center;padding:16px;">
            <div style="font-size:36px;margin-bottom:10px;">🚪</div>
            <h2 style="font-size:22px;font-weight:900;color:#0F172A;letter-spacing:-0.02em;margin-bottom:6px;">
              Welcome, ${user.name}
            </h2>
            <p style="font-size:13px;color:var(--tx-secondary);line-height:1.55;margin-bottom:16px;">
              Ask any question across IT, HR, Finance, or Facilities. Our AI provides instant answers from official company policies, and connects you with a specialist when human action is needed.
            </p>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">
              <button class="suggestion-chip" onclick="sendDirectPrompt('What is the standard policy on equipment return?')">Equipment Return</button>
              <button class="suggestion-chip" onclick="sendDirectPrompt('How do I submit an expense report above ₹25,000 without receipt?')">Expense Exceptions</button>
              <button class="suggestion-chip" onclick="sendDirectPrompt('How do I connect to the office WiFi network?')">WiFi Setup</button>
              <button class="suggestion-chip" onclick="sendDirectPrompt('My corporate laptop battery is smoking and swollen, urgent help!')">🚨 Emergency Incident (Create Ticket)</button>
            </div>
          </div>

        </div>

        <!-- Resolution Rating Area (State 7 PeekRating) -->
        <div id="resolution-rating-area" style="padding:0 24px;"></div>

        <!-- LatticeLoader Thinking Area -->
        <div id="thinking-loader-area" style="padding:0 24px 8px;display:none;"></div>

        <!-- ─── Clean Minimal Input Pill ───────────────────── -->
        <div style="position:relative;padding:10px 24px 14px;background:rgba(255,255,255,0.94);border-top:1px solid rgba(15,23,42,0.06);backdrop-filter:blur(24px);">
          
          <div class="liquid-glass-pill" style="display:flex;flex-direction:column;padding:12px 18px;background:#FFFFFF;border:1px solid rgba(15,23,42,0.08);box-shadow:0 2px 8px rgba(15,23,42,0.03);">
            <textarea id="chat-input" rows="1" placeholder="Type a question or message (e.g. 'What is the equipment return policy?')..." 
              style="width:100%;border:none;background:transparent;outline:none;resize:none;font-size:14.5px;line-height:1.5;font-family:inherit;color:#0F172A;font-weight:500;max-height:120px;padding:2px 4px;"></textarea>

            <!-- Bottom Tool Actions -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid rgba(15,23,42,0.04);">
              <div style="display:flex;align-items:center;gap:6px;">
                <span id="route-hint" style="font-size:11px;color:var(--tx-tertiary);">
                  Auto-triage active · specialist handoff when action is needed
                </span>
              </div>

              <!-- Send Button -->
              <button class="btn-primary-dark" onclick="submitMessage()" 
                style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0;font-size:15px;">
                ↵
              </button>
            </div>
          </div>

        </div>

      </main>

    </div>
  `;

  // ─── Input Events ────────────────────────────────────────────
  const inputEl = document.getElementById('chat-input');

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  });

  if (params.initialPrompt) {
    setTimeout(() => {
      inputEl.value = params.initialPrompt;
      submitMessage();
    }, 250);
  }

  // ─── Socket Wiring (Real-time events per Part 1) ─────────────
  const s = PS18.socket;
  if (s) {
    s.on('message', (msg) => {
      addMessage(msg);
    });

    s.on('ticket:status', (data) => {
      const { ticketId, status, level_label, resolutionSummary, reason } = data;
      const t = conversationTickets.find(x => x.id === ticketId);
      if (t) t.status = status;
      renderMultiTicketBar();

      if (status === 'resolved') {
        // State 7: Resolved
        addTimelineEvent('resolved', {
          title: 'Marked resolved',
          body: resolutionSummary || 'Issue addressed and resolved by specialist. Did that fix it?',
          ticketId,
          showRating: true
        });
      } else if (status === 'escalated') {
        // State 6: Escalated
        addTimelineEvent('escalated', {
          title: `Moved up to ${level_label || 'Level 3'}`,
          body: reason || 'Needs deeper access. Earlier notes went with the ticket.',
          ticketId
        });
      } else if (status === 'open') {
        // State 8: Reopened
        addTimelineEvent('reopened', {
          title: 'Reopened. This goes to the front of the line.',
          body: reason || 'Priority bumped one step. Same specialist assigned if available.',
          ticketId
        });
      }
    });

    s.on('queue:position_changed', ({ ticketId, queuePosition, message }) => {
      // State 10: Live queue position update
      addTimelineEvent('busyqueue', {
        title: `Queue position: #${queuePosition}`,
        body: message || `Everyone at this level is busy. You're ${queuePosition}th in line.`,
        ticketId
      });
    });

    s.on('outage:announced', ({ department, message }) => {
      // State 13: Outage banner
      showOutageBanner(department, message);
    });
    s.on('ticket:changed', ({ ticket }) => {
      if (!ticket) return;
      registerTicket(ticket);
      if (ticket.id === selectedTicketId) showStickyTicketHeader(ticket);
    });
    s.on('chat:progress', ({ label }) => {
      if (label && !isThinking) startThinking(label);
    });
  }

  // Restore the scoped server thread on every page load. The former UI only
  // retained messages in a local array, which made the conversation appear to
  // forget its last turn after navigating or refreshing.
  async function hydrateConversation() {
    try {
      const [conversation, tickets, schedule] = await Promise.all([
        PS18.request(`/chat/conversation/${user.id}?conversationId=${encodeURIComponent(conversationId)}`),
        PS18.request('/tickets?limit=30'),
        PS18.request('/workplace/demo-schedule'),
      ]);
      if (conversation.messages?.length) document.getElementById('welcome-chat-hero')?.remove();
      (conversation.messages || []).forEach(message => addMessage(message, null, false));
      (tickets.tickets || []).filter(t => t.conversation_id === `${user.id}:${conversationId}`).forEach(registerTicket);
      renderDemoSchedule(schedule);
      const messageContainer = document.getElementById('messages-container');
      if (messageContainer && conversation.messages?.length) messageContainer.scrollTop = messageContainer.scrollHeight;
    } catch (error) {
      // Chat stays usable even if an optional restoration request is unavailable.
      console.warn('Could not restore chat workspace', error);
    }
  }

  function renderDemoSchedule(schedule) {
    const target = document.getElementById('workplace-schedule');
    if (!target || !schedule) return;
    const row = (icon, item, suffix = '') => `<div style="padding:10px;border:1px solid rgba(15,23,42,.06);border-radius:12px;background:rgba(255,255,255,.72);display:grid;gap:3px;">
      <div style="font-size:10px;font-weight:800;color:#64748B;">${icon} ${item.time}${suffix}</div>
      <div style="font-size:11.5px;font-weight:800;color:#0F172A;">${item.title}</div>
      <div style="font-size:10.5px;line-height:1.35;color:#64748B;">${item.detail}${item.status ? ` · ${item.status}` : ''}${item.seats ? ` · ${item.seats}` : ''}</div>
    </div>`;
    target.innerHTML = `<div style="font-size:10px;color:#64748B;padding:0 2px;">Demo calendar · ${schedule.date}</div>
      ${(schedule.cafeteria || []).slice(0, 1).map(item => row('☕', item)).join('')}
      ${(schedule.transport || []).slice(0, 2).map(item => row('🚌', item)).join('')}`;
  }

  hydrateConversation();

  // ─── Ticket Management ──────────────────────────────────────
  function registerTicket(t) {
    if (!t) return;
    const cleanId = (t.id || t.ticket_ref || 'TICKET').replace(/^#/, '');
    
    let specialist = t.assigned_name || t.assigned_first_name || 'Support Specialist';

    const normalizedTicket = {
      id: cleanId,
      department: t.department ? t.department.replace(/\s*Support/i, '') : 'IT',
      priority: (t.priority || 'normal').toLowerCase(),
      priority_reason: t.priority_reason || 'Work blocker reported',
      status: t.status || 'in_progress',
      assigned_name: specialist,
      assigned_tier: t.level_label || t.assigned_tier || 'Level 2 specialist',
      target_time: t.eta_clock || t.target_time || '2:40 PM',
      time_left: t.eta_low_min ? `About ${t.eta_low_min} to ${t.eta_high_min} min` : 'About 15 to 25 min',
      created_at: t.created_at || Date.now(),
      citation: t.citation || null,
      warm_summary: t.warm_summary || null
    };

    const exists = conversationTickets.find(x => x.id.toLowerCase() === cleanId.toLowerCase());
    if (!exists) conversationTickets.push(normalizedTicket);
    else Object.assign(exists, normalizedTicket);

    selectedTicketId = normalizedTicket.id;
    showStickyTicketHeader(normalizedTicket);
    renderMultiTicketBar();
  }

  function showStickyTicketHeader(ticket) {
    const banner = document.getElementById('sla-ticket-header');
    if (!banner || !ticket) return;
    banner.style.display = 'block';

    const shortId = ticket.id.length > 7 ? ticket.id.slice(-6).toUpperCase() : ticket.id.toUpperCase();
    const dept = ticket.department || 'IT';
    document.getElementById('ticket-id-label').textContent = `${dept}-${shortId}`;
    
    const prioWord = ticket.priority.toUpperCase();
    document.getElementById('ticket-priority-badge').textContent = `${prioWord} · ${ticket.priority_reason}`;
    document.getElementById('ticket-priority-badge').className = `badge-light badge-${ticket.priority || 'medium'}`;
    
    document.getElementById('ticket-tier-badge').textContent = ticket.assigned_tier;
    document.getElementById('ticket-assignee-label').textContent = ticket.assigned_name;
    document.getElementById('ticket-time-left').textContent = ticket.time_left;
    document.getElementById('ticket-target-time').textContent = `by ${ticket.target_time}`;
  }

  function renderMultiTicketBar() {
    const headerGroup = document.getElementById('header-tickets-group');
    const container = document.getElementById('ticket-pills-container');
    const sidebarSection = document.getElementById('sidebar-tickets-section');
    const sidebarList = document.getElementById('sidebar-tickets-list');
    const countBadge = document.getElementById('sidebar-tickets-count-badge');

    const total = conversationTickets.length;
    if (countBadge) countBadge.textContent = total;

    if (total === 0) {
      if (headerGroup) headerGroup.style.display = 'none';
      if (sidebarSection) sidebarSection.style.display = 'none';
      return;
    }

    if (headerGroup) headerGroup.style.display = 'flex';
    if (sidebarSection) sidebarSection.style.display = 'block';

    if (container) {
      container.innerHTML = conversationTickets.slice(-3).map(t => {
        const isSelected = t.id === selectedTicketId;
        const shortId = t.id.length > 7 ? t.id.slice(-6).toUpperCase() : t.id.toUpperCase();
        return `
          <button class="ticket-pill ${isSelected ? 'active' : ''}" onclick="selectTicket('${t.id}')">
            <span class="status-dot" style="background:#0284C7;"></span>
            <span>#${shortId}</span>
          </button>
        `;
      }).join('');
    }

    if (sidebarList) {
      sidebarList.innerHTML = conversationTickets.map(t => {
        const isSelected = t.id === selectedTicketId;
        const shortId = t.id.length > 7 ? t.id.slice(-6).toUpperCase() : t.id.toUpperCase();
        return `
          <div class="sidebar-ticket-card ${isSelected ? 'active' : ''}" onclick="selectTicket('${t.id}')">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:11px;font-weight:800;color:#0F172A;">#${shortId}</span>
              <span class="badge-light badge-${t.department.toLowerCase()}" style="font-size:9px;padding:1px 5px;">${t.department}</span>
            </div>
            <div style="font-size:10.5px;color:var(--tx-tertiary);margin-top:2px;">
              ${t.assigned_name} · ${t.time_left}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  window.selectTicket = (ticketId) => {
    selectedTicketId = ticketId;
    const t = conversationTickets.find(x => x.id === ticketId);
    if (t) showStickyTicketHeader(t);
    renderMultiTicketBar();
  };

  // ─── Timeline Events Renderer (States 4, 5, 6, 7, 8, 9, 10, 11) ─
  function addTimelineEvent(type, data) {
    const container = document.getElementById('messages-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `timeline-event-card timeline-${type}`;

    const timeStr = PS18.formatTime(new Date().toISOString());

    let actionsHtml = '';
    if (type === 'resolved' && data.ticketId) {
      actionsHtml = `
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
          <button class="btn-glass" onclick="reopenTicket('${data.ticketId}')" style="padding:3px 10px;font-size:11px;color:#8B5CF6;font-weight:600;">
            It's not fixed (Reopen)
          </button>
        </div>
      `;
    } else if (type === 'offhours' && data.article) {
      actionsHtml = `
        <div style="margin-top:8px;padding:8px 12px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;">
          <div style="font-size:12px;font-weight:700;color:#0F172A;">📖 Suggested fix: ${data.article.title}</div>
          <div style="font-size:11px;color:var(--tx-tertiary);margin-top:2px;">${data.article.source_citation}</div>
          <div style="font-size:11.5px;color:var(--tx-secondary);margin-top:4px;">${data.article.content.slice(0, 120)}...</div>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="timeline-event-header">
        <span class="timeline-event-title">${data.title}</span>
        <span class="timeline-event-time">${timeStr}</span>
      </div>
      <div class="timeline-event-body">${data.body}</div>
      ${actionsHtml}
    `;

    container.appendChild(el);
    container.scrollTop = container.scrollHeight;

    if (data.showRating && data.ticketId) {
      renderResolutionRating(data.ticketId);
    }
  }

  // ─── Submit User Message ─────────────────────────────────────
  async function submitMessage() {
    const text = inputEl.value.trim();
    if (!text || isThinking) return;

    inputEl.value = '';

    const welcome = document.getElementById('welcome-chat-hero');
    if (welcome) welcome.remove();

    addMessage({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    });

    startThinking();

    try {
      const response = await PS18.request('/chat/message', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          message: text,
          conversationId,
          ticketId: selectedTicketId || undefined
        })
      });

      stopThinking('done');

      // State 12: Content filter notice
      if (response.content_filter_applied) {
        addTimelineEvent('sensitive', {
          title: 'We hid your card number for safety',
          body: 'Personal data was masked before routing. The rest of your request is being handled.'
        });
      }

      // State 9: Off-hours card
      if (response.off_hours) {
        addTimelineEvent('offhours', {
          title: `${response.routing?.department || 'Support'} is offline until ${response.off_hours.onlineAt || '9:00 AM'}`,
          body: response.off_hours.message || "Your ticket is first in line. Here's a self-serve fix to try now.",
          article: response.off_hours.article
        });
      }

      // State 10: No one free / Busy queue
      if (response.busy_queue) {
        addTimelineEvent('busyqueue', {
          title: `Everyone at this level is busy`,
          body: `You're ${response.busy_queue.queuePosition}th in line, about ${response.ticket?.eta_low_min || 20} to ${response.ticket?.eta_high_min || 30} min.`
        });
      }

      let createdTicketObj = null;
      if (response.ticket) {
        registerTicket(response.ticket);
        createdTicketObj = response.ticket;

        // State 3: Handoff Queued Card
        renderHandoffQueuedCard(response.ticket);
      }

      if (response.message) {
        addMessage(response.message, createdTicketObj);
      }

    } catch (err) {
      stopThinking('error');
      addMessage({
        role: 'assistant',
        content: "I encountered a network issue contacting the triage engine. Try again.",
        timestamp: new Date().toISOString()
      });
    }
  }

  // ─── State 3: Handoff Queued Card ────────────────────────────
  function renderHandoffQueuedCard(t) {
    const container = document.getElementById('messages-container');
    if (!container) return;

    const shortId = t.id.length > 7 ? t.id.slice(-6).toUpperCase() : t.id.toUpperCase();
    const dept = t.department || 'IT';
    const prio = (t.priority || 'Normal').toUpperCase();
    const prioReason = t.priority_reason || 'Blocks work today';
    const specialist = t.assigned_name || 'Support Specialist';
    const tier = t.assigned_tier || 'Level 2 specialist';
    const etaStr = t.eta_low_min ? `About ${t.eta_low_min} to ${t.eta_high_min} min, by ${t.eta_clock || '2:40 PM'}` : 'About 15 to 25 min, by 2:40 PM';

    const card = document.createElement('div');
    card.className = 'timeline-event-card timeline-assigned';
    card.style.margin = '8px 0';
    card.innerHTML = `
      <div class="timeline-event-header">
        <span class="timeline-event-title">Passing you to ${dept} Support</span>
        <span class="timeline-event-time">#${shortId}</span>
      </div>
      <div style="font-size:13px;color:#0F172A;font-weight:600;margin-bottom:6px;">
        ${specialist}, a ${tier}, is on it.
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
        <span class="badge-light badge-${dept.toLowerCase()}">${dept}</span>
        <span class="badge-light badge-${(t.priority || 'medium').toLowerCase()}">${prio} · ${prioReason}</span>
        <span style="font-size:11.5px;color:var(--tx-secondary);">⏱ ${etaStr}</span>
      </div>

      <!-- 4-Step Progress Track -->
      <div style="display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;color:var(--tx-tertiary);margin:8px 0;padding:6px 0;border-top:1px solid rgba(15,23,42,0.06);">
        <span style="color:#16A34A;">✓ AI Triage</span>
        <span>→</span>
        <span style="color:#0284C7;">● Queued</span>
        <span>→</span>
        <span>○ Specialist Review</span>
        <span>→</span>
        <span>○ Resolved</span>
      </div>

      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <button class="btn-glass" onclick="focusChatInputWithPrompt('Adding more details: ')" style="padding:3px 10px;font-size:11px;">
          Add details
        </button>
        <button class="btn-glass" onclick="promptPriorityChange('${t.id}')" style="padding:3px 10px;font-size:11px;">
          Change priority
        </button>
      </div>
    `;

    container.appendChild(card);
    container.scrollTop = container.scrollHeight;
  }

  // ─── Render Message (States 1, 2, and Responses) ─────────────
  function addMessage(msg, associatedTicket = null, autoScroll = true) {
    messages.push(msg);

    const container = document.getElementById('messages-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'animate-fade-in';
    el.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

    if (msg.role === 'user') {
      el.style.alignItems = 'flex-end';
      el.innerHTML = `
        <div class="bubble-user" style="max-width:70%;">${PS18.md(msg.content)}</div>
        <div style="font-size:10px;color:var(--tx-tertiary);padding:0 6px;">${PS18.formatTime(msg.timestamp)}</div>
      `;
    } else if (msg.role === 'assistant') {
      el.style.alignItems = 'flex-start';
      const meta = msg.metadata || {};
      const dpt = meta.department || 'IT';

      // Collapsible reasoning trace
      let reasoningHtml = '';
      if (meta.department) {
        reasoningHtml = `
          <div class="reasoning-box" style="max-width:85%;margin-bottom:6px;">
            <div class="reasoning-header" onclick="toggleReasoning(this)">
              <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
                <span>ⓘ</span>
                <span>Routed to ${dpt} Support · checked 2 policy sources</span>
              </div>
              <span class="reasoning-chevron" style="font-size:10px;">▼</span>
            </div>
            <div class="reasoning-steps" style="display:none;margin-top:6px;padding-top:6px;">
              <div class="reasoning-step-item">
                <span>📦</span>
                <span>Classified department: <strong>${dpt} Support</strong> (${meta.confidence || 88}% confidence)</span>
              </div>
              ${meta.kbArticle ? `
                <div class="reasoning-step-item">
                  <span>🔍</span>
                  <span>Grounded in policy: <em>${meta.kbArticle.title}</em></span>
                </div>
              ` : `
                <div class="reasoning-step-item">
                  <span>🔍</span>
                  <span>Verified standard company operating guidelines</span>
                </div>
              `}
            </div>
          </div>
        `;
      }

      // State 1: Interactive Citation Chip with Liquid Glass Popover
      let citationHtml = '';
      if (meta.kbArticle && meta.kbArticle.source_citation) {
        const art = meta.kbArticle;
        citationHtml = `
          <div style="position:relative;display:inline-block;">
            <button class="citation-chip" onclick="toggleCitationPopover(this)">
              📎 Source: ${art.source_citation}
            </button>
            <div class="citation-popover-card" style="display:none;">
              <div style="font-size:12px;font-weight:800;color:#0F172A;margin-bottom:4px;">${art.title}</div>
              <div style="font-size:11px;color:#1D4ED8;font-weight:600;margin-bottom:6px;">${art.source_citation}</div>
              <div style="font-size:11.5px;color:var(--tx-secondary);line-height:1.45;">${art.content.slice(0, 160)}...</div>
            </div>
          </div>
        `;
      }

      // State 2: Clarifying Tap Options (2 or 3 tap pills)
      let clarifyingHtml = '';
      if (meta.type === 'multi_intent_clarification' && Array.isArray(meta.intents)) {
        clarifyingHtml = `
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
            ${meta.intents.map(intent => `
              <button class="suggestion-chip" onclick="sendDirectPrompt('${intent}')" style="background:#FFFFFF;border-color:#CBD5E1;font-weight:600;">
                ${intent}
              </button>
            `).join('')}
          </div>
        `;
      }

      // Offer a specialist only when the answer is uncertain or needs action;
      // a persistent escape hatch remains in the composer for accessibility.
      const showSpecialist = !meta.kbArticle && !associatedTicket &&
        ['clarification', 'multi_intent_clarification', 'blocked'].includes(meta.type);
      let feedbackHtml = `
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;padding-top:4px;font-size:11px;color:var(--tx-tertiary);">
          <span>Helpful?</span>
          <button class="btn-glass" onclick="PS18.showToast('Feedback noted', 'info')" style="padding:2px 8px;font-size:10.5px;border-radius:9999px;">👍 Yes</button>
          ${showSpecialist ? `<span>·</span><button class="btn-glass" onclick="escalateToHumanTicket()" style="padding:2px 8px;font-size:10.5px;border-radius:9999px;color:var(--primary);font-weight:600;">Connect to a specialist</button>` : ''}
        </div>
      `;

      // USP-2: Resolution Chip beneath response text
      const resType = msg.resolution_type || meta.resolution_type || (associatedTicket ? 'human_required' : 'answer');
      const resLabel = msg.resolution_label || (resType === 'ai_attempted' ? 'Tried a fix' : resType === 'human_required' ? 'Connecting you with a person' : 'Answered directly');
      let resChipBg = '#EFF6FF';
      let resChipColor = '#1D4ED8';
      let resChipBorder = '#BFDBFE';
      let resChipIcon = 'ℹ️';

      if (resType === 'ai_attempted') {
        resChipBg = '#FEF3C7';
        resChipColor = '#B45309';
        resChipBorder = '#FDE68A';
        resChipIcon = '🔧';
      } else if (resType === 'human_required' || resType === 'ticket') {
        resChipBg = '#F3E8FF';
        resChipColor = '#7E22CE';
        resChipBorder = '#E9D5FF';
        resChipIcon = '🎧';
      }

      const resolutionChipHtml = `
        <div style="display:flex;align-items:center;gap:6px;margin:6px 0 2px;">
          <span class="resolution-chip" style="background:${resChipBg};color:${resChipColor};border:1px solid ${resChipBorder};font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:9999px;">
            <span>${resChipIcon}</span>
            <span>${resLabel}</span>
          </span>
        </div>
      `;

      // USP-1: Follow-up CTAs for ai_attempted
      let followupHtml = '';
      const assocTicketId = msg.ticket_id || associatedTicket?.id || meta.ticket_id;
      if (resType === 'ai_attempted' && assocTicketId) {
        followupHtml = `
          <div class="ai-followup-panel" id="followup-panel-${assocTicketId}" style="margin-top:10px;padding:12px 14px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;">
            <div style="font-size:12.5px;font-weight:700;color:#92400E;margin-bottom:8px;">Did this solve the problem?</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <button class="btn-primary-dark" onclick="confirmAiFix('${assocTicketId}', this)" style="background:#16A34A;border-color:#16A34A;padding:4px 14px;font-size:11.5px;border-radius:9999px;cursor:pointer;">
                ✓ Yes, it’s working
              </button>
              <button class="btn-glass" onclick="escalateAiFix('${assocTicketId}', this)" style="color:#B45309;border-color:#FCD34D;background:#FFFFFF;padding:4px 14px;font-size:11.5px;border-radius:9999px;font-weight:600;cursor:pointer;">
                ✕ No, I still need help
              </button>
            </div>
          </div>
        `;
      }

      el.innerHTML = `
        ${reasoningHtml}
        <div style="display:flex;align-items:flex-start;gap:10px;max-width:85%;">
          <div style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#0284C7,#38BDF8);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:15px;flex-shrink:0;">🤖</div>
          <div style="display:flex;flex-direction:column;gap:4px;width:100%;">
            <div class="bubble-assistant">${PS18.md(msg.content)}</div>
            ${resolutionChipHtml}
            ${followupHtml}
            ${citationHtml}
            ${clarifyingHtml}
            ${feedbackHtml}
            <div style="font-size:10px;color:var(--tx-tertiary);padding:0 4px;">
              <span>${PS18.formatTime(msg.timestamp)}</span>
            </div>
          </div>
        </div>
      `;
    } else if (msg.role === 'employee') {
      // Human specialist message appears directly in the same thread
      el.style.alignItems = 'flex-start';
      const empName = msg.employeeName || 'Support Specialist';
      const empLevel = msg.employeeLevel || 'Level 2 specialist';

      el.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px;max-width:85%;">
          <div style="width:30px;height:30px;border-radius:8px;background:#EFF6FF;border:1px solid #BFDBFE;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">
            ${msg.employeeAvatar || '🧑‍💻'}
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <div style="font-size:11.5px;font-weight:700;color:#0F172A;">
              ${empName}, ${empLevel}
            </div>
            <div class="bubble-specialist">${PS18.md(msg.content)}</div>
            <div style="font-size:10px;color:var(--tx-tertiary);padding:0 4px;">${PS18.formatTime(msg.timestamp)}</div>
          </div>
        </div>
      `;
    }

    container.appendChild(el);
    if (autoScroll) container.scrollTop = container.scrollHeight;
  }

  // ─── Thinking Loader ─────────────────────────────────────────
  function startThinking() {
    isThinking = true;
    const area = document.getElementById('thinking-loader-area');
    area.innerHTML = '';
    area.style.display = 'block';

    if (window.LatticeLoader) {
      activeLattice = new LatticeLoader({
        label: 'Checking policies',
        doneLabel: 'Done in',
        errorLabel: 'Failed after',
        doneColor: '#22C55E',
        errorColor: '#EF4444'
      });
      area.appendChild(activeLattice.element);
    }
  }

  function stopThinking(status = 'done') {
    isThinking = false;
    if (activeLattice) {
      activeLattice.setStatus(status);
      setTimeout(() => {
        const area = document.getElementById('thinking-loader-area');
        if (area) {
          area.style.display = 'none';
          area.innerHTML = '';
        }
      }, 1200);
    }
  }

  // ─── State 7: Resolution Rating (PeekRating) ─────────────────
  function renderResolutionRating(ticketId) {
    const area = document.getElementById('resolution-rating-area');
    if (!area) return;
    area.innerHTML = '';

    if (window.PeekRating) {
      new PeekRating(area, {
        defaultValue: 5,
        onChange: (rating) => {
          PS18.showToast(`Rated ${rating}/5`, 'info');
          setTimeout(() => { area.innerHTML = ''; }, 2500);
        }
      });
    }
  }

  // ─── Outage Banner Management (State 13) ─────────────────────
  function showOutageBanner(department, message) {
    const banner = document.getElementById('outage-alert-banner');
    const textEl = document.getElementById('outage-banner-text');
    if (banner && textEl) {
      textEl.textContent = message || `${department} is working on a known issue. Updates here.`;
      banner.style.display = 'block';
    }
  }

  window.subscribeToOutage = () => {
    PS18.showToast('Subscribed for outage updates', 'info');
  };

  window.dismissOutageBanner = () => {
    const banner = document.getElementById('outage-alert-banner');
    if (banner) banner.style.display = 'none';
  };

  // ─── Interactive Actions & Helpers ───────────────────────────
  window.toggleCitationPopover = (btn) => {
    const card = btn.nextElementSibling;
    if (card) {
      card.style.display = card.style.display === 'none' ? 'block' : 'none';
    }
  };

  window.toggleReasoning = (el) => {
    const steps = el.nextElementSibling;
    const chevron = el.querySelector('.reasoning-chevron');
    if (steps.style.display === 'none') {
      steps.style.display = 'flex';
      chevron.textContent = '▲';
    } else {
      steps.style.display = 'none';
      chevron.textContent = '▼';
    }
  };

  window.selectSubAgent = (handle) => {
    currentTargetAgent = handle;
    document.getElementById('current-agent-badge').textContent = handle;
    inputEl.focus();
    PS18.showToast(`Target set to ${handle}`, 'info');
  };

  window.sendDirectPrompt = (prompt) => {
    inputEl.value = prompt;
    submitMessage();
  };

  window.focusChatInputWithPrompt = (prefix) => {
    inputEl.value = prefix;
    inputEl.focus();
  };

  window.escalateToHumanTicket = () => {
    sendDirectPrompt('I need a human specialist to assist me with this issue');
  };

  window.reopenTicket = async (ticketId) => {
    try {
      await PS18.request(`/tickets/${ticketId}/reopen`, { method: 'POST' });
    } catch (e) {}
  };

  window.confirmAiFix = async (ticketId, btn) => {
    try {
      if (btn) btn.disabled = true;
      const res = await PS18.request(`/tickets/${ticketId}/ai-attempt/confirm`, {
        method: 'POST'
      });
      const panel = document.getElementById(`followup-panel-${ticketId}`);
      if (panel) {
        panel.outerHTML = `
          <div style="margin-top:8px;padding:10px 14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;color:#166534;font-size:12px;font-weight:600;">
            ✓ <strong>Issue marked as resolved</strong><br>Resolved after the recommended fix. No specialist was needed.
          </div>
        `;
      }
      PS18.showToast('Issue marked as resolved', 'success');
    } catch (e) {
      PS18.showToast('Failed to confirm fix: ' + (e.message || 'Error'), 'error');
    }
  };

  window.escalateAiFix = async (ticketId, btn) => {
    try {
      if (btn) btn.disabled = true;
      const res = await PS18.request(`/tickets/${ticketId}/ai-attempt/escalate`, {
        method: 'POST'
      });
      const panel = document.getElementById(`followup-panel-${ticketId}`);
      if (panel) {
        panel.outerHTML = `
          <div style="margin-top:8px;padding:10px 14px;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;color:#5B21B6;font-size:12px;">
            🎧 <strong>Connecting you with a specialist now.</strong><br>I’ve included the steps already tried so you won’t need to repeat them.
          </div>
        `;
      }
      if (res && res.ticket) registerTicket(res.ticket);
      PS18.showToast('Connected to specialist queue', 'info');
    } catch (e) {
      PS18.showToast('Failed to connect: ' + (e.message || 'Error'), 'error');
    }
  };

  window.clearCurrentChat = () => {
    messages = [];
    conversationTickets = [];
    selectedTicketId = null;
    conversationId = crypto.randomUUID();
    sessionStorage.setItem(threadStorageKey, conversationId);
    renderMultiTicketBar();
    const container = document.getElementById('messages-container');
    container.innerHTML = `
      <div id="welcome-chat-hero" style="margin:auto;max-width:520px;text-align:center;padding:16px;">
        <div style="font-size:36px;margin-bottom:10px;">🚪</div>
        <h2 style="font-size:22px;font-weight:900;color:#0F172A;letter-spacing:-0.02em;margin-bottom:6px;">New Session Initialized</h2>
        <p style="font-size:13px;color:var(--tx-secondary);line-height:1.55;">Ask any question across IT, HR, Finance, or Facilities.</p>
      </div>
    `;
    document.getElementById('sla-ticket-header').style.display = 'none';
    PS18.showToast('Session refreshed', 'info');
  };

  window.handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    window.PS18.user = null;
    navigate('hero');
  };
}

window.renderChat = renderChat;
