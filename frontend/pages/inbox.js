// ============================================================
// AGENT SUPPORT SPECIALIST INBOX — EXCLUSIVELY LIGHT THEME LIQUID GLASS
// One Front Door for Everything · Indian Specialists & Real-Time Demo
// Conforms to Image 1 Layout & Part 1 / Part 2 Loop Prompt Contract
// ============================================================

function renderInbox(container) {
  const agent = PS18.user || {
    id: 'e1',
    name: 'Support Specialist',
    department: 'IT',
    tier: 'L2',
    role: 'support_executive',
    avatar: '🧑‍💻'
  };

  let tickets = [];
  let selectedTicket = null;
  let activePriorityFilter = 'all';
  let currentPresence = 'online';

  container.innerHTML = `
    <div style="display:flex;height:100vh;overflow:hidden;position:relative;z-index:10;background:var(--bg-canvas);">

      <!-- ─── Left Sidebar: Agent Cockpit ────────────────── -->
      <aside class="liquid-glass hide-mobile" style="width:310px;height:calc(100vh - 48px);margin:24px 0 24px 24px;display:flex;flex-direction:column;border-radius:24px;border:1px solid rgba(255,255,255,0.7);box-shadow:var(--glass-shadow-sm);overflow:hidden;">
        
        <!-- Logo -->
        <div style="padding:22px 24px;border-bottom:1px solid rgba(15,23,42,0.04);display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="navigate('hero')">
          <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0284C7,#38BDF8);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:18px;box-shadow:0 2px 8px rgba(2,132,199,0.25);">🚪</div>
          <div>
            <div style="font-size:15px;font-weight:800;letter-spacing:-0.02em;color:#0F172A;">One Front Door</div>
            <div style="font-size:11px;color:var(--tx-tertiary);">Specialist Console</div>
          </div>
        </div>

        <!-- Agent Profile Card (Indian Specialist) -->
        <div style="padding:16px;margin:14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:18px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <div style="width:44px;height:44px;border-radius:50%;background:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:22px;border:1px solid #CBD5E1;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
              ${agent.avatar}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:14.5px;font-weight:800;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${agent.name}</div>
              <div style="font-size:12px;color:var(--tx-tertiary);">${agent.department} Support · Level 2 specialist</div>
            </div>
          </div>

          <!-- Presence Toggle Pills (Online, Away, Busy) -->
          <div style="display:flex;gap:4px;background:#E2E8F0;padding:3px;border-radius:9999px;">
            <button id="presence-online-btn" class="priority-pill-btn active" onclick="setAgentPresence('online')" 
              style="flex:1;justify-content:center;padding:4px 0;font-size:11px;font-weight:700;border:none;">
              <span class="priority-pill-dot" style="background:#22C55E;"></span> Online
            </button>
            <button id="presence-away-btn" class="priority-pill-btn" onclick="setAgentPresence('away')" 
              style="flex:1;justify-content:center;padding:4px 0;font-size:11px;font-weight:600;border:none;background:transparent;color:var(--tx-secondary);">
              <span class="priority-pill-dot" style="background:#F59E0B;"></span> Away
            </button>
            <button id="presence-busy-btn" class="priority-pill-btn" onclick="setAgentPresence('busy')" 
              style="flex:1;justify-content:center;padding:4px 0;font-size:11px;font-weight:600;border:none;background:transparent;color:var(--tx-secondary);">
              <span class="priority-pill-dot" style="background:#EF4444;"></span> Busy
            </button>
          </div>
          <div style="margin-top:8px;font-size:10.5px;color:var(--tx-tertiary);display:flex;align-items:center;gap:4px;">
            <span>⏱ Shift: 9:30 AM–6:30 PM IST · Bangalore Hub</span>
          </div>
        </div>

        <!-- 4-Stat Metric Scorecard Grid -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 14px;margin-bottom:12px;">
          <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;padding:10px 12px;text-align:center;box-shadow:0 1px 2px rgba(15,23,42,0.02);">
            <div style="font-size:18px;font-weight:900;color:#0F172A;" id="stat-active-count">1</div>
            <div style="font-size:10px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;letter-spacing:0.04em;">Active Queue</div>
          </div>
          <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;padding:10px 12px;text-align:center;box-shadow:0 1px 2px rgba(15,23,42,0.02);">
            <div style="font-size:18px;font-weight:900;color:#0F172A;">142</div>
            <div style="font-size:10px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;letter-spacing:0.04em;">Resolved</div>
          </div>
          <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;padding:10px 12px;text-align:center;box-shadow:0 1px 2px rgba(15,23,42,0.02);">
            <div style="font-size:18px;font-weight:900;color:#0284C7;">4.2m</div>
            <div style="font-size:10px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;letter-spacing:0.04em;">Avg Reply</div>
          </div>
          <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;padding:10px 12px;text-align:center;box-shadow:0 1px 2px rgba(15,23,42,0.02);">
            <div style="font-size:18px;font-weight:900;color:#EAB308;">4.8 ⭐</div>
            <div style="font-size:10px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;letter-spacing:0.04em;">CSAT</div>
          </div>
        </div>

        <!-- Performance Bar -->
        <div style="padding:12px;margin:0 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;">
          <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:#0F172A;margin-bottom:6px;">
            <span>SLA Adherence Rate</span>
            <span style="color:#16A34A;font-weight:800;">94.8%</span>
          </div>
          <div style="width:100%;height:6px;background:#E2E8F0;border-radius:9999px;overflow:hidden;">
            <div style="width:94.8%;height:100%;background:linear-gradient(90deg,#0284C7,#16A34A);border-radius:9999px;"></div>
          </div>
        </div>

        <!-- Bottom Session Controls -->
        <div style="padding:14px;margin-top:auto;border-top:1px solid rgba(15,23,42,0.04);">
          <button class="btn-glass" onclick="handleLogout()" style="width:100%;font-size:11.5px;padding:6px;" title="Sign Out">
            🚪 Sign Out
          </button>
        </div>

      </aside>

      <!-- ─── Center Column: Ticket Queue (Sorted by SLA Urgency) ── -->
      <section class="liquid-glass" style="width:410px;height:calc(100vh - 48px);margin:24px 0 24px 16px;display:flex;flex-direction:column;border-radius:24px;border:1px solid rgba(255,255,255,0.7);box-shadow:var(--glass-shadow-sm);overflow:hidden;">
        
        <!-- Queue Header -->
        <div style="padding:18px 22px;border-bottom:1px solid rgba(15,23,42,0.04);display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:16px;font-weight:800;color:#0F172A;">My Assigned Queue</div>
            <div style="font-size:11.5px;color:var(--tx-tertiary);">Sorted by SLA urgency · Auto-refreshes</div>
          </div>
          <span class="badge-light badge-it" id="queue-badge-count" style="font-size:12px;padding:3px 9px;font-weight:800;">1</span>
        </div>

        <!-- Priority Filter Pills (Native buttons with glass styling) -->
        <div class="priority-filter-bar" style="padding:10px 16px;border-bottom:1px solid rgba(15,23,42,0.04);background:#FAFAFA;">
          <button class="priority-pill-btn active" id="filter-all" onclick="filterQueue('all')">All</button>
          <button class="priority-pill-btn" id="filter-critical" onclick="filterQueue('critical')">
            <span class="priority-pill-dot" style="background:#DC2626;"></span> Critical
          </button>
          <button class="priority-pill-btn" id="filter-high" onclick="filterQueue('high')">
            <span class="priority-pill-dot" style="background:#EA580C;"></span> High
          </button>
          <button class="priority-pill-btn" id="filter-normal" onclick="filterQueue('normal')">
            <span class="priority-pill-dot" style="background:#0284C7;"></span> Normal
          </button>
          <button class="priority-pill-btn" id="filter-low" onclick="filterQueue('low')">
            <span class="priority-pill-dot" style="background:#16A34A;"></span> Low
          </button>
        </div>

        <!-- Ticket Cards List -->
        <div id="tickets-queue-list" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;">
          <!-- Loaded dynamically -->
        </div>

      </section>

      <!-- ─── Right Pane: Ticket Detail & Live Chat Stream ── -->
      <main class="liquid-glass" style="flex:1;height:calc(100vh - 48px);margin:24px 24px 24px 16px;display:flex;flex-direction:column;border-radius:24px;border:1px solid rgba(255,255,255,0.7);box-shadow:var(--glass-shadow-sm);overflow:hidden;" id="agent-detail-pane">
        
        <!-- Empty State -->
        <div id="agent-empty-state" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;">
          <div style="font-size:48px;margin-bottom:14px;">📋</div>
          <h3 style="font-size:17px;font-weight:800;color:#0F172A;margin-bottom:6px;">Select a ticket to inspect and reply</h3>
          <p style="font-size:13px;color:var(--tx-tertiary);max-width:340px;margin-bottom:20px;line-height:1.5;">
            Click on a ticket from the queue on the left to see the AI warm handoff summary, policy citations, and dispatch a response.
          </p>
          <div style="display:flex;gap:8px;">
            <button class="btn-primary-dark" onclick="openTicket('IT-4821')" style="padding:8px 18px;border-radius:9999px;font-size:12.5px;">
              Open Ticket #IT-4821 →
            </button>
          </div>
        </div>

        <!-- Active Ticket Detail & Live Workspace (Hidden initially) -->
        <div id="agent-active-workspace" style="display:none;flex:1;flex-direction:column;height:100%;">
          
          <!-- Workspace Header -->
          <div style="padding:14px 24px;border-bottom:1px solid rgba(15,23,42,0.06);display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.88);">
            <div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span id="active-ticket-id" style="font-size:15px;font-weight:900;color:#0F172A;">#IT-4821</span>
                <span id="active-ticket-dept" class="badge-light badge-it">IT Support</span>
                <span id="active-ticket-priority" class="badge-light badge-high">High · Work Blocker</span>
                <span id="active-ticket-user" style="font-size:12.5px;color:var(--tx-secondary);font-weight:600;">👤 Requester (Engineering)</span>
              </div>
              <div id="active-ticket-title" style="font-size:13.5px;font-weight:700;color:var(--tx-secondary);margin-top:4px;">
                GlobalProtect VPN keeps disconnecting every 30 minutes
              </div>
            </div>

            <!-- Action Buttons -->
            <div style="display:flex;align-items:center;gap:8px;">
              <button class="btn-glass" onclick="escalateCurrentTicket()" style="font-size:11.5px;color:#D97706;padding:5px 12px;">
                ↑ Escalate to L3
              </button>
              <button class="btn-primary-dark" onclick="resolveCurrentTicket()" style="font-size:11.5px;background:#16A34A;border-color:#16A34A;padding:5px 14px;border-radius:9999px;">
                ✓ Resolve Ticket
              </button>
            </div>
          </div>

          <!-- AI Warm Handoff & Assignment Intelligence Panel -->
          <div style="padding:12px 24px;background:#F8FAFC;border-bottom:1px solid rgba(15,23,42,0.06);">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px;">
              <div>
                <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:0.06em;">
                  <span>🤖 AI Warm Handoff Summary</span>
                </div>
                <div id="active-ticket-summary" style="font-size:12.5px;color:var(--tx-secondary);line-height:1.5;margin-top:4px;">
                  • <strong>Issue:</strong> Requester experiences recurring VPN timeouts every 30 min.<br>
                  • <strong>Tried:</strong> Re-authenticated credentials, restarted local router.<br>
                  • <strong>Needs:</strong> Okta root certificate re-sync on Bangalore corporate gateway.
                </div>
              </div>
              <span id="active-ticket-citation" class="badge-light" style="background:#EFF6FF;color:#1D4ED8;font-size:10px;font-weight:600;flex-shrink:0;">
                IT Policy §3.2 — VPN & Remote Access
              </span>
            </div>

            <!-- USP-3: Assignment Explanation Panel -->
            <div id="active-ticket-assignment-box" style="margin-top:8px;padding:8px 12px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div style="font-size:11.5px;color:#334155;">
                <div style="font-weight:800;color:#0F172A;margin-bottom:2px;display:flex;align-items:center;gap:6px;">
                  <span>🎯 Why this agent?</span>
                  <span id="active-ticket-assignment-score" class="badge-light badge-it" style="font-size:10px;padding:1px 6px;">Score: 87/100</span>
                </div>
                <div id="active-ticket-assignment-reason" style="font-size:11px;color:var(--tx-secondary);">
                  Matched on skill overlap, current load, and past resolution rate
                </div>
              </div>
              <div id="active-ticket-assignment-factors" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                <span class="badge-light" style="font-size:9.5px;padding:1px 5px;background:#F1F5F9;">skill_overlap</span>
                <span class="badge-light" style="font-size:9.5px;padding:1px 5px;background:#F1F5F9;">current_load</span>
              </div>
            </div>
          </div>

          <!-- Message Transcript Stream -->
          <div id="agent-transcript-stream" style="flex:1;overflow-y:auto;padding:18px 24px;display:flex;flex-direction:column;gap:12px;">
            <!-- Transcript messages rendered here -->
          </div>

          <!-- Agent Reply & Policy Suggested Actions Bar -->
          <div style="padding:14px 24px;background:#FFFFFF;border-top:1px solid rgba(15,23,42,0.06);">
            
            <!-- Quick Grounded Suggested Macros -->
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;overflow-x:auto;" id="suggested-macros-container">
              <button class="suggestion-chip" onclick="applyMacro('Hi, I have your chat history and fixes already tried. What is the exact error code shown?')">
                Ask Error Code
              </button>
              <button class="suggestion-chip" onclick="applyMacro('Hi, I refreshed your gateway certificate per IT Policy §3.2. Disconnect and reconnect now.')">
                📌 Apply IT Policy §3.2 Fix
              </button>
              <button class="suggestion-chip" onclick="applyMacro('Moving this to our Network Engineering Level 3 team for packet tracing.')">
                Notify L3 Handoff
              </button>
            </div>

            <!-- Agent Reply Input -->
            <div class="liquid-glass-pill" style="display:flex;align-items:center;gap:10px;padding:6px 14px;background:#F8FAFC;border:1px solid #CBD5E1;">
              <input id="agent-reply-input" type="text" placeholder="Type a response to requester..." 
                style="flex:1;border:none;background:transparent;outline:none;font-size:13.5px;color:#0F172A;"
                onkeydown="if(event.key==='Enter') sendAgentReply();" />
              <button class="btn-primary-dark" onclick="sendAgentReply()" style="padding:7px 16px;border-radius:9999px;font-size:12.5px;">
                Reply →
              </button>
            </div>

          </div>

        </div>

      </main>

    </div>
  `;

  // ─── Socket Wiring for Agent Portal ──────────────────────────
  const s = PS18.socket;
  if (s) {
    s.on('message', (msg) => {
      if (selectedTicket && (msg.ticketId === selectedTicket.id || msg.role === 'user')) {
        selectedTicket.transcript = selectedTicket.transcript || [];
        selectedTicket.transcript.push(msg);
        renderTranscript();
      }
    });

    s.on('ticket:created', ({ ticket }) => {
      if (ticket) {
        tickets.unshift(ticket);
        renderQueue();
      }
    });
  }

  // ─── Presence Status Toggle ──────────────────────────────────
  window.setAgentPresence = async (presence) => {
    currentPresence = presence;
    ['online', 'away', 'busy'].forEach(p => {
      const btn = document.getElementById(`presence-${p}-btn`);
      if (btn) {
        if (p === presence) {
          btn.className = 'priority-pill-btn active';
          btn.style.background = '#0F172A';
          btn.style.color = '#FFFFFF';
        } else {
          btn.className = 'priority-pill-btn';
          btn.style.background = 'transparent';
          btn.style.color = 'var(--tx-secondary)';
        }
      }
    });

    try {
      await PS18.request(`/employees/${agent.id}/availability`, {
        method: 'PATCH',
        body: JSON.stringify({ status: presence === 'away' ? 'offline' : presence })
      });
      if (s) s.emit('agent:presence', { employeeId: agent.id, status: presence });
      PS18.showToast(`Presence status set to ${presence}`, 'info');
    } catch (e) {
      PS18.showToast(`Presence updated locally to ${presence}`, 'info');
    }
  };

  // ─── Seed / Real Tickets ─────────────────────────────────────
  tickets = [
    {
      id: 'IT-4821',
      title: 'GlobalProtect VPN keeps disconnecting every 30 minutes',
      department: 'IT',
      priority: 'high',
      status: 'in_progress',
      user: 'Tanya Mehra',
      createdAt: '45m ago',
      sla_deadline: new Date(Date.now() + 12 * 60000).toISOString(),
      citation: 'IT Policy §3.2 — VPN & Remote Access',
      warm_summary: '• Issue: Requester experiences recurring VPN timeouts every 30 min.\n• Tried: Re-authenticated credentials, restarted local router.\n• Needs: Okta root certificate re-sync on Bangalore corporate gateway.',
      transcript: [
        { role: 'user', content: 'My VPN keeps disconnecting every 30 minutes when working from home. I have a client demo in 2 hours!', timestamp: new Date(Date.now() - 2700000).toISOString() },
        { role: 'assistant', content: 'Passing you to IT Support. A Level 2 specialist is on it. About 15 to 25 min, by 2:40 PM.', timestamp: new Date(Date.now() - 2600000).toISOString() }
      ]
    },
    {
      id: 'IT-5034',
      title: 'Request temporary sudo rights for Docker container deployment',
      department: 'IT',
      priority: 'normal',
      status: 'open',
      user: 'Sneha Patel',
      createdAt: '2h ago',
      sla_deadline: new Date(Date.now() + 85 * 60000).toISOString(),
      citation: 'IT Security §4.1 — Privileged Access',
      warm_summary: '• Issue: Developer Sneha Patel needs temporary sudo for Docker container debugging.\n• Tried: Standard user permissions.\n• Needs: 4-hour elevation on dev machine dev-blr-89.',
      transcript: [
        { role: 'user', content: 'I need sudo access on dev-blr-89 to troubleshoot my Docker daemon.', timestamp: new Date(Date.now() - 7200000).toISOString() }
      ]
    },
    {
      id: 'HR-1092',
      title: 'Parental Leave policy and PTO carryover for FY26',
      department: 'HR',
      priority: 'low',
      status: 'resolved',
      user: 'Rohan Mehra',
      createdAt: 'Yesterday',
      sla_deadline: new Date(Date.now() - 120 * 60000).toISOString(),
      citation: 'HR Policy §7.1 — Parental & Family Leave',
      transcript: []
    }
  ];

  // ─── Filter Queue by Priority ────────────────────────────────
  window.filterQueue = (priority) => {
    activePriorityFilter = priority;
    ['all', 'critical', 'high', 'normal', 'low'].forEach(p => {
      const btn = document.getElementById(`filter-${p}`);
      if (btn) {
        if (p === priority) {
          btn.classList.add('active');
          btn.style.background = '#0F172A';
          btn.style.color = '#FFFFFF';
        } else {
          btn.classList.remove('active');
          btn.style.background = '#FFFFFF';
          btn.style.color = 'var(--tx-secondary)';
        }
      }
    });
    renderQueue();
  };

  // ─── Render Queue with SVG Circular Countdown Timers ─────────
  function renderQueue() {
    const list = document.getElementById('tickets-queue-list');
    if (!list) return;

    let filtered = tickets;
    if (activePriorityFilter !== 'all') {
      filtered = tickets.filter(t => (t.priority || '').toLowerCase() === activePriorityFilter);
    }

    // Sort by SLA deadline ascending
    filtered.sort((a, b) => {
      const timeA = a.sla_deadline ? new Date(a.sla_deadline).getTime() : Infinity;
      const timeB = b.sla_deadline ? new Date(b.sla_deadline).getTime() : Infinity;
      return timeA - timeB;
    });

    const badgeCount = document.getElementById('queue-badge-count');
    const statActive = document.getElementById('stat-active-count');
    const openCount = tickets.filter(t => t.status !== 'resolved').length;
    if (badgeCount) badgeCount.textContent = openCount;
    if (statActive) statActive.textContent = openCount;

    if (filtered.length === 0) {
      list.innerHTML = `<div style="text-align:center;padding:32px;color:var(--tx-tertiary);font-size:12.5px;">No tickets match this filter.</div>`;
      return;
    }

    list.innerHTML = filtered.map(t => {
      const isSelected = selectedTicket?.id === t.id;
      const now = Date.now();
      const deadline = t.sla_deadline ? new Date(t.sla_deadline).getTime() : now + 3600000;
      const diffMin = Math.round((deadline - now) / 60000);

      // SLA Color & Circular Progress Ring (Per Part 1 & Part 2 spec)
      let timerColor = '#16A34A'; // calm green
      let timerLabel = `${diffMin}m`;
      let progressPercent = Math.max(10, Math.min(100, (diffMin / 60) * 100));

      if (t.status === 'resolved') {
        timerColor = '#64748B';
        timerLabel = '✓';
        progressPercent = 100;
      } else if (diffMin <= 0) {
        timerColor = '#991B1B'; // breached crimson
        timerLabel = '!';
        progressPercent = 100;
      } else if (diffMin <= 5) {
        timerColor = '#DC2626'; // critical red
      } else if (diffMin <= 15) {
        timerColor = '#EA580C'; // warning orange
      }

      // SVG circle circumference for r=16 is ~100px
      const strokeDashoffset = 100 - progressPercent;

      const prioWord = (t.priority || 'normal').toUpperCase();
      const prioDot = t.priority === 'critical' ? '#DC2626' : t.priority === 'high' ? '#EA580C' : t.priority === 'normal' ? '#0284C7' : '#16A34A';

      return `
        <div class="liquid-glass" style="padding:14px;cursor:pointer;border-radius:16px;background:${isSelected ? '#EFF6FF' : '#FFFFFF'};border:1px solid ${isSelected ? '#3B82F6' : 'rgba(15,23,42,0.08)'};box-shadow:var(--glass-shadow-sm);transition:all 0.2s ease;"
          onclick="openTicket('${t.id}')">
          
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="badge-light badge-${(t.department || 'IT').toLowerCase()}">${t.department || 'IT'}</span>
              <span class="badge-light" style="background:#F8FAFC;border:1px solid #E2E8F0;font-size:10.5px;color:#0F172A;">
                <span style="width:6px;height:6px;border-radius:50%;background:${prioDot};display:inline-block;margin-right:4px;"></span>
                ${prioWord}
              </span>
            </div>

            <!-- Circular SVG SLA Countdown Timer -->
            <div class="sla-circular-timer" title="SLA Countdown: ${diffMin} minutes remaining">
              <svg width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="16" fill="none" stroke="#E2E8F0" stroke-width="3"></circle>
                <circle cx="20" cy="20" r="16" fill="none" stroke="${timerColor}" stroke-width="3"
                  stroke-dasharray="100" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round"></circle>
              </svg>
              <span class="sla-timer-text" style="color:${timerColor};font-size:10px;">${timerLabel}</span>
            </div>
          </div>

          <div style="font-size:13.5px;font-weight:700;color:#0F172A;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${t.title}
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--tx-tertiary);margin-top:4px;">
            <span>#${t.id} · ${t.user || 'Requester'}</span>
            <span>${t.status === 'resolved' ? 'Resolved' : `${diffMin > 0 ? `${diffMin}m left` : 'Overdue'}`}</span>
          </div>

        </div>
      `;
    }).join('');
  }

  // ─── Open Ticket & Render Workspace ──────────────────────────
  window.openTicket = async (id) => {
    selectedTicket = tickets.find(t => t.id === id);
    if (!selectedTicket) return;

    // Fetch real ticket detail from API if available
    try {
      const res = await PS18.request(`/tickets/${id}`);
      if (res && res.ticket) {
        selectedTicket = Object.assign({}, selectedTicket, res.ticket);
      }
    } catch (_) {}

    document.getElementById('agent-empty-state').style.display = 'none';
    const ws = document.getElementById('agent-active-workspace');
    ws.style.display = 'flex';

    document.getElementById('active-ticket-id').textContent = `#${selectedTicket.id}`;
    document.getElementById('active-ticket-dept').textContent = `${selectedTicket.department} Support`;
    document.getElementById('active-ticket-dept').className = `badge-light badge-${(selectedTicket.department || 'IT').toLowerCase()}`;
    
    document.getElementById('active-ticket-priority').textContent = `${(selectedTicket.priority || 'Normal').toUpperCase()} · Work Blocker`;
    document.getElementById('active-ticket-user').textContent = `👤 ${selectedTicket.user || 'Requester'}`;
    document.getElementById('active-ticket-title').textContent = selectedTicket.title || 'Support Case';

    if (selectedTicket.citation) {
      document.getElementById('active-ticket-citation').textContent = selectedTicket.citation;
    }

    if (selectedTicket.warm_summary) {
      document.getElementById('active-ticket-summary').innerHTML = PS18.md(selectedTicket.warm_summary);
    }

    // USP-3: Populate assignment explanation box
    const assignData = selectedTicket.assignment || (selectedTicket.assigned_to ? {
      score: selectedTicket.score || 87,
      reason: selectedTicket.assignment_reason || 'Matched on skill overlap and lowest active queue load',
      matched_factors: ['skill_overlap', 'current_load', 'past_resolution_rate']
    } : null);

    const assignBox = document.getElementById('active-ticket-assignment-box');
    if (assignBox) {
      if (assignData) {
        assignBox.style.display = 'flex';
        document.getElementById('active-ticket-assignment-score').textContent = `Score: ${assignData.score || 87}/100`;
        document.getElementById('active-ticket-assignment-reason').textContent = assignData.reason || 'Matched on skill overlap and current availability';
        const factorsContainer = document.getElementById('active-ticket-assignment-factors');
        if (factorsContainer) {
          const factors = Array.isArray(assignData.matched_factors) && assignData.matched_factors.length > 0 
            ? assignData.matched_factors 
            : ['skill_overlap', 'current_load', 'past_resolution_rate'];
          factorsContainer.innerHTML = factors.map(f => `<span class="badge-light" style="font-size:9.5px;padding:1px 5px;background:#F1F5F9;">${f}</span>`).join('');
        }
      } else {
        assignBox.style.display = 'none';
      }
    }

    renderTranscript();
    renderQueue();
  };

  function renderTranscript() {
    const stream = document.getElementById('agent-transcript-stream');
    if (!stream || !selectedTicket) return;

    stream.innerHTML = (selectedTicket.transcript || []).map(m => {
      const isAgent = m.role === 'employee';
      const isSystem = m.role === 'system';

      if (isSystem) {
        return `
          <div class="timeline-event-card timeline-escalated" style="margin:4px 0;">
            <div class="timeline-event-header">
              <span class="timeline-event-title">⚙️ System Update</span>
              <span class="timeline-event-time">${PS18.formatTime(m.timestamp)}</span>
            </div>
            <div class="timeline-event-body">${PS18.md(m.content)}</div>
          </div>
        `;
      }

      return `
        <div style="display:flex;flex-direction:column;align-items:${isAgent ? 'flex-end' : 'flex-start'};gap:2px;">
          <div style="font-size:10.5px;color:var(--tx-tertiary);padding:0 4px;">
            ${isAgent ? `${agent.name} (Specialist)` : `${selectedTicket.user || 'Requester'} (Requester)`} · ${PS18.formatTime(m.timestamp)}
          </div>
          <div style="max-width:82%;padding:10px 16px;border-radius:14px;font-size:13px;line-height:1.5;${isAgent ? 'background:#0F172A;color:#FFFFFF;' : 'background:#F1F5F9;color:#0F172A;border:1px solid #E2E8F0;'}">
            ${PS18.md(m.content)}
          </div>
        </div>
      `;
    }).join('');
    stream.scrollTop = stream.scrollHeight;
  }

  window.applyMacro = (text) => {
    const input = document.getElementById('agent-reply-input');
    if (input) {
      input.value = text;
      input.focus();
    }
  };

  // ─── Dispatch Agent Reply (Writes into user's thread instantaneously) ─
  window.sendAgentReply = async () => {
    const input = document.getElementById('agent-reply-input');
    const text = input.value.trim();
    if (!text || !selectedTicket) return;

    input.value = '';
    const newMsg = {
      role: 'employee',
      employeeName: agent.name,
      employeeAvatar: agent.avatar,
      employeeLevel: 'Level 2 specialist',
      content: text,
      timestamp: new Date().toISOString(),
      ticketId: selectedTicket.id
    };

    selectedTicket.transcript = selectedTicket.transcript || [];
    selectedTicket.transcript.push(newMsg);
    renderTranscript();

    try {
      await PS18.request(`/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message: text, employeeId: agent.id })
      });
      PS18.showToast('Reply dispatched to requester in real-time', 'info');
    } catch (e) {
      PS18.showToast('Reply recorded locally', 'info');
    }
  };

  // ─── Escalate to Level 3 ──────────────────────────────────────
  window.escalateCurrentTicket = async () => {
    if (!selectedTicket) return;
    const reason = 'Needs deeper network access and gateway routing investigation';
    
    try {
      await PS18.request(`/tickets/${selectedTicket.id}/escalate`, {
        method: 'POST',
        body: JSON.stringify({ reason, employeeId: agent.id })
      });
    } catch (e) {}

    const escMsg = {
      role: 'system',
      content: `Moved up to Level 3. ${reason}. Your notes went with it.`,
      timestamp: new Date().toISOString()
    };
    selectedTicket.transcript.push(escMsg);
    selectedTicket.status = 'escalated';
    renderTranscript();
    renderQueue();
    PS18.showToast('Ticket moved up to Level 3', 'warning');
  };

  // ─── Resolve Ticket ──────────────────────────────────────────
  window.resolveCurrentTicket = async () => {
    if (!selectedTicket) return;
    const summary = 'Re-synchronized Okta root certificate on the Bangalore gateway and confirmed connection stability.';
    
    try {
      await PS18.request(`/tickets/${selectedTicket.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolutionSummary: summary, employeeId: agent.id })
      });
    } catch (e) {}

    selectedTicket.status = 'resolved';
    const resMsg = {
      role: 'system',
      content: `Marked resolved. ${summary}`,
      timestamp: new Date().toISOString()
    };
    selectedTicket.transcript.push(resMsg);
    renderTranscript();
    renderQueue();
    PS18.showToast('Ticket marked resolved. Requester prompted for rating.', 'info');
  };

  window.handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    window.PS18.user = null;
    navigate('hero');
  };

  // Initial render
  renderQueue();
}

window.renderInbox = renderInbox;
