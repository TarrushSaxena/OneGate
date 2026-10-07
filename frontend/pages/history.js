// ============================================================
// DEDICATED HISTORY PAGE — LIGHT THEME LIQUID GLASS
// One Front Door for Everything · Support Audit Logs
// ============================================================

function renderHistory(container) {
  let filter = 'all';
  let searchQuery = '';

  const sampleTickets = [
    {
      id: 'IT-4821',
      title: 'GlobalProtect VPN keeps disconnecting every 30 minutes',
      department: 'IT',
      priority: 'high',
      status: 'in_progress',
      user: 'Naveen Kulkarni',
      specialist: 'Kiran Nambiar',
      specialistTitle: 'Level 2 · Network',
      avatar: '🧑‍💻',
      createdAt: '2 hours ago',
      slaRemaining: '12 min left',
      summary: 'Periodic gateway timeout observed during client demo calls. Client cert reissued and synced in Okta.',
      rating: null,
      messagesCount: 6,
      resolvedByAI: false,
    },
    {
      id: 'HR-1092',
      title: 'Parental Leave policy and PTO carryover for FY26',
      department: 'HR',
      priority: 'low',
      status: 'resolved',
      user: 'Naveen Kulkarni',
      specialist: 'Pooja Nair',
      specialistTitle: 'Level 2 · People Ops',
      avatar: '👩‍💼',
      createdAt: 'Yesterday at 3:15 PM',
      slaRemaining: 'Resolved in 24m',
      summary: 'Clarified 16-week primary caregiver entitlement and max 5-day PTO carryover deadline (March 31).',
      rating: 5,
      messagesCount: 4,
      resolvedByAI: true,
    },
    {
      id: 'FIN-3382',
      title: 'Concur expense report meal reimbursement above threshold',
      department: 'Finance',
      priority: 'medium',
      status: 'resolved',
      user: 'Corporate Employee',
      specialist: 'Finance Specialist',
      specialistTitle: 'Level 3 · Controller',
      avatar: '👨‍💼',
      createdAt: '3 days ago',
      slaRemaining: 'Resolved in 1.2h',
      summary: 'Approved client dinner expense of ₹14,200 with VP justification memo attached.',
      rating: 4,
      messagesCount: 8,
      resolvedByAI: false,
    },
    {
      id: 'FAC-5120',
      title: 'Bangalore Campus Floor 3 temporary visitor RFID badges',
      department: 'Facilities',
      priority: 'low',
      status: 'resolved',
      user: 'Corporate Employee',
      specialist: 'Facilities Specialist',
      specialistTitle: 'Level 2 · Security Lead',
      avatar: '👩‍🔧',
      createdAt: 'Last week',
      slaRemaining: 'Resolved in 45m',
      summary: 'Issued 4 temporary visitor cards for the client audit team with reception pickup confirmation.',
      rating: 5,
      messagesCount: 3,
      resolvedByAI: false,
    },
    {
      id: 'IT-4710',
      title: 'Urgent: MacBook Pro battery swelling and keyboard unresponsive',
      department: 'IT',
      priority: 'critical',
      status: 'resolved',
      user: 'Corporate Employee',
      specialist: 'IT Hardware Lead',
      specialistTitle: 'Level 3 · Hardware Lead',
      avatar: '👩‍💻',
      createdAt: 'Sep 21, 2026',
      slaRemaining: 'Immediate safety protocol',
      summary: 'Emergency replacement laptop dispatched via Bangalore IT Depot within 2 hours.',
      rating: 5,
      messagesCount: 11,
      resolvedByAI: false,
    },
    {
      id: 'HR-2201',
      title: 'EPF contribution query for newly promoted employees',
      department: 'HR',
      priority: 'low',
      status: 'resolved',
      user: 'Corporate Employee',
      specialist: 'AI (Auto-resolved)',
      specialistTitle: 'KB Policy §8.3',
      avatar: '🤖',
      createdAt: 'Sep 25, 2026',
      slaRemaining: 'Resolved in 2m',
      summary: 'AI answered from HR policy — EPF contribution changes post-promotion take 1 pay cycle to reflect.',
      rating: 5,
      messagesCount: 2,
      resolvedByAI: true,
    },
  ];

  const currentUser = PS18.user;
  const isManager = currentUser && currentUser.role === 'manager';

  container.innerHTML = `
    <div style="display:flex;height:100vh;overflow:hidden;position:relative;z-index:10;background:var(--bg-canvas);">

      <!-- ─── Left Sidebar ───────────────────────────────── -->
      <aside class="liquid-glass hide-mobile" style="width:250px;height:calc(100vh - 28px);margin:14px 0 14px 14px;display:flex;flex-direction:column;border-radius:20px;border:1px solid rgba(255,255,255,0.95);box-shadow:var(--glass-shadow-md);overflow:hidden;flex-shrink:0;">
        
        <!-- Logo -->
        <div style="padding:16px 18px;border-bottom:1px solid rgba(15,23,42,0.06);display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="navigate('hero')">
          <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#0284C7,#38BDF8);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:16px;box-shadow:0 2px 6px rgba(2,132,199,0.2);">🚪</div>
          <div>
            <div style="font-size:13.5px;font-weight:900;letter-spacing:-0.02em;color:#0F172A;">One Front Door</div>
            <div style="font-size:10.5px;color:var(--tx-tertiary);">Support History</div>
          </div>
        </div>

        <!-- User Profile Card -->
        ${currentUser ? `
          <div style="padding:10px 14px;margin:10px 12px 4px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:50%;background:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
              ${currentUser.avatar}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:800;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${currentUser.name}</div>
              <div style="font-size:10.5px;color:var(--tx-tertiary);">${currentUser.department}</div>
            </div>
          </div>
        ` : ''}

        <!-- Quick Stats -->
        <div style="padding:10px 14px;margin:0 12px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:900;color:#0F172A;">${sampleTickets.length}</div>
            <div style="font-size:9.5px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;letter-spacing:0.04em;">Total</div>
          </div>
          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:900;color:#16A34A;">${sampleTickets.filter(t => t.status === 'resolved').length}</div>
            <div style="font-size:9.5px;font-weight:700;color:#16A34A;text-transform:uppercase;letter-spacing:0.04em;">Resolved</div>
          </div>
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:900;color:#0284C7;">${sampleTickets.filter(t => t.status === 'in_progress').length}</div>
            <div style="font-size:9.5px;font-weight:700;color:#0284C7;text-transform:uppercase;letter-spacing:0.04em;">Active</div>
          </div>
          <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:10px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:900;color:#059669;">${sampleTickets.filter(t => t.resolvedByAI).length}</div>
            <div style="font-size:9.5px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.04em;">AI Fixed</div>
          </div>
        </div>

        <!-- Nav -->
        <nav style="padding:10px 12px;flex:1;display:flex;flex-direction:column;gap:4px;">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--tx-quaternary);padding:2px 4px;margin-bottom:2px;">Actions</div>
          <button class="rubber-segment-item active" style="width:100%;text-align:left;border-radius:10px;padding:8px 12px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:8px;">
            <span>📋</span> <span>All Tickets</span>
          </button>
          <button class="rubber-segment-item" style="width:100%;text-align:left;border-radius:10px;padding:8px 12px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:8px;" onclick="navigate('chat')">
            <span>💬</span> <span>New Chat</span>
          </button>
          ${isManager ? `
            <button class="rubber-segment-item" style="width:100%;text-align:left;border-radius:10px;padding:8px 12px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:8px;" onclick="navigate('manager')">
              <span>📊</span> <span>Dashboard</span>
            </button>
          ` : ''}
        </nav>

        <!-- Bottom Actions -->
        <div style="padding:10px 12px;border-top:1px solid rgba(15,23,42,0.05);">
          <button class="btn-glass" onclick="PS18.showToast('Audit export ready for download', 'success')" style="width:100%;margin-bottom:5px;padding:7px;font-size:11.5px;">Export Audit CSV</button>
          <button class="btn-glass" onclick="handleLogout()" style="width:100%;padding:7px;font-size:11.5px;">🚪 Sign Out</button>
        </div>

      </aside>

      <!-- ─── Main Content ───────────────────────────────── -->
      <main style="flex:1;height:calc(100vh - 28px);margin:14px;overflow-y:auto;display:flex;flex-direction:column;" class="animate-fade-in">

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:18px;padding-top:4px;">
          <div>
            <h1 style="font-size:22px;font-weight:900;color:#0F172A;letter-spacing:-0.02em;">Support History & Audit Logs</h1>
            <p style="font-size:12.5px;color:var(--tx-tertiary);margin-top:2px;">All past interactions, resolutions, and specialist handoffs</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn-glass" onclick="navigate('chat')" style="padding:8px 18px;font-size:12.5px;">← Back to Chat</button>
            <button class="btn-primary-dark" onclick="navigate('hero')" style="padding:8px 18px;border-radius:9999px;font-size:12.5px;">Home</button>
          </div>
        </div>

        <!-- Controls Bar -->
        <div class="liquid-glass" style="padding:14px 20px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;background:#FFFFFF;">
          
          <!-- Filter Tabs -->
          <div class="rubber-segment-container" id="history-filter-segments">
            <div class="rubber-segment-indicator"></div>
            <button class="rubber-segment-item active" data-val="all">All Records (${sampleTickets.length})</button>
            <button class="rubber-segment-item" data-val="in_progress">Active (${sampleTickets.filter(t=>t.status==='in_progress').length})</button>
            <button class="rubber-segment-item" data-val="resolved">Resolved (${sampleTickets.filter(t=>t.status==='resolved').length})</button>
          </div>

          <!-- Search Box -->
          <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:9999px;width:280px;">
            <span style="font-size:14px;color:var(--tx-tertiary);flex-shrink:0;">🔍</span>
            <input type="text" id="history-search-input" placeholder="Search tickets, topics..." 
              style="border:none;background:transparent;outline:none;font-size:13px;color:#0F172A;width:100%;" />
          </div>

        </div>

        <!-- Tickets List -->
        <div id="history-cards-container" style="display:flex;flex-direction:column;gap:12px;padding-bottom:24px;">
          <!-- Rendered dynamically -->
        </div>

      </main>

    </div>
  `;

  function renderList() {
    const listEl = document.getElementById('history-cards-container');
    if (!listEl) return;

    const filtered = sampleTickets.filter(t => {
      const matchesFilter = filter === 'all' || t.status === filter;
      const matchesSearch = !searchQuery || 
        t.title.toLowerCase().includes(searchQuery) ||
        t.id.toLowerCase().includes(searchQuery) ||
        t.department.toLowerCase().includes(searchQuery) ||
        t.summary.toLowerCase().includes(searchQuery) ||
        t.user.toLowerCase().includes(searchQuery);
      return matchesFilter && matchesSearch;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="liquid-glass" style="text-align:center;padding:60px 20px;background:#FFFFFF;">
          <div style="font-size:40px;margin-bottom:12px;">🔍</div>
          <div style="font-size:16px;font-weight:800;color:#0F172A;">No matching tickets found</div>
          <div style="font-size:13px;color:var(--tx-tertiary);margin-top:6px;">Try a different keyword or reset the filter.</div>
        </div>
      `;
      return;
    }

    const priorityColors = {
      critical: { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
      high: { bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
      medium: { bg: '#EFF6FF', color: '#0284C7', border: '#BFDBFE' },
      low: { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
    };

    const deptColors = {
      IT: { bg: '#EFF6FF', color: '#2563EB' },
      HR: { bg: '#F5F3FF', color: '#7C3AED' },
      Finance: { bg: '#ECFDF5', color: '#059669' },
      Facilities: { bg: '#FFFBEB', color: '#D97706' },
    };

    listEl.innerHTML = filtered.map(t => {
      const pStyle = priorityColors[t.priority] || priorityColors.medium;
      const dStyle = deptColors[t.department] || { bg: '#F8FAFC', color: '#64748B' };
      const isResolved = t.status === 'resolved';
      const stars = t.rating ? '★'.repeat(t.rating) + '☆'.repeat(5 - t.rating) : null;

      return `
        <div class="liquid-glass" style="padding:20px;background:#FFFFFF;border:1px solid rgba(15,23,42,0.08);transition:all 0.2s var(--spring-rubber);"
          onmouseenter="this.style.boxShadow='var(--glass-shadow-md)';this.style.transform='translateY(-2px)';"
          onmouseleave="this.style.boxShadow='var(--glass-shadow-sm)';this.style.transform='translateY(0)';">
          
          <!-- Top Row: ID, badges, timestamp -->
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-size:14.5px;font-weight:900;color:#0F172A;font-family:'Courier New',monospace;">#${t.id}</span>
              <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;background:${dStyle.bg};color:${dStyle.color};">${t.department}</span>
              <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;background:${pStyle.bg};color:${pStyle.color};border:1px solid ${pStyle.border};">${t.priority.toUpperCase()}</span>
              ${isResolved ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;background:#F0FDF4;color:#16A34A;border:1px solid #BBF7D0;">✓ RESOLVED</span>` : `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;background:#EFF6FF;color:#0284C7;border:1px solid #BFDBFE;">● ACTIVE</span>`}
              ${t.resolvedByAI ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;background:#F0FDF4;color:#059669;">🤖 AI Resolved</span>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:12px;font-weight:700;color:${isResolved ? '#16A34A' : 'var(--primary)'};">${t.slaRemaining}</div>
              <div style="font-size:11px;color:var(--tx-quaternary);margin-top:2px;">${t.createdAt}</div>
            </div>
          </div>

          <!-- Title -->
          <h3 style="font-size:15px;font-weight:800;color:#0F172A;line-height:1.35;margin-bottom:10px;">${t.title}</h3>

          <!-- Resolution Note -->
          <div style="font-size:12.5px;color:var(--tx-secondary);line-height:1.5;margin-bottom:14px;background:#F8FAFC;padding:10px 14px;border-radius:10px;border-left:3px solid ${dStyle.color};">
            <strong>Resolution:</strong> ${t.summary}
          </div>

          <!-- Bottom Row -->
          <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(15,23,42,0.04);padding-top:12px;flex-wrap:wrap;gap:8px;">
            <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--tx-tertiary);flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="width:24px;height:24px;border-radius:50%;background:#F1F5F9;display:flex;align-items:center;justify-content:center;font-size:12px;">${t.avatar}</div>
                <span><strong style="color:#0F172A;">${t.specialist}</strong> · ${t.specialistTitle}</span>
              </div>
              <span>•</span>
              <span>👤 ${t.user}</span>
              <span>•</span>
              <span>💬 ${t.messagesCount} messages</span>
              ${stars ? `<span>• <span style="color:#F5B400;font-weight:700;letter-spacing:0.5px;">${stars}</span></span>` : ''}
            </div>

            <div style="display:flex;align-items:center;gap:8px;">
              <button class="btn-glass" onclick="PS18.showToast('Showing full audit transcript for #${t.id}', 'info')" style="padding:6px 14px;font-size:12px;border-radius:9999px;">
                📄 Audit Log
              </button>
              <button class="btn-primary-dark" onclick="navigate('chat', { initialPrompt: 'Following up on ticket #${t.id}' })" style="padding:6px 16px;border-radius:9999px;font-size:12px;">
                Continue Chat →
              </button>
            </div>
          </div>

        </div>
      `;
    }).join('');
  }

  // Setup Rubber Segment
  const segs = document.getElementById('history-filter-segments');
  if (segs && window.RubberSegment) {
    new RubberSegment(segs, (val) => {
      filter = val;
      renderList();
    });
  }

  // Setup Search
  const searchInput = document.getElementById('history-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderList();
    });
  }

  renderList();
}

window.renderHistory = renderHistory;
