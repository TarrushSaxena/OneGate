// ============================================================
// MANAGER DASHBOARD — LIGHT THEME LIQUID GLASS
// Department Manager (Single Dept) & Main Manager (Org-Wide)
// Includes: Department Calendar, Leave Approvals Queue,
// Workload Balancing, Active Assignments, Compliance Trends,
// Truthful Metrics, and Expanded Staff Profiles.
// ============================================================

async function renderManager(container) {
  let user = window.PS18.user;
  if (!user || user.id === 'user-guest') {
    try {
      const meData = await window.PS18.request('/auth/me');
      if (meData?.account) {
        user = meData.account;
        window.PS18.user = user;
      }
    } catch (_) {}
  }

  if (!user) {
    user = {
      id: 'user-guest',
      name: 'Operations Manager',
      role: 'department_manager',
      department: 'IT',
    };
  }

  const isMain = user.role === 'main_manager';
  let activeTab = 'overview';
  let inspectingDept = null; // if main manager drills into a dept
  let dashboardData = null;
  let calendarData = null;
  let selectedCalDay = 5; // default selected day: Oct 5
  let calendarStaffFilter = 'all'; // 'all', 'support', 'company', 'leaves'
  let calendarViewRange = '30d'; // '30d' | '15d' | '7d'
  let calendarSprintHalf = 1; // 1 = Oct 1-15, 2 = Oct 16-31
  let deptTableSort = 'attention'; // 'attention' | 'score_desc' | 'open_desc' | 'sla_asc' | 'staff_ratio'
  let deptTableFilter = 'all'; // 'all' | 'needs_attention' | 'understaffed' | 'active_traffic'
  let leaveRequestsData = null;
  let workloadData = null;
  let activeAssignmentsData = null;
  let complianceData = null;

  container.innerHTML = `
    <div style="display:flex;height:100vh;overflow:hidden;position:relative;z-index:10;background:var(--bg-canvas);">

      <!-- ─── Left Sidebar ───────────────────────────────── -->
      <aside class="liquid-glass hide-mobile" style="width:265px;height:calc(100vh - 28px);margin:14px 0 14px 14px;display:flex;flex-direction:column;border-radius:20px;border:1px solid rgba(255,255,255,0.95);box-shadow:var(--glass-shadow-md);overflow:hidden;flex-shrink:0;">
        
        <!-- Logo -->
        <div style="padding:16px 18px;border-bottom:1px solid rgba(15,23,42,0.06);display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="navigate('hero')">
          <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#0284C7,#38BDF8);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:16px;box-shadow:0 2px 6px rgba(2,132,199,0.2);">🚪</div>
          <div>
            <div style="font-size:13.5px;font-weight:900;letter-spacing:-0.02em;color:#0F172A;">OneGate</div>
            <div style="font-size:10.5px;color:var(--tx-tertiary);">${isMain ? 'Main Executive Console' : 'Department Console'}</div>
          </div>
        </div>

        <!-- Manager Profile Card -->
        <div style="padding:12px 14px;margin:10px 12px 4px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:50%;background:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:18px;border:1px solid #E2E8F0;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
              ${isMain ? '🌐' : '📊'}
            </div>
            <div style="min-width:0;flex:1;">
              <div style="font-size:13px;font-weight:800;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${user.name}</div>
              <div style="font-size:10.5px;color:var(--tx-tertiary);">${isMain ? 'Main Manager · Org-Wide' : `${user.department} Manager`}</div>
            </div>
            <span style="width:7px;height:7px;border-radius:50%;background:#22C55E;box-shadow:0 0 5px #22C55E;flex-shrink:0;" title="Active Session"></span>
          </div>
        </div>

        <!-- Navigation Links -->
        <nav style="padding:10px 12px;display:flex;flex-direction:column;gap:5px;flex:1;overflow-y:auto;">
          <button class="rubber-segment-item active" id="nav-overview" onclick="switchManagerTab('overview')"
            style="width:100%;text-align:left;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:9px;">
            <span>📈</span> <span>${isMain ? 'Org Overview' : 'KPIs & Insights'}</span>
          </button>
          <button class="rubber-segment-item" id="nav-calendar" onclick="switchManagerTab('calendar')"
            style="width:100%;text-align:left;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:9px;">
            <span>📅</span> <span>Department Calendar</span>
          </button>
          <button class="rubber-segment-item" id="nav-leave" onclick="switchManagerTab('leave')"
            style="width:100%;text-align:left;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:9px;">
            <span>🏖️</span> <span>Leave Approval Queue</span>
            <span id="nav-leave-badge" style="display:none;margin-left:auto;background:#EA580C;color:#FFFFFF;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:800;"></span>
          </button>
          <button class="rubber-segment-item" id="nav-roster" onclick="switchManagerTab('roster')"
            style="width:100%;text-align:left;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:9px;">
            <span>👥</span> <span>Staff & Attendance</span>
          </button>
          <button class="rubber-segment-item" id="nav-queue" onclick="switchManagerTab('queue')"
            style="width:100%;text-align:left;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:9px;">
            <span>📥</span> <span>Ticket Queue</span>
          </button>
          <button class="rubber-segment-item" id="nav-announcements" onclick="switchManagerTab('announcements')"
            style="width:100%;text-align:left;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:9px;">
            <span>📢</span> <span>Broadcast Notices</span>
          </button>
          <button class="rubber-segment-item" id="nav-provision" onclick="switchManagerTab('provision')"
            style="width:100%;text-align:left;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:9px;">
            <span>➕</span> <span>Provision Account</span>
          </button>
        </nav>

        <!-- Bottom Session Controls -->
        <div style="margin-top:auto;padding:12px;border-top:1px solid rgba(15,23,42,0.05);">
          <button class="btn-glass" onclick="handleLogout()" style="width:100%;padding:9px;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;">
            <span>🚪</span> <span>Sign Out</span>
          </button>
        </div>

      </aside>

      <!-- ─── Center Operations Dashboard ────────────────── -->
      <main style="flex:1;height:calc(100vh - 28px);margin:14px;overflow-y:auto;display:flex;flex-direction:column;gap:16px;" class="animate-fade-in">
        
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-top:4px;">
          <div>
            <h1 style="font-size:22px;font-weight:900;letter-spacing:-0.03em;color:#0F172A;margin:0 0 2px;">
              ${isMain ? (inspectingDept ? `${inspectingDept} Department Inspection` : 'Organization Command Center') : `${user.department} Operations Dashboard`}
            </h1>
            <div style="font-size:12.5px;color:var(--tx-tertiary);">
              ${isMain
                ? (inspectingDept ? `Inspecting ${inspectingDept} metrics in Executive Read-Only mode` : 'Aggregated metrics, staff governance, and SLA monitoring across all 11 departments')
                : `Live ticket queue, specialist roster, attendance clock-ins, calendar, and health scores for ${user.department}`}
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:8px;">
            ${inspectingDept ? `
              <button class="btn-glass" onclick="exitDepartmentDrilldown()" style="padding:6px 12px;font-size:12px;background:#F1F5F9;font-weight:700;">
                ⬅️ Back to Org Overview
              </button>
            ` : ''}
            <span class="badge-light badge-blue" style="font-size:12px;padding:5px 12px;font-weight:700;">
              ${isMain ? (inspectingDept ? `🔒 Inspecting: ${inspectingDept}` : '🌐 Org-Wide (All Depts)') : `🔒 Dept: ${user.department}`}
            </span>
            <button class="btn-glass" onclick="loadManagerData()" style="padding:6px 12px;font-size:12px;cursor:pointer;">
              🔄 Refresh
            </button>
          </div>
        </div>

        <!-- Dynamic Content Mount -->
        <div id="manager-content" style="display:flex;flex-direction:column;gap:16px;">
          <div style="padding:40px;text-align:center;color:var(--tx-tertiary);">Loading dashboard metrics...</div>
        </div>

      </main>

    </div>

    <!-- ─── Modal Overlay: Add Support Specialist ──────── -->
    <div id="add-staff-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.4);backdrop-filter:blur(4px);z-index:9999;align-items:center;justify-content:center;padding:20px;">
      <div class="liquid-glass" style="max-width:480px;width:100%;padding:24px;border-radius:18px;box-shadow:var(--glass-shadow-lg);background:#FFFFFF;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div style="font-size:16px;font-weight:800;color:#0F172A;">➕ Onboard Support Specialist</div>
          <button onclick="closeAddStaffModal()" style="border:none;background:none;font-size:18px;cursor:pointer;color:#64748B;">✕</button>
        </div>
        <p style="font-size:12px;color:var(--tx-tertiary);margin:0 0 16px;">
          Add a support executive directly to <strong>${isMain && inspectingDept ? inspectingDept : user.department}</strong>. They will immediately appear on the department roster.
        </p>

        <form onsubmit="handleAddStaffSubmit(event)" style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Full Name</label>
            <input type="text" id="modal-staff-name" required placeholder="e.g. Alex Kumar"
              style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;" />
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Work Email</label>
            <input type="email" id="modal-staff-email" required placeholder="e.g. alex.kumar@company.com"
              style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Support Tier</label>
              <select id="modal-staff-tier" style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;">
                <option value="L1">Level 1 (Frontline)</option>
                <option value="L2" selected>Level 2 (Specialist)</option>
                <option value="L3">Level 3 (Senior Specialist)</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Work Mode</label>
              <select id="modal-staff-workmode" style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;">
                <option value="office" selected>🏢 In-Office</option>
                <option value="remote_wfh">🏠 Remote / WFH</option>
              </select>
            </div>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Temporary Password (min 12 chars)</label>
            <input type="password" id="modal-staff-pass" required placeholder="Min 12 chars (upper, lower, digit, symbol)"
              style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;" />
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button type="button" class="btn-glass" onclick="closeAddStaffModal()" style="flex:1;padding:10px;font-size:13px;">Cancel</button>
            <button type="submit" id="modal-staff-btn" class="btn-primary-liquid" style="flex:2;padding:10px;font-size:13px;font-weight:700;">Create Specialist</button>
          </div>
        </form>
      </div>
    </div>

    <!-- ─── Modal Overlay: Expanded Staff Profile (Image 3) ──── -->
    <div id="staff-profile-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(5px);z-index:9999;align-items:center;justify-content:center;padding:20px;">
      <div id="staff-profile-card-mount" style="max-width:540px;width:100%;"></div>
    </div>

    <!-- ─── Modal Overlay: Outbox Dispatch Viewer ────────── -->
    <div id="outbox-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(5px);z-index:9999;align-items:center;justify-content:center;padding:20px;">
      <div class="liquid-glass" style="max-width:620px;width:100%;padding:24px;border-radius:18px;background:#FFFFFF;max-height:80vh;display:flex;flex-direction:column;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="font-size:16px;font-weight:800;color:#0F172A;">📬 Dispatched Credential & Notice Outbox</div>
          <button onclick="closeOutboxModal()" style="border:none;background:none;font-size:18px;cursor:pointer;color:#64748B;">✕</button>
        </div>
        <p style="font-size:12px;color:var(--tx-tertiary);margin:0 0 14px;">
          Real delivery verification showing recent emails dispatched via Mailer (SMTP / Local Outbox).
        </p>
        <div id="outbox-content" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;">
          <div style="text-align:center;padding:20px;color:var(--tx-tertiary);">Loading dispatched outbox...</div>
        </div>
      </div>
    </div>
  `;

  async function loadManagerData() {
    const mount = document.getElementById('manager-content');
    if (!mount) return;

    try {
      const targetDept = isMain && inspectingDept ? inspectingDept : user.department;

      if (isMain && !inspectingDept) {
        dashboardData = await window.PS18.request('/dashboard/all');
      } else if (isMain && inspectingDept) {
        dashboardData = await window.PS18.request(`/departments/${inspectingDept}/dashboard`);
      } else {
        dashboardData = await window.PS18.request('/manager/department');
      }

      // Fetch pending leave badge count asynchronously
      try {
        const lr = await window.PS18.request(`/manager/leave-requests?department=${targetDept}`);
        leaveRequestsData = lr;
        const badgeEl = document.getElementById('nav-leave-badge');
        if (badgeEl) {
          if (lr.pendingCount > 0) {
            badgeEl.innerText = lr.pendingCount;
            badgeEl.style.display = 'inline-block';
          } else {
            badgeEl.style.display = 'none';
          }
        }
      } catch (_) {}

      renderActiveTab();
    } catch (err) {
      mount.innerHTML = `
        <div class="liquid-glass" style="padding:24px;border-left:4px solid #EF4444;color:#B91C1C;">
          <strong>Error loading dashboard:</strong> ${err.message}
        </div>
      `;
    }
  }

  function renderActiveTab() {
    const mount = document.getElementById('manager-content');
    if (!mount || !dashboardData) return;

    if (activeTab === 'overview') {
      renderOverviewTab(mount);
    } else if (activeTab === 'calendar') {
      renderCalendarTab(mount);
    } else if (activeTab === 'leave') {
      renderLeaveQueueTab(mount);
    } else if (activeTab === 'queue') {
      renderQueueTab(mount);
    } else if (activeTab === 'roster') {
      renderRosterTab(mount);
    } else if (activeTab === 'announcements') {
      renderAnnouncementsTab(mount);
    } else if (activeTab === 'provision') {
      renderProvisionTab(mount);
    }
  }

  // ─── TAB 1: OVERVIEW ──────────────────────────────────────────
  async function renderOverviewTab(mount) {
    if (isMain && !inspectingDept) {
      const d = dashboardData || {};

      // Filter and sort departments for executive comparison
      let deptList = [...(d.departments || [])];
      if (deptTableFilter === 'needs_attention') {
        deptList = deptList.filter(dept => (dept.healthScore?.score !== null && dept.healthScore?.score < 85) || dept.open > 0);
      } else if (deptTableFilter === 'understaffed') {
        deptList = deptList.filter(dept => (dept.open > 0 && dept.onlineStaff === 0) || (dept.onlineStaff > 0 && (dept.open / dept.onlineStaff) > 2));
      } else if (deptTableFilter === 'active_traffic') {
        deptList = deptList.filter(dept => dept.open > 0 || dept.resolved > 0);
      }

      deptList.sort((a, b) => {
        if (deptTableSort === 'attention') {
          const aRisk = (a.open > 0 && a.onlineStaff === 0) ? 1000 : 0;
          const bRisk = (b.open > 0 && b.onlineStaff === 0) ? 1000 : 0;
          if (aRisk !== bRisk) return bRisk - aRisk;
          const aScore = a.healthScore?.score !== null && a.healthScore?.score !== undefined ? a.healthScore.score : 999;
          const bScore = b.healthScore?.score !== null && b.healthScore?.score !== undefined ? b.healthScore.score : 999;
          if (aScore !== bScore) return aScore - bScore;
          return (b.open || 0) - (a.open || 0);
        } else if (deptTableSort === 'score_desc') {
          const aScore = a.healthScore?.score !== null && a.healthScore?.score !== undefined ? a.healthScore.score : -1;
          const bScore = b.healthScore?.score !== null && b.healthScore?.score !== undefined ? b.healthScore.score : -1;
          return bScore - aScore;
        } else if (deptTableSort === 'open_desc') {
          return (b.open || 0) - (a.open || 0);
        } else if (deptTableSort === 'sla_asc') {
          const aSla = a.hasSlaData ? a.slaCompliance : 999;
          const bSla = b.hasSlaData ? b.slaCompliance : 999;
          return aSla - bSla;
        } else if (deptTableSort === 'staff_ratio') {
          const aRatio = a.onlineStaff > 0 ? (a.open / a.onlineStaff) : (a.open > 0 ? 99 : 0);
          const bRatio = b.onlineStaff > 0 ? (b.open / b.onlineStaff) : (b.open > 0 ? 99 : 0);
          return bRatio - aRatio;
        }
        return 0;
      });

      mount.innerHTML = `
        <!-- Org KPI Ribbon with AI Routing Trend -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
          <div class="liquid-glass" style="padding:16px;">
            <div style="font-size:11px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;">Total Open Tickets</div>
            <div style="font-size:26px;font-weight:900;color:#0284C7;margin-top:4px;">${d.totalOpen || 0}</div>
            <div style="font-size:11px;color:var(--tx-tertiary);margin-top:2px;">Across all ${d.departmentCount || 11} departments</div>
          </div>
          <div class="liquid-glass" style="padding:16px;">
            <div style="font-size:11px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;">Org SLA Compliance</div>
            <div style="font-size:26px;font-weight:900;color:${(d.hasSlaData && d.avgSlaCompliance !== null) ? '#16A34A' : '#64748B'};margin-top:4px;">
              ${(d.hasSlaData && d.avgSlaCompliance !== null) ? `${d.avgSlaCompliance}%` : '—'}
            </div>
            <div style="font-size:11px;color:var(--tx-tertiary);margin-top:2px;">
              ${(d.hasSlaData && d.avgSlaCompliance !== null) ? 'Target SLA: ≥ 95%' : 'No org ticket volume yet'}
            </div>
          </div>
          <div class="liquid-glass" style="padding:16px;">
            <div style="font-size:11px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;">Org Health Score</div>
            <div style="font-size:26px;font-weight:900;color:${d.orgHealthScore?.score !== null ? '#7C3AED' : '#64748B'};margin-top:4px;">
              ${d.orgHealthScore?.score !== null && d.orgHealthScore?.score !== undefined ? `${d.orgHealthScore.score}%` : '—'}
            </div>
            <div style="font-size:11px;color:${d.orgHealthScore?.score !== null ? '#15803D' : '#64748B'};font-weight:700;margin-top:2px;">
              ★ ${d.orgHealthScore?.grade || 'Provisional (Awaiting Traffic)'}
            </div>
          </div>
          <div class="liquid-glass" style="padding:16px;">
            <div style="font-size:11px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;">AI Routing Accuracy (USP-5)</div>
            <div style="font-size:26px;font-weight:900;color:#0284C7;margin-top:4px;">${d.orgRoutingAccuracy || 96}%</div>
            <div style="font-size:11px;color:#0369A1;font-weight:700;margin-top:2px;">⚡ Active Learning Rollup</div>
          </div>
          <div class="liquid-glass" style="padding:16px;">
            <div style="font-size:11px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;">Total Resolved Tickets</div>
            <div style="font-size:26px;font-weight:900;color:#0F172A;margin-top:4px;">${d.totalResolved || 0}</div>
            <div style="font-size:11px;color:var(--tx-tertiary);margin-top:2px;">Verified closed tickets</div>
          </div>
        </div>

        <!-- Staffing Imbalance Flags Banner (if detected) -->
        ${(d.staffingGaps && d.staffingGaps.length > 0) ? `
          <div style="background:#FFFBEB;border:1px solid #FDE68A;border-left:4px solid #F59E0B;border-radius:14px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:20px;">⚠️</span>
              <div>
                <div style="font-size:13px;font-weight:800;color:#92400E;">Staffing Imbalance Flags Detected</div>
                <div style="font-size:12px;color:#B45309;margin-top:2px;">
                  ${d.staffingGaps.map(g => g.message).join(' &nbsp;•&nbsp; ')}
                </div>
              </div>
            </div>
            <button class="btn-glass" onclick="switchManagerTab('roster')" style="padding:6px 14px;font-size:11.5px;font-weight:700;background:#FFFFFF;border-color:#FCD34D;color:#92400E;">
              👥 Review Staff Roster
            </button>
          </div>
        ` : ''}

        <!-- Org-Wide Live Escalation Feed -->
        <div class="liquid-glass" style="padding:18px 20px;border-radius:18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:18px;">🚨</span>
              <div>
                <h3 style="margin:0 0 2px;font-size:15px;font-weight:800;color:#0F172A;">Org-Wide Live Escalation Feed</h3>
                <p style="margin:0;font-size:12px;color:var(--tx-tertiary);">Active escalations across all 11 departments requiring executive attention or cross-department reallocation.</p>
              </div>
            </div>
            <span class="badge-light ${d.escalations && d.escalations.length > 0 ? 'badge-red' : 'badge-green'}" style="font-size:12px;font-weight:800;">
              ${d.escalations?.length || 0} Active Escalations
            </span>
          </div>

          ${(!d.escalations || d.escalations.length === 0) ? `
            <div style="padding:22px;text-align:center;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;color:#15803D;">
              <div style="font-weight:800;font-size:13px;">✅ All 11 Department Queues On Track</div>
              <div style="font-size:11.5px;color:#166534;margin-top:2px;">Zero active escalations or immediate SLA breach risks across the enterprise.</div>
            </div>
          ` : `
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${d.escalations.map(esc => `
                <div style="background:#FFFFFF;border:1px solid #FECACA;border-left:4px solid #EF4444;border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                  <div style="min-width:0;flex:1;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                      <span style="font-size:11px;font-weight:800;color:#EF4444;">#${esc.id}</span>
                      <span class="badge-light badge-blue" style="font-size:10.5px;">${esc.department}</span>
                      <span class="badge-light badge-red" style="font-size:10.5px;font-weight:700;">${(esc.priority || 'HIGH').toUpperCase()}</span>
                      <span style="font-size:11px;color:#B91C1C;font-weight:600;">⚠️ ${esc.escalation_reason}</span>
                    </div>
                    <div style="font-size:13px;font-weight:700;color:#0F172A;">${esc.subject}</div>
                    <div style="font-size:11px;color:var(--tx-tertiary);margin-top:2px;">Assigned Specialist: <strong>${esc.assigned_agent_name}</strong></div>
                  </div>
                  <button class="btn-primary-liquid" onclick="drillDownDepartment('${esc.department}')" style="padding:6px 12px;font-size:11.5px;font-weight:700;">
                    Inspect ${esc.department}
                  </button>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- 11 Departments Performance Breakdown with Sort & Filter -->
        <div class="liquid-glass" style="padding:20px;border-radius:18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
            <div>
              <h3 style="margin:0 0 2px;font-size:15px;font-weight:800;color:#0F172A;">All 11 Departments Health & Capacity Ranking</h3>
              <p style="margin:0;font-size:12px;color:var(--tx-tertiary);">Sortable executive roll-up combining SLA, CSAT, Attendance, and Workload Balancing.</p>
            </div>

            <!-- Sort & Filter Controls -->
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <!-- Filter Pills -->
              <div style="display:flex;gap:4px;background:#F1F5F9;padding:3px;border-radius:10px;">
                <button class="btn-glass ${deptTableFilter === 'all' ? 'btn-primary-liquid' : ''}" onclick="setDeptTableFilter('all')" style="padding:4px 10px;font-size:11px;border-radius:7px;font-weight:700;">
                  All (11)
                </button>
                <button class="btn-glass ${deptTableFilter === 'needs_attention' ? 'btn-primary-liquid' : ''}" onclick="setDeptTableFilter('needs_attention')" style="padding:4px 10px;font-size:11px;border-radius:7px;font-weight:700;">
                  🚨 Needs Attention
                </button>
                <button class="btn-glass ${deptTableFilter === 'understaffed' ? 'btn-primary-liquid' : ''}" onclick="setDeptTableFilter('understaffed')" style="padding:4px 10px;font-size:11px;border-radius:7px;font-weight:700;">
                  ⚖️ Understaffed
                </button>
                <button class="btn-glass ${deptTableFilter === 'active_traffic' ? 'btn-primary-liquid' : ''}" onclick="setDeptTableFilter('active_traffic')" style="padding:4px 10px;font-size:11px;border-radius:7px;font-weight:700;">
                  ⏱️ Active Traffic
                </button>
              </div>

              <!-- Sort Dropdown -->
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:11.5px;color:var(--tx-tertiary);font-weight:600;">Sort:</span>
                <select onchange="setDeptTableSort(this.value)" style="padding:5px 8px;font-size:11.5px;border-radius:7px;border:1px solid #CBD5E1;background:#FFFFFF;color:#0F172A;font-weight:600;">
                  <option value="attention" ${deptTableSort === 'attention' ? 'selected' : ''}>⚠️ Needs Attention First</option>
                  <option value="score_desc" ${deptTableSort === 'score_desc' ? 'selected' : ''}>★ Highest Health Score</option>
                  <option value="open_desc" ${deptTableSort === 'open_desc' ? 'selected' : ''}>📥 Most Open Tickets</option>
                  <option value="sla_asc" ${deptTableSort === 'sla_asc' ? 'selected' : ''}>⏱️ Lowest SLA Compliance</option>
                  <option value="staff_ratio" ${deptTableSort === 'staff_ratio' ? 'selected' : ''}>👥 Highest Load Per Specialist</option>
                </select>
              </div>
            </div>
          </div>

          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12.5px;text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid #E2E8F0;color:var(--tx-tertiary);">
                  <th style="padding:10px 8px;">Department</th>
                  <th style="padding:10px 8px;">Health Score</th>
                  <th style="padding:10px 8px;">Open Tickets</th>
                  <th style="padding:10px 8px;">SLA Compliance</th>
                  <th style="padding:10px 8px;">Staff On Duty</th>
                  <th style="padding:10px 8px;">Average CSAT</th>
                  <th style="padding:10px 8px;text-align:right;">Executive Action</th>
                </tr>
              </thead>
              <tbody>
                ${deptList.map(dept => {
                  const health = dept.healthScore || { score: null, grade: 'Provisional (Awaiting Traffic)', isProvisional: true };
                  const csatText = dept.hasCsatData && dept.avgCSAT !== null && dept.avgCSAT !== undefined ? `★ ${Number(dept.avgCSAT).toFixed(1)}` : '—';
                  const isProvisional = health.isProvisional || health.score === null || health.score === undefined;
                  return `
                    <tr style="border-bottom:1px solid rgba(226,232,240,0.6);">
                      <td style="padding:12px 8px;font-weight:700;color:#0F172A;">
                        ${dept.departmentName} <span style="font-size:11px;color:var(--tx-tertiary);font-weight:500;">(${dept.department})</span>
                      </td>
                      <td style="padding:12px 8px;">
                        ${isProvisional ? `
                          <span class="badge-light" style="font-weight:700;color:#64748B;background:#F1F5F9;" title="No tickets submitted yet. Awaiting customer interactions.">
                            — · Provisional
                          </span>
                        ` : `
                          <span class="badge-light ${health.score >= 88 ? 'badge-green' : health.score >= 75 ? 'badge-blue' : 'badge-amber'}" style="font-weight:800;">
                            ${health.score}% · ${health.grade}
                          </span>
                        `}
                      </td>
                      <td style="padding:12px 8px;"><span class="badge-light badge-blue">${dept.open}</span></td>
                      <td style="padding:12px 8px;font-weight:700;color:${dept.hasSlaData ? (dept.slaCompliance < 90 ? '#DC2626' : '#16A34A') : 'var(--tx-tertiary)'};">
                        ${dept.hasSlaData ? `${dept.slaCompliance}%` : '—'}
                      </td>
                      <td style="padding:12px 8px;">
                        <span style="font-weight:600;color:${dept.onlineStaff > 0 ? '#15803D' : '#94A3B8'};">
                          ● ${dept.onlineStaff} online
                        </span> / ${dept.staffCount} total
                      </td>
                      <td style="padding:12px 8px;font-weight:600;color:#F59E0B;">${csatText}</td>
                      <td style="padding:12px 8px;text-align:right;">
                        <button class="btn-glass" onclick="drillDownDepartment('${dept.department}')" style="padding:5px 10px;font-size:11.5px;font-weight:600;">
                          👁️ Inspect View
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      // Department Manager (or Main Manager inspecting a department)
      const d = dashboardData;
      const targetDept = isMain && inspectingDept ? inspectingDept : user.department;
      const health = d.healthScore || { score: null, grade: d.staffCount === 0 ? 'Unstaffed' : 'Provisional (Awaiting Traffic)', isProvisional: true };
      const hasHealthScore = health && typeof health.score === 'number';
      const healthDisplay = hasHealthScore ? `${health.score}%` : '—';
      const healthGrade = health.grade || (d.staffCount === 0 ? 'Unstaffed' : 'Awaiting Traffic');
      const healthColor = hasHealthScore ? (health.score >= 88 ? '#16A34A' : health.score >= 75 ? '#0284C7' : '#DC2626') : '#64748B';

      const hasSLA = d.hasSlaData && typeof d.slaCompliance === 'number';
      const slaDisplay = hasSLA ? `${d.slaCompliance}%` : '—';
      const slaSubtext = hasSLA ? `${d.slaBreachesThisWeek || 0} breaches this week` : (d.staffCount === 0 ? 'Unstaffed department' : 'No ticket traffic yet');
      const slaColor = hasSLA ? (d.slaCompliance < 90 ? '#DC2626' : '#16A34A') : '#64748B';

      // Truthful metrics formatting
      const csatDisplay = (d.resolved > 0 && d.avgCSAT !== null && d.avgCSAT !== undefined) ? `★ ${Number(d.avgCSAT).toFixed(1)}` : '—';
      const csatSubtext = d.resolved > 0 ? `Based on ${d.resolved} closed tickets` : 'No resolved tickets yet';
      const routingAccuracyText = d.routingAccuracy !== null ? `${d.routingAccuracy}%` : '—';

      // 7-Day Chart Dynamic Scaling
      const trendList = d.trend || [];
      const maxVol = Math.max(1, ...(d.maxTrendVolume ? [d.maxTrendVolume] : trendList.map(t => Math.max(t.opened, t.resolved))));
      const hasAnyTrendVolume = trendList.some(t => t.opened > 0 || t.resolved > 0);

      mount.innerHTML = `
        <!-- KPI Ribbon with Health Score & Truthful Metrics -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;">
          <div class="liquid-glass" style="padding:16px;">
            <div style="font-size:11px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;">Department Queue</div>
            <div style="font-size:26px;font-weight:900;color:#0284C7;margin-top:4px;">${d.open || 0} Open</div>
            <div style="font-size:11px;color:var(--tx-tertiary);margin-top:2px;">${d.resolved || 0} Resolved all-time</div>
          </div>
          
          <div class="liquid-glass" style="padding:16px;">
            <div style="font-size:11px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;">Dept Health Score</div>
            <div style="font-size:26px;font-weight:900;color:${healthColor};margin-top:4px;">${healthDisplay}</div>
            <div style="font-size:11px;color:${healthColor};font-weight:700;margin-top:2px;">${hasHealthScore ? `★ ${healthGrade}` : healthGrade}</div>
          </div>

          <div class="liquid-glass" style="padding:16px;">
            <div style="font-size:11px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;">SLA Compliance</div>
            <div style="font-size:26px;font-weight:900;color:${slaColor};margin-top:4px;">
              ${slaDisplay}
            </div>
            <div style="font-size:11px;color:var(--tx-tertiary);margin-top:2px;">${slaSubtext}</div>
          </div>

          <div class="liquid-glass" style="padding:16px;">
            <div style="font-size:11px;font-weight:700;color:var(--tx-tertiary);text-transform:uppercase;">Average CSAT Rating</div>
            <div style="font-size:26px;font-weight:900;color:#F59E0B;margin-top:4px;">${csatDisplay}</div>
            <div style="font-size:11px;color:var(--tx-tertiary);margin-top:2px;">${csatSubtext} · Accuracy: ${routingAccuracyText}</div>
          </div>
        </div>

        <!-- 7-Day Opened vs Resolved Trend with Dynamic Scaling -->
        <div class="liquid-glass" style="padding:20px;border-radius:18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <h3 style="margin:0;font-size:15px;font-weight:800;color:#0F172A;">7-Day Ticket Volume & Resolution Trend</h3>
            <span style="font-size:11.5px;color:var(--tx-tertiary);">Scaled dynamically to actual volume (Peak: ${maxVol} tickets)</span>
          </div>

          ${!hasAnyTrendVolume ? `
            <div style="padding:32px 16px;text-align:center;background:#FFFFFF;border:1px dashed #E2E8F0;border-radius:12px;">
              <div style="font-size:24px;margin-bottom:6px;">📊</div>
              <div style="font-size:13px;font-weight:700;color:#0F172A;">No Ticket Volume Recorded This Week</div>
              <div style="font-size:11.5px;color:var(--tx-tertiary);max-width:360px;margin:4px auto 0;">
                As employees submit and staff resolve tickets, volume bars scale dynamically here in real time.
              </div>
            </div>
          ` : `
            <div style="display:flex;align-items:flex-end;gap:18px;height:140px;padding:20px 10px 0;">
              ${trendList.map(t => {
                const openH = t.opened > 0 ? Math.max(18, Math.round((t.opened / maxVol) * 85)) : 6;
                const resH = t.resolved > 0 ? Math.max(18, Math.round((t.resolved / maxVol) * 85)) : 6;
                return `
                  <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;">
                    <div style="display:flex;align-items:flex-end;gap:5px;height:95px;">
                      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                        <span style="font-size:9.5px;font-weight:700;color:#0284C7;">${t.opened > 0 ? t.opened : ''}</span>
                        <div style="width:16px;height:${openH}px;background:linear-gradient(to top,#0284C7,#38BDF8);border-radius:4px;" title="Opened: ${t.opened}"></div>
                      </div>
                      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                        <span style="font-size:9.5px;font-weight:700;color:#16A34A;">${t.resolved > 0 ? t.resolved : ''}</span>
                        <div style="width:16px;height:${resH}px;background:linear-gradient(to top,#16A34A,#4ADE80);border-radius:4px;" title="Resolved: ${t.resolved}"></div>
                      </div>
                    </div>
                    <div style="font-size:11px;font-weight:600;color:var(--tx-tertiary);">${t.day}</div>
                  </div>
                `;
              }).join('')}
            </div>
            <div style="display:flex;gap:16px;margin-top:12px;font-size:11.5px;color:var(--tx-tertiary);padding-left:10px;">
              <div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;background:#0284C7;border-radius:3px;"></span> Tickets Opened</div>
              <div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;background:#16A34A;border-radius:3px;"></span> Tickets Resolved</div>
            </div>
          `}
        </div>

        <!-- ─── Workload Balance & Live Active Assignments ─── -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;">
          
          <!-- Workload Balance View -->
          <div class="liquid-glass" style="padding:20px;border-radius:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div>
                <h3 style="margin:0 0 2px;font-size:14px;font-weight:800;color:#0F172A;">⚖️ Workload Balance & Capacity</h3>
                <div style="font-size:11.5px;color:var(--tx-tertiary);">Visualizing the fairness cap (max 10 active tickets/staff)</div>
              </div>
              <span class="badge-light badge-blue" style="font-size:11px;">Balanced Cap</span>
            </div>

            <div id="overview-workload-mount" style="display:flex;flex-direction:column;gap:10px;">
              <div style="padding:16px;text-align:center;color:var(--tx-tertiary);font-size:12px;">Loading workload distribution...</div>
            </div>
          </div>

          <!-- Who's Handling What Right Now -->
          <div class="liquid-glass" style="padding:20px;border-radius:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div>
                <h3 style="margin:0 0 2px;font-size:14px;font-weight:800;color:#0F172A;">🎯 Who's Handling What Right Now</h3>
                <div style="font-size:11.5px;color:var(--tx-tertiary);">Live specialist ticket assignments currently in progress</div>
              </div>
              <span class="badge-light badge-green" style="font-size:11px;">Live Dispatch</span>
            </div>

            <div id="overview-assignments-mount" style="display:flex;flex-direction:column;gap:8px;">
              <div style="padding:16px;text-align:center;color:var(--tx-tertiary);font-size:12px;">Loading live assignments...</div>
            </div>
          </div>

        </div>
      `;

      // Asynchronously fetch Workload and Active Assignments for this dept
      try {
        const wl = await window.PS18.request(`/manager/workload?department=${targetDept}`);
        workloadData = wl;
        const wlMount = document.getElementById('overview-workload-mount');
        if (wlMount) {
          const team = wl.workload || wl.team || [];
          if (team.length === 0) {
            wlMount.innerHTML = `<div style="font-size:12px;color:var(--tx-tertiary);text-align:center;padding:12px;">No staff provisioned for workload tracking.</div>`;
          } else {
            wlMount.innerHTML = team.map(m => {
              const pct = m.capacity_percent !== undefined ? m.capacity_percent : (m.utilization_pct || 0);
              const load = m.load !== undefined ? m.load : (m.current_load || 0);
              const maxCap = m.max_capacity || 10;
              const barColor = m.is_overloaded || m.fairness_status === 'overloaded' ? '#DC2626' : pct > 60 ? '#EA580C' : '#0284C7';
              return `
                <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px;cursor:pointer;" onclick="openStaffProfileModal('${m.id}')">
                  <div style="display:flex;align-items:center;justify-content:space-between;font-size:12.5px;margin-bottom:6px;">
                    <div style="font-weight:700;color:#0F172A;display:flex;align-items:center;gap:6px;">
                      <span>${m.name}</span>
                      <span class="badge-light" style="font-size:10px;">${m.tier}</span>
                    </div>
                    <div style="font-size:11.5px;font-weight:700;color:${barColor};">
                      ${load} / ${maxCap} tickets (${pct}%)
                    </div>
                  </div>
                  <div style="width:100%;height:7px;background:#F1F5F9;border-radius:4px;overflow:hidden;">
                    <div style="width:${Math.min(pct, 100)}%;height:100%;background:${barColor};border-radius:4px;transition:width 0.3s ease;"></div>
                  </div>
                </div>
              `;
            }).join('');
          }
        }
      } catch (_) {}

      try {
        const act = await window.PS18.request(`/manager/active-assignments?department=${targetDept}`);
        activeAssignmentsData = act;
        const actMount = document.getElementById('overview-assignments-mount');
        if (actMount) {
          const assignments = act.assignments || [];
          if (assignments.length === 0) {
            actMount.innerHTML = `
              <div style="padding:20px;text-align:center;background:#FFFFFF;border:1px dashed #E2E8F0;border-radius:10px;">
                <div style="font-size:13px;font-weight:700;color:#0F172A;">No Active Tickets In Flight</div>
                <div style="font-size:11.5px;color:var(--tx-tertiary);margin-top:2px;">
                  ${(d.staffCount === 0) ? 'No specialists provisioned for ticket dispatch yet.' : 'Specialists are currently waiting for incoming queue traffic.'}
                </div>
              </div>
            `;
          } else {
            actMount.innerHTML = assignments.slice(0, 5).map(a => {
              const subj = a.ticket_subject || a.subject || 'Support Ticket';
              const agent = a.agent_name || a.assigned_to_name || 'Specialist';
              const tier = a.agent_tier || a.tier || 'L1';
              const tid = a.ticket_id || a.id;
              return `
                <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <div style="min-width:0;flex:1;">
                    <div style="font-size:12.5px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${subj}</div>
                    <div style="font-size:11px;color:var(--tx-tertiary);">Assigned to <strong>${agent}</strong> (${tier})</div>
                  </div>
                  <span class="badge-light badge-${a.priority === 'critical' ? 'red' : 'blue'}" style="font-size:10.5px;font-weight:700;">
                    #${tid}
                  </span>
                </div>
              `;
            }).join('');
          }
        }
      } catch (_) {}
    }
  }

  // ─── TAB 2: DEPARTMENT CALENDAR (30-DAY, 15-DAY, 7-DAY & DIRECTORY VIEW) ──
  async function renderCalendarTab(mount) {
    const targetDept = isMain && inspectingDept ? inspectingDept : user.department;

    mount.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        
        <!-- View Horizon & Directory Filter Controls -->
        <div class="liquid-glass" style="padding:14px 18px;border-radius:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          
          <!-- Left: View Mode Segmenter (30d / 15d / 7d) -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:12px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.04em;">Time Horizon:</span>
            <div style="display:flex;gap:4px;background:#F1F5F9;padding:3px;border-radius:10px;">
              <button class="btn-glass ${calendarViewRange === '30d' ? 'btn-primary-liquid' : ''}" onclick="setCalendarViewRange('30d')" style="padding:5px 12px;font-size:11.5px;border-radius:7px;font-weight:700;">
                📅 30 Days (Month)
              </button>
              <button class="btn-glass ${calendarViewRange === '15d' ? 'btn-primary-liquid' : ''}" onclick="setCalendarViewRange('15d')" style="padding:5px 12px;font-size:11.5px;border-radius:7px;font-weight:700;">
                ⏱️ 15 Days (Sprint)
              </button>
              <button class="btn-glass ${calendarViewRange === '7d' ? 'btn-primary-liquid' : ''}" onclick="setCalendarViewRange('7d')" style="padding:5px 12px;font-size:11.5px;border-radius:7px;font-weight:700;">
                ⚡ 7 Days (Week)
              </button>
            </div>
          </div>

          <!-- Right: Directory Staff Filter -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:12px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.04em;">Directory Scope:</span>
            <div style="display:flex;gap:4px;">
              <button class="btn-glass ${calendarStaffFilter === 'all' ? 'btn-primary-liquid' : ''}" onclick="setCalendarStaffFilter('all')" style="padding:5px 11px;font-size:11.5px;border-radius:8px;font-weight:700;">
                👥 All Staff
              </button>
              <button class="btn-glass ${calendarStaffFilter === 'support' ? 'btn-primary-liquid' : ''}" onclick="setCalendarStaffFilter('support')" style="padding:5px 11px;font-size:11.5px;border-radius:8px;font-weight:700;">
                🎧 Support Specialists
              </button>
              <button class="btn-glass ${calendarStaffFilter === 'company' ? 'btn-primary-liquid' : ''}" onclick="setCalendarStaffFilter('company')" style="padding:5px 11px;font-size:11.5px;border-radius:8px;font-weight:700;">
                🏢 Company Staff
              </button>
              <button class="btn-glass ${calendarStaffFilter === 'leaves' ? 'btn-primary-liquid' : ''}" onclick="setCalendarStaffFilter('leaves')" style="padding:5px 11px;font-size:11.5px;border-radius:8px;font-weight:700;">
                🏖️ Leaves Submitted
              </button>
            </div>
          </div>

        </div>

        <!-- Dark/Sleek Calendar Card Container -->
        <div style="background:#121824;border:1px solid #1E293B;border-radius:20px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,0.3);color:#F8FAFC;">
          
          <!-- Month Header with View Sub-Controls -->
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <h2 style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#FFFFFF;margin:0;">
                October 2026 — ${targetDept === 'All' ? 'All Departments (Org-Wide)' : `${targetDept} Department`}
              </h2>
              <span class="badge-light badge-blue" style="font-size:11px;font-weight:700;">
                ${calendarViewRange === '30d' ? '30-Day Month View' : calendarViewRange === '15d' ? '15-Day Sprint View' : '7-Day Current Week View'}
              </span>
            </div>

            <!-- Sub-selector for 15-day or 7-day pagination -->
            <div style="display:flex;align-items:center;gap:8px;">
              ${calendarViewRange === '15d' ? `
                <div style="display:flex;gap:4px;background:#1E293B;padding:2px;border-radius:8px;">
                  <button class="btn-glass ${calendarSprintHalf === 1 ? 'btn-primary-liquid' : ''}" onclick="setCalendarSprintHalf(1)" style="padding:4px 10px;font-size:11px;border-radius:6px;color:#FFFFFF;">
                    Oct 1–15
                  </button>
                  <button class="btn-glass ${calendarSprintHalf === 2 ? 'btn-primary-liquid' : ''}" onclick="setCalendarSprintHalf(2)" style="padding:4px 10px;font-size:11px;border-radius:6px;color:#FFFFFF;">
                    Oct 16–31
                  </button>
                </div>
              ` : ''}

              <div style="display:flex;gap:6px;">
                <button class="btn-glass" onclick="window.PS18.showToast('Navigated to September 2026', 'info')" style="padding:6px 12px;background:#1E293B;color:#FFFFFF;border-color:#334155;border-radius:8px;font-size:12px;cursor:pointer;">
                  &lt;
                </button>
                <button class="btn-glass" onclick="window.PS18.showToast('Navigated to November 2026', 'info')" style="padding:6px 12px;background:#1E293B;color:#FFFFFF;border-color:#334155;border-radius:8px;font-size:12px;cursor:pointer;">
                  &gt;
                </button>
              </div>
            </div>
          </div>

          <!-- Calendar Mount -->
          <div id="calendar-grid-mount">
            <div style="padding:40px;text-align:center;color:#64748B;">Loading calendar days...</div>
          </div>

          <!-- Legend Bar -->
          <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-top:20px;padding-top:16px;border-top:1px solid #1E293B;font-size:12px;color:#94A3B8;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="width:8px;height:8px;border-radius:50%;background:#22C55E;box-shadow:0 0 6px #22C55E;"></span>
              <span>Clocked In (In-Office)</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="width:8px;height:8px;border-radius:50%;background:#38BDF8;box-shadow:0 0 6px #38BDF8;"></span>
              <span>Remote / WFH (Online)</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="width:8px;height:8px;border-radius:50%;background:#F59E0B;box-shadow:0 0 6px #F59E0B;"></span>
              <span>On Leave (Approved/Pending)</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="width:8px;height:8px;border-radius:50%;background:#A855F7;box-shadow:0 0 6px #A855F7;"></span>
              <span>Company Holiday</span>
            </div>
          </div>

        </div>

        <!-- Day Inspection & Directory Inspector Panel -->
        <div id="calendar-day-detail" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:18px;padding:22px;box-shadow:0 4px 12px rgba(15,23,42,0.04);">
          Loading directory attendance details...
        </div>

      </div>
    `;

    // Fetch calendar data from backend
    try {
      const cal = await window.PS18.request(`/manager/calendar?month=2026-10&department=${targetDept}&type=${calendarStaffFilter}`);
      calendarData = cal || {};
      renderCalendarGrid();
    } catch (err) {
      const gridEl = document.getElementById('calendar-grid-mount');
      if (gridEl) {
        gridEl.innerHTML = `
          <div style="padding:24px;text-align:center;color:#EF4444;background:rgba(239,68,68,0.1);border-radius:10px;">
            Failed to load calendar: ${err.message || 'Network error'}. Please refresh or try again.
          </div>
        `;
      }
    }
  }

  function renderCalendarGrid() {
    const gridEl = document.getElementById('calendar-grid-mount');
    if (!gridEl || !calendarData) return;

    const firstDayIndex = calendarData.firstDayOfWeek !== undefined ? calendarData.firstDayOfWeek : 4;
    const daysInMonth = calendarData.daysInMonth || 31;
    const dayList = calendarData.days || calendarData.calendarDays || [];

    if (calendarViewRange === '30d') {
      // ─── 30-DAY / MONTH GRID (7 COLUMNS) ───────────────────────
      let html = `
        <div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:12px;font-weight:700;color:#94A3B8;margin-bottom:12px;">
          <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;">
      `;

      // Empty offset slots for October 2026 start
      for (let i = 0; i < firstDayIndex; i++) {
        html += `<div style="min-height:72px;background:rgba(30,41,59,0.3);border-radius:10px;border:1px solid transparent;"></div>`;
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dayData = dayList.find(d => (d.dayNumber || d.day) === day) || {};
        const dots = dayData.dots || dayData.attendanceDots || {};
        const isSelected = selectedCalDay === day;

        const hasHoliday = dots.holiday || dots.hasHoliday || Boolean(dayData.holiday);
        const hasLeave = dots.leave || dots.hasLeave || (dayData.leaves && dayData.leaves.length > 0);
        const hasAttendance = dots.attendance || dots.hasAttendance || (dayData.presentStaff && dayData.presentStaff.length > 0);

        let dotHtml = '';
        if (hasHoliday) {
          dotHtml = `<span style="width:6px;height:6px;border-radius:50%;background:#A855F7;box-shadow:0 0 5px #A855F7;" title="Holiday"></span>`;
        } else if (hasLeave) {
          dotHtml = `<span style="width:6px;height:6px;border-radius:50%;background:#F59E0B;box-shadow:0 0 5px #F59E0B;" title="On Leave"></span>`;
        } else if (hasAttendance) {
          dotHtml = `<span style="width:6px;height:6px;border-radius:50%;background:#22C55E;box-shadow:0 0 5px #22C55E;" title="Clocked In"></span>`;
        }

        html += `
          <div onclick="selectCalendarDay(${day})"
            style="min-height:72px;padding:8px;background:${isSelected ? '#2A364F' : '#1A2234'};border:${isSelected ? '1.5px solid #38BDF8' : '1px solid #1E293B'};border-radius:10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;transition:all 0.15s ease;"
            onmouseenter="this.style.borderColor='#38BDF8'"
            onmouseleave="if(${!isSelected}) this.style.borderColor='#1E293B'">
            <div style="font-size:14px;font-weight:700;color:${isSelected ? '#38BDF8' : '#F8FAFC'};">${day}</div>
            <div style="height:8px;display:flex;align-items:center;justify-content:center;">${dotHtml}</div>
          </div>
        `;
      }
      html += `</div>`;
      gridEl.innerHTML = html;

    } else if (calendarViewRange === '15d') {
      // ─── 15-DAY SPRINT VIEW (2 WEEKS) ──────────────────────────
      const startDay = calendarSprintHalf === 1 ? 1 : 16;
      const endDay = calendarSprintHalf === 1 ? 15 : daysInMonth;
      const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      let html = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;">`;
      for (let day = startDay; day <= endDay; day++) {
        const dayData = dayList.find(d => (d.dayNumber || d.day) === day) || {};
        const isSelected = selectedCalDay === day;
        const weekdayName = weekdays[dayData.weekday !== undefined ? dayData.weekday : (new Date(2026, 9, day).getDay())];
        const isHoliday = Boolean(dayData.holiday);
        const presentCount = dayData.presentStaff?.length || 0;
        const leaveCount = (dayData.leaves || dayData.onLeave || []).length;
        const remoteCount = dayData.staffRemote?.length || 0;

        html += `
          <div onclick="selectCalendarDay(${day})"
            style="padding:14px;background:${isSelected ? '#2A364F' : '#1A2234'};border:${isSelected ? '2px solid #38BDF8' : '1px solid #1E293B'};border-radius:12px;cursor:pointer;display:flex;flex-direction:column;gap:8px;transition:all 0.15s ease;"
            onmouseenter="this.style.borderColor='#38BDF8'"
            onmouseleave="if(${!isSelected}) this.style.borderColor='#1E293B'">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;">${weekdayName}</span>
              <span style="font-size:15px;font-weight:900;color:${isSelected ? '#38BDF8' : '#FFFFFF'};">Oct ${day}</span>
            </div>

            ${isHoliday ? `
              <div style="background:#581C87;color:#E9D5FF;padding:3px 8px;border-radius:6px;font-size:10.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                🟣 ${dayData.holiday.name}
              </div>
            ` : (dayData.event || dayData.events?.[0]) ? `
              <div style="background:#0C4A6E;color:#BAE6FD;padding:3px 8px;border-radius:6px;font-size:10.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                📅 ${(dayData.event || dayData.events[0]).title}
              </div>
            ` : `
              <div style="font-size:11px;color:#64748B;">Normal work day</div>
            `}

            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;">
              <span style="font-size:10.5px;font-weight:700;color:#4ADE80;background:rgba(34,197,94,0.15);padding:2px 6px;border-radius:4px;">
                🟢 ${presentCount > 0 ? `${presentCount} in` : '0 in'}
              </span>
              ${remoteCount > 0 ? `
                <span style="font-size:10.5px;font-weight:700;color:#38BDF8;background:rgba(56,189,248,0.15);padding:2px 6px;border-radius:4px;">
                  🏠 ${remoteCount} WFH
                </span>
              ` : ''}
              ${leaveCount > 0 ? `
                <span style="font-size:10.5px;font-weight:700;color:#FBBF24;background:rgba(245,158,11,0.15);padding:2px 6px;border-radius:4px;">
                  🟠 ${leaveCount} leave
                </span>
              ` : ''}
            </div>
          </div>
        `;
      }
      html += `</div>`;
      gridEl.innerHTML = html;

    } else if (calendarViewRange === '7d') {
      // ─── 7-DAY CURRENT WEEK VIEW ───────────────────────────────
      // Center 7 days around selectedCalDay (bounded by 1..daysInMonth)
      let startDay = Math.max(1, selectedCalDay - 3);
      let endDay = Math.min(daysInMonth, startDay + 6);
      if (endDay - startDay < 6) {
        startDay = Math.max(1, endDay - 6);
      }
      const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      let html = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;">`;
      for (let day = startDay; day <= endDay; day++) {
        const dayData = dayList.find(d => (d.dayNumber || d.day) === day) || {};
        const isSelected = selectedCalDay === day;
        const weekdayName = weekdays[dayData.weekday !== undefined ? dayData.weekday : (new Date(2026, 9, day).getDay())];
        const isHoliday = Boolean(dayData.holiday);
        const presentCount = dayData.presentStaff?.length || 0;
        const leaveCount = (dayData.leaves || dayData.onLeave || []).length;

        html += `
          <div onclick="selectCalendarDay(${day})"
            style="padding:14px 10px;background:${isSelected ? '#2A364F' : '#1A2234'};border:${isSelected ? '2px solid #38BDF8' : '1px solid #1E293B'};border-radius:12px;cursor:pointer;display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;transition:all 0.15s ease;"
            onmouseenter="this.style.borderColor='#38BDF8'"
            onmouseleave="if(${!isSelected}) this.style.borderColor='#1E293B'">
            <span style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;">${weekdayName}</span>
            <span style="font-size:20px;font-weight:900;color:${isSelected ? '#38BDF8' : '#FFFFFF'};">${day}</span>

            ${isHoliday ? `
              <span style="background:#581C87;color:#E9D5FF;padding:2px 6px;border-radius:4px;font-size:9.5px;font-weight:700;">
                Holiday
              </span>
            ` : (dayData.event || dayData.events?.[0]) ? `
              <span style="background:#0C4A6E;color:#BAE6FD;padding:2px 6px;border-radius:4px;font-size:9.5px;font-weight:700;">
                Event
              </span>
            ` : `
              <span style="font-size:10px;color:#64748B;">Standard</span>
            `}

            <div style="font-size:10.5px;font-weight:700;color:#4ADE80;margin-top:4px;">
              🟢 ${presentCount} on duty
            </div>
            ${leaveCount > 0 ? `
              <div style="font-size:10.5px;font-weight:700;color:#FBBF24;">
                🟠 ${leaveCount} on leave
              </div>
            ` : ''}
          </div>
        `;
      }
      html += `</div>`;
      gridEl.innerHTML = html;
    }

    updateCalendarDayDetail(selectedCalDay);
  }

  window.setCalendarViewRange = (mode) => {
    calendarViewRange = mode;
    renderCalendarGrid();
  };

  window.setCalendarSprintHalf = (half) => {
    calendarSprintHalf = half;
    renderCalendarGrid();
  };

  window.selectCalendarDay = (day) => {
    selectedCalDay = day;
    renderCalendarGrid();
  };

  window.setCalendarStaffFilter = (filter) => {
    calendarStaffFilter = filter;
    renderCalendarTab(document.getElementById('manager-content'));
  };

  window.setDeptTableSort = (sort) => {
    deptTableSort = sort;
    renderOverviewTab(document.getElementById('manager-content'));
  };

  window.setDeptTableFilter = (filter) => {
    deptTableFilter = filter;
    renderOverviewTab(document.getElementById('manager-content'));
  };

  function updateCalendarDayDetail(day) {
    const detailEl = document.getElementById('calendar-day-detail');
    if (!detailEl || !calendarData) return;

    const dayList = calendarData.days || calendarData.calendarDays || [];
    const dayData = dayList.find(d => (d.dayNumber || d.day) === day) || {};
    const targetDept = isMain && inspectingDept ? inspectingDept : user.department;

    const holiday = dayData.holiday;
    const event = dayData.event || dayData.events?.[0];
    const leaves = dayData.leaves || dayData.onLeave || [];
    const presentStaff = dayData.presentStaff || dayData.staffPresent || [];
    const remoteStaff = dayData.staffRemote || [];
    const directoryProfiles = calendarData.directoryProfiles || [];
    const supportRoster = dashboardData?.roster || [];

    // Filter staff according to calendarStaffFilter
    let displaySupport = (calendarStaffFilter === 'all' || calendarStaffFilter === 'support');
    let displayCompany = (calendarStaffFilter === 'all' || calendarStaffFilter === 'company');
    let displayLeavesOnly = (calendarStaffFilter === 'leaves');

    detailEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        
        <!-- Day Inspector Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-bottom:12px;border-bottom:1px solid #E2E8F0;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:20px;">📅</span>
              <h3 style="margin:0;font-size:16px;font-weight:900;color:#0F172A;">
                October ${day}, 2026 Directory & Attendance Breakdown
              </h3>
              <span class="badge-light badge-blue" style="font-size:11px;font-weight:700;">
                ${targetDept === 'All' ? 'All 11 Departments' : targetDept}
              </span>
            </div>
            <div style="font-size:12px;color:var(--tx-tertiary);margin-top:2px;">
              Comprehensive staff directory view combining support specialists, corporate staff, approved leaves, and swipe telemetry.
            </div>
          </div>

          <div style="display:flex;gap:6px;">
            <span class="badge-light badge-green" style="font-size:11px;font-weight:700;">
              🟢 ${presentStaff.length} Clocked In
            </span>
            <span class="badge-light badge-blue" style="font-size:11px;font-weight:700;">
              🏠 ${remoteStaff.length} Remote WFH
            </span>
            <span class="badge-light ${leaves.length > 0 ? 'badge-amber' : 'badge-green'}" style="font-size:11px;font-weight:700;">
              🟠 ${leaves.length} On Leave
            </span>
          </div>
        </div>

        <!-- Holiday / Event Banners if applicable -->
        ${holiday ? `
          <div style="background:#FAF5FF;border:1px solid #E9D5FF;border-left:4px solid #A855F7;border-radius:10px;padding:12px 14px;color:#6B21A8;">
            <div style="font-weight:800;font-size:13px;">🟣 Company Holiday: ${holiday.name}</div>
            <div style="font-size:11.5px;color:#7E22CE;margin-top:2px;">Type: ${(holiday.type || 'national').toUpperCase()} · Official corporate non-working day.</div>
          </div>
        ` : ''}

        ${event ? `
          <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-left:4px solid #0284C7;border-radius:10px;padding:12px 14px;color:#0369A1;">
            <div style="font-weight:800;font-size:13px;">📅 Scheduled Event: ${event.title}</div>
            <div style="font-size:11.5px;color:#0284C7;margin-top:2px;">Time: ${event.time || '10:00 AM'} · Location: ${event.location || 'HQ Training Lab'} · ${event.description || ''}</div>
          </div>
        ` : ''}

        <!-- Submitted Leaves Section -->
        <div>
          <div style="font-size:13px;font-weight:800;color:#0F172A;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span>🏖️ Submitted Leaves (Active or Pending on October ${day})</span>
            <span class="badge-light ${leaves.length > 0 ? 'badge-amber' : ''}" style="font-size:10.5px;">${leaves.length}</span>
          </div>

          ${leaves.length === 0 ? `
            <div style="padding:14px;background:#F8FAFC;border:1px dashed #CBD5E1;border-radius:10px;font-size:12px;color:var(--tx-tertiary);text-align:center;">
              Zero staff leaves submitted or active for this date. Full scheduled capacity available.
            </div>
          ` : `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;">
              ${leaves.map(l => `
                <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <div>
                    <div style="font-size:13px;font-weight:800;color:#92400E;">${l.name || l.employee_name}</div>
                    <div style="font-size:11px;color:#B45309;">
                      <strong>${(l.type || l.leave_type || 'leave').toUpperCase()}</strong> (${l.days || 1} day${(l.days || 1) === 1 ? '' : 's'}) · ${l.reason || 'Personal'}
                    </div>
                    <div style="font-size:10.5px;color:var(--tx-tertiary);margin-top:2px;">
                      Window: ${l.start_date || '2026-10'} to ${l.end_date || '2026-10'}
                    </div>
                  </div>
                  <span class="badge-light ${l.status === 'approved' ? 'badge-green' : 'badge-amber'}" style="font-size:10.5px;font-weight:700;">
                    ${(l.status || 'pending').toUpperCase()}
                  </span>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Staff Directory Section -->
        ${!displayLeavesOnly ? `
          <div>
            <div style="font-size:13px;font-weight:800;color:#0F172A;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
              <span>👥 Directory Staff Profiles & Attendance Status</span>
              <span class="badge-light badge-blue" style="font-size:10.5px;">
                ${displaySupport && displayCompany ? 'All Personnel' : displaySupport ? 'Support Specialists' : 'Company Staff'}
              </span>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:10px;">
              
              <!-- Support Specialists -->
              ${displaySupport ? (supportRoster.length === 0 ? `
                <div style="grid-column:1/-1;padding:14px;background:#F8FAFC;border:1px dashed #CBD5E1;border-radius:10px;font-size:12px;color:var(--tx-tertiary);text-align:center;">
                  No support specialists provisioned for ${targetDept === 'All' ? 'this organization' : targetDept} yet. Onboard specialists to track attendance and swipe telemetry.
                </div>
              ` : supportRoster.slice(0, targetDept === 'All' ? 14 : 6).map(s => {
                const isSwiped = presentStaff.some(p => p.id === s.id || p.name === s.name);
                const isRemote = s.work_mode === 'remote_wfh';
                const onLeave = leaves.some(l => l.name === s.name);

                let statusBadge = `<span class="badge-light badge-green" style="font-size:10px;font-weight:700;">🟢 Clocked In (Office)</span>`;
                if (onLeave) {
                  statusBadge = `<span class="badge-light badge-amber" style="font-size:10px;font-weight:700;">🟠 On Leave</span>`;
                } else if (isRemote) {
                  statusBadge = `<span class="badge-light badge-blue" style="font-size:10px;font-weight:700;">🏠 Remote WFH</span>`;
                } else if (!isSwiped) {
                  statusBadge = `<span class="badge-light" style="font-size:10px;color:#64748B;">⚪ Scheduled</span>`;
                }

                const joinedDateText = s.created_at
                  ? new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Recently Provisioned';

                return `
                  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                      <div style="display:flex;align-items:center;gap:8px;">
                        <div style="width:30px;height:30px;border-radius:50%;background:#E0F2FE;color:#0369A1;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:12px;">
                          ${s.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style="font-size:13px;font-weight:800;color:#0F172A;">${s.name}</div>
                          <div style="font-size:10.5px;color:var(--tx-tertiary);">${s.department} · Support Specialist (${s.tier || 'L1'})</div>
                        </div>
                      </div>
                      ${statusBadge}
                    </div>

                    <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--tx-tertiary);border-top:1px solid #EEF2F6;padding-top:6px;margin-top:2px;">
                      <span>First Day: <strong style="color:#0F172A;">${joinedDateText}</strong></span>
                      <span>${isRemote ? 'Remote Active' : isSwiped ? 'Swiped: Door 01' : 'No swipe today'}</span>
                    </div>
                  </div>
                `;
              }).join('')) : ''}

              <!-- Corporate Directory Staff -->
              ${displayCompany ? (directoryProfiles.length === 0 ? `
                <div style="grid-column:1/-1;padding:14px;background:#F8FAFC;border:1px dashed #CBD5E1;border-radius:10px;font-size:12px;color:var(--tx-tertiary);text-align:center;">
                  No corporate employees registered for ${targetDept === 'All' ? 'this organization' : targetDept} yet.
                </div>
              ` : directoryProfiles.slice(0, targetDept === 'All' ? 8 : 4).map(p => `
                <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <div style="font-size:20px;">${p.avatar || '🧑‍💼'}</div>
                      <div>
                        <div style="font-size:13px;font-weight:800;color:#0F172A;">${p.name}</div>
                        <div style="font-size:10.5px;color:var(--tx-tertiary);">${p.role} · ${p.department}</div>
                      </div>
                    </div>
                    <span class="badge-light" style="font-size:10px;color:#0284C7;background:#F0F9FF;font-weight:700;">
                      ${p.location?.split('—')[0]?.trim() || 'HQ'}
                    </span>
                  </div>

                  <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--tx-tertiary);border-top:1px solid #F1F5F9;padding-top:6px;margin-top:2px;">
                    <span>First Day: <strong style="color:#0F172A;">${p.joined || 'Recently Joined'}</strong></span>
                    <span style="color:#0284C7;">${p.email}</span>
                  </div>
                </div>
              `).join('')) : ''}

            </div>
          </div>
        ` : ''}

        <!-- OneGate Corporate Presence Policy Footnote -->
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:10px 14px;font-size:11px;color:var(--tx-tertiary);display:flex;align-items:center;gap:8px;">
          <span>💡</span>
          <span>
            <strong>Corporate Presence Policy:</strong> Remote / WFH staff are verified online via SSO cloud telemetry without door swipes. On-premises staff require NFC badge swipes at Turnstile Door 01 to record physical presence.
          </span>
        </div>

      </div>
    `;
  }

  // ─── TAB 3: LEAVE APPROVAL QUEUE ──────────────────────────────
  async function renderLeaveQueueTab(mount) {
    const targetDept = isMain && inspectingDept ? inspectingDept : user.department;

    mount.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        
        <!-- Header -->
        <div class="liquid-glass" style="padding:20px;border-radius:18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
              <h3 style="margin:0 0 2px;font-size:16px;font-weight:800;color:#0F172A;">
                ${targetDept === 'All' ? 'All 11 Departments' : targetDept} Leave Approval Queue
              </h3>
              <div style="font-size:12px;color:var(--tx-tertiary);">
                Actionable queue for managers to review, approve, or deny employee and specialist time-off requests.
              </div>
            </div>
            <div id="pending-leave-count-badge" class="badge-light badge-amber" style="font-size:12px;font-weight:700;">
              Loading requests...
            </div>
          </div>
        </div>

        <!-- Pending Leave Requests List -->
        <div class="liquid-glass" style="padding:22px;border-radius:18px;">
          <h4 style="margin:0 0 14px;font-size:14px;font-weight:800;color:#0F172A;">
            ⏳ Pending Requests Awaiting Manager Action
          </h4>

          <div id="leave-pending-mount" style="display:flex;flex-direction:column;gap:12px;">
            <div style="padding:24px;text-align:center;color:var(--tx-tertiary);">Loading pending requests...</div>
          </div>
        </div>

        <!-- Leave History Audit Log -->
        <div class="liquid-glass" style="padding:22px;border-radius:18px;">
          <h4 style="margin:0 0 14px;font-size:14px;font-weight:800;color:#0F172A;">
            📋 Recent Leave Decisions & Past Requests
          </h4>

          <div id="leave-history-mount" style="display:flex;flex-direction:column;gap:10px;">
            <div style="padding:20px;text-align:center;color:var(--tx-tertiary);">Loading leave history...</div>
          </div>
        </div>

      </div>
    `;

    try {
      const data = await window.PS18.request(`/manager/leave-requests?department=${targetDept}`);
      leaveRequestsData = data;

      const badgeEl = document.getElementById('pending-leave-count-badge');
      if (badgeEl) {
        badgeEl.innerText = `${data.pendingCount || 0} Pending Approvals`;
        badgeEl.className = `badge-light ${data.pendingCount > 0 ? 'badge-amber' : 'badge-green'}`;
      }

      const pendingMount = document.getElementById('leave-pending-mount');
      if (pendingMount) {
        if (!data.pending || data.pending.length === 0) {
          pendingMount.innerHTML = `
            <div style="text-align:center;padding:36px 20px;background:#FFFFFF;border:1px dashed #CBD5E1;border-radius:14px;">
              <div style="font-size:28px;margin-bottom:8px;">✅</div>
              <div style="font-size:14px;font-weight:800;color:#0F172A;">All Leave Requests Reviewed</div>
              <div style="font-size:12px;color:var(--tx-tertiary);margin-top:2px;">No pending leave applications awaiting approval ${targetDept === 'All' ? 'across any of the 11 departments' : `for ${targetDept}`}.</div>
            </div>
          `;
        } else {
          pendingMount.innerHTML = data.pending.map(r => `
            <div style="padding:16px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,0.04);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;">
              <div style="min-width:220px;flex:1;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:14px;font-weight:800;color:#0F172A;">${r.employee_name}</span>
                  <span class="badge-light badge-purple" style="font-size:11px;font-weight:700;">${(r.leave_type || 'vacation').toUpperCase()}</span>
                  <span class="badge-light badge-amber" style="font-size:11px;font-weight:700;">PENDING</span>
                </div>
                <div style="font-size:12px;color:#334155;margin-top:4px;">
                  <strong>Dates:</strong> ${r.start_date} to ${r.end_date} (<strong>${r.days} day${r.days > 1 ? 's' : ''}</strong>)
                </div>
                <div style="font-size:11.5px;color:var(--tx-tertiary);margin-top:2px;">
                  Reason: "${r.reason || 'Personal leave'}" · Balance: <strong>${r.remaining_days} of ${r.total_entitlement} days remaining</strong>
                </div>
              </div>

              <!-- Action Buttons -->
              <div style="display:flex;align-items:center;gap:8px;">
                <button class="btn-glass" onclick="handleLeaveAction('${r.id}', 'deny')" style="padding:8px 14px;font-size:12px;font-weight:700;color:#DC2626;border-color:#FCA5A5;">
                  ❌ Deny
                </button>
                <button class="btn-primary-liquid" onclick="handleLeaveAction('${r.id}', 'approve')" style="padding:8px 18px;font-size:12px;font-weight:700;background:linear-gradient(135deg,#16A34A,#22C55E);">
                  ✅ Approve Leave
                </button>
              </div>
            </div>
          `).join('');
        }
      }

      const histMount = document.getElementById('leave-history-mount');
      if (histMount) {
        if (!data.history || data.history.length === 0) {
          histMount.innerHTML = `<div style="font-size:12px;color:var(--tx-tertiary);text-align:center;padding:12px;">No past leave decisions recorded.</div>`;
        } else {
          histMount.innerHTML = data.history.map(h => `
            <div style="padding:12px 14px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;display:flex;align-items:center;justify-content:space-between;font-size:12px;">
              <div>
                <strong>${h.employee_name}</strong> · ${h.start_date} to ${h.end_date} (${h.days}d) · ${h.reason || 'Leave'}
              </div>
              <span class="badge-light ${h.status === 'approved' ? 'badge-green' : 'badge-red'}" style="font-weight:700;">
                ${h.status.toUpperCase()}
              </span>
            </div>
          `).join('');
        }
      }
    } catch (err) {
      window.PS18.showToast(err.message || 'Error loading leave requests', 'error');
    }
  }

  window.handleLeaveAction = async (leaveId, action) => {
    try {
      const res = await window.PS18.request(`/manager/leave-requests/${leaveId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      window.PS18.showToast(res.message || `Leave request ${action}d!`, 'success');
      await loadManagerData();
      await renderLeaveQueueTab(document.getElementById('manager-content'));
    } catch (err) {
      window.PS18.showToast(err.message || 'Action failed', 'error');
    }
  };

  // ─── TAB 4: STAFF ROSTER & EXPANDED PROFILE MODAL (IMAGE 3) ────
  function renderRosterTab(mount) {
    const roster = dashboardData.roster || [];
    const targetDept = isMain && inspectingDept ? inspectingDept : user.department;
    const onlineCount = roster.filter(s => s.status === 'online').length;
    const presentCount = roster.filter(s => s.attendance?.status === 'present').length;

    mount.innerHTML = `
      <div class="liquid-glass" style="padding:20px;border-radius:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
          <div>
            <h3 style="margin:0 0 2px;font-size:16px;font-weight:800;color:#0F172A;">
              ${targetDept === 'All' ? 'All 11 Departments' : targetDept} Support Staff Roster & Live Attendance
            </h3>
            <div style="font-size:12px;color:var(--tx-tertiary);">
              ${targetDept === 'All' ? 'Real support specialists provisioned across all 11 departments. Click any card to inspect their expanded profile card.' : 'Real support specialists provisioned for this department. Click any card to inspect their expanded profile card.'}
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn-primary-liquid" onclick="openAddStaffModal()" style="padding:7px 14px;font-size:12.5px;font-weight:700;">
              ➕ Add Support Specialist
            </button>
          </div>
        </div>

        <!-- Roster Summary Chips -->
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
          <div style="padding:8px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;font-size:12px;display:flex;align-items:center;gap:6px;">
            <span>👥</span> Total Staff: <strong>${roster.length}</strong>
          </div>
          <div style="padding:8px 14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;font-size:12px;color:#15803D;display:flex;align-items:center;gap:6px;">
            <span>🟢</span> On-Duty Online: <strong>${onlineCount}</strong>
          </div>
          <div style="padding:8px 14px;background:#F0F9FF;border:1px solid #BAE6FD;border-radius:10px;font-size:12px;color:#0369A1;display:flex;align-items:center;gap:6px;">
            <span>🚪</span> Swiped Present Today: <strong>${presentCount}</strong>
          </div>
        </div>

        ${roster.length === 0 ? `
          <div style="text-align:center;padding:48px 24px;background:#FFFFFF;border:1px dashed #CBD5E1;border-radius:16px;">
            <div style="font-size:36px;margin-bottom:12px;">👥</div>
            <div style="font-size:16px;font-weight:800;color:#0F172A;margin-bottom:6px;">No Support Specialists Provisioned Yet</div>
            <p style="font-size:13px;color:var(--tx-tertiary);max-width:440px;margin:0 auto 18px;line-height:1.5;">
              Your <strong>${targetDept === 'All' ? 'organization' : targetDept}</strong> department queue has no support staff accounts assigned yet. Click below to onboard your first specialist.
            </p>
            <button class="btn-primary-liquid" onclick="openAddStaffModal()" style="padding:10px 18px;font-size:13px;font-weight:700;">
              ➕ Add Support Specialist
            </button>
          </div>
        ` : `
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;">
            ${roster.map(s => {
              const isPresent = s.attendance?.status === 'present';
              const isLate = s.attendance?.status === 'late';
              const swipeTime = s.attendance?.first_swipe_in ? s.attendance.first_swipe_in.split('T')[1].slice(0, 5) : null;
              const isRemote = s.work_mode === 'remote_wfh';
              const isUnverifiedOffice = s.status === 'online' && !isRemote && !isPresent;

              return `
                <div style="padding:16px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,0.04);display:flex;flex-direction:column;gap:12px;position:relative;">
                  
                  <!-- Top Row: Specialist Identity (Click opens Expanded Profile Image 3) -->
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
                    <div style="cursor:pointer;" onclick="openStaffProfileModal('${s.id}')" title="Click to open expanded profile">
                      <div style="font-weight:800;font-size:14px;color:#0F172A;display:flex;align-items:center;gap:6px;">
                        <span>${s.name}</span>
                        ${s.department ? `<span class="badge-light badge-blue" style="font-size:10px;font-weight:700;">${s.department}</span>` : ''}
                        ${s.active === false ? '<span class="badge-light badge-red" style="font-size:10px;">Suspended</span>' : ''}
                      </div>
                      <div style="font-size:12px;color:var(--tx-tertiary);">${s.email}</div>
                    </div>

                    <!-- Live Presence Dropdown -->
                    <select onchange="handleStaffStatusChange('${s.id}', this.value)"
                      style="padding:4px 8px;font-size:11.5px;font-weight:700;border-radius:8px;border:1px solid #CBD5E1;background:${s.status === 'online' ? '#F0FDF4' : s.status === 'busy' ? '#FEF2F2' : s.status === 'away' ? '#FFFBEB' : '#F1F5F9'};color:${s.status === 'online' ? '#15803D' : s.status === 'busy' ? '#B91C1C' : s.status === 'away' ? '#B45309' : '#64748B'};outline:none;">
                      <option value="online" ${s.status === 'online' ? 'selected' : ''}>🟢 Online</option>
                      <option value="busy" ${s.status === 'busy' ? 'selected' : ''}>🔴 Busy</option>
                      <option value="away" ${s.status === 'away' ? 'selected' : ''}>🟡 Away</option>
                      <option value="offline" ${s.status === 'offline' ? 'selected' : ''}>⚪ Offline</option>
                    </select>
                  </div>

                  <!-- Policy Notice (Online without a swipe) -->
                  ${isUnverifiedOffice ? `
                    <div style="padding:6px 10px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:11px;color:#B45309;display:flex;align-items:center;justify-content:space-between;">
                      <span>⚠️ <strong>Unverified Office Presence:</strong> Online without door swipe</span>
                      <button onclick="handleSetWorkMode('${s.id}', 'remote_wfh')" style="border:none;background:none;color:#0284C7;font-weight:700;font-size:10.5px;cursor:pointer;text-decoration:underline;">Authorize WFH</button>
                    </div>
                  ` : isRemote ? `
                    <div style="padding:4px 8px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;font-size:11px;color:#1D4ED8;display:flex;align-items:center;gap:5px;">
                      <span>🏠 <strong>Authorized Remote:</strong> Compliant WFH</span>
                    </div>
                  ` : ''}

                  <!-- Middle Row: Tier & Attendance Strip -->
                  <div style="padding:10px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;display:flex;flex-direction:column;gap:8px;">
                    
                    <!-- Tier Selector & Work Mode Switch -->
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                      <span style="font-size:11.5px;font-weight:700;color:var(--tx-secondary);">Support Tier</span>
                      <select onchange="handleStaffTierChange('${s.id}', this.value)"
                        style="padding:3px 8px;font-size:11.5px;font-weight:700;border-radius:6px;border:1px solid #CBD5E1;background:#FFFFFF;color:#0F172A;outline:none;">
                        <option value="L1" ${s.tier === 'L1' ? 'selected' : ''}>L1 Frontline</option>
                        <option value="L2" ${s.tier === 'L2' ? 'selected' : ''}>L2 Specialist</option>
                        <option value="L3" ${s.tier === 'L3' ? 'selected' : ''}>L3 Senior Lead</option>
                      </select>
                    </div>

                    <!-- Attendance & Door Swipe Clock-In -->
                    <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px dashed #E2E8F0;">
                      <div>
                        <div style="font-size:11.5px;font-weight:700;display:flex;align-items:center;gap:5px;">
                          ${isPresent ? '<span style="color:#15803D;">✅ Clocked In</span>' : isLate ? '<span style="color:#D97706;">⏰ Late</span>' : '<span style="color:#DC2626;">❌ Not Swiped</span>'}
                        </div>
                        <div style="font-size:10.5px;color:var(--tx-tertiary);">
                          ${swipeTime ? `Swiped: ${swipeTime}` : 'Zero swipes today'}
                        </div>
                      </div>

                      <button class="btn-glass" onclick="handleSimulateSwipe('${s.id}', '${isPresent ? 'OUT' : 'IN'}')"
                        style="padding:4px 9px;font-size:11px;font-weight:700;border-color:#CBD5E1;background:#FFFFFF;">
                        🚪 ${isPresent ? 'Swipe OUT' : 'Swipe IN'}
                      </button>
                    </div>
                  </div>

                  <!-- Bottom Stats & Profile Card Trigger -->
                  <div style="display:flex;align-items:center;justify-content:space-between;font-size:11.5px;padding-top:2px;">
                    <div>Load: <strong>${s.current_load || 0}</strong> tickets</div>
                    <div>Score: <strong style="color:#F59E0B;">★ ${typeof s.rolling_score === 'number' ? s.rolling_score.toFixed(1) : '5.0'}</strong></div>
                    <button onclick="openStaffProfileModal('${s.id}')"
                      style="border:none;background:none;font-size:11px;color:#0284C7;cursor:pointer;font-weight:700;text-decoration:underline;">
                      View Profile ➔
                    </button>
                  </div>

                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  }

  // ─── MODAL: EXPANDED STAFF PROFILE (IMAGE 3 REPRODUCTION) ─────
  window.openStaffProfileModal = async (staffId) => {
    const modal = document.getElementById('staff-profile-modal');
    const mount = document.getElementById('staff-profile-card-mount');
    if (!modal || !mount) return;

    modal.style.display = 'flex';
    mount.innerHTML = `<div class="liquid-glass" style="padding:30px;text-align:center;color:var(--tx-tertiary);">Loading employee profile...</div>`;

    try {
      const p = await window.PS18.request(`/manager/staff/${staffId}/profile`);
      
      mount.innerHTML = `
        <div style="background:#121824;border:1px solid #1E293B;border-radius:20px;padding:24px;box-shadow:0 12px 35px rgba(0,0,0,0.4);color:#F8FAFC;font-family:inherit;">
          
          <!-- Top Row: Avatar Initials, Name, Email, Badge, Close -->
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:20px;">
            <div style="display:flex;align-items:center;gap:14px;">
              <div style="width:48px;height:48px;border-radius:50%;background:#0284C7;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:16px;font-weight:900;box-shadow:0 2px 8px rgba(2,132,199,0.3);">
                ${p.initials || (p.name ? p.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() : 'PS')}
              </div>
              <div>
                <div style="font-size:16px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;">${p.name}</div>
                <div style="font-size:12px;color:#94A3B8;">${p.email}</div>
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:8px;">
              <span style="background:rgba(2,132,199,0.2);color:#38BDF8;border:1px solid rgba(56,189,248,0.3);padding:4px 10px;border-radius:8px;font-size:11px;font-weight:700;">
                ${p.role_label || p.role_badge || 'Support staff'}
              </span>
              <button onclick="closeStaffProfileModal()" style="border:none;background:none;font-size:18px;cursor:pointer;color:#94A3B8;">✕</button>
            </div>
          </div>

          <!-- 4-Grid Stats (Image 3 design) -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
            <div style="background:#1A2234;border:1px solid #1E293B;border-radius:12px;padding:12px 14px;">
              <div style="font-size:11px;color:#94A3B8;margin-bottom:3px;">Joined</div>
              <div style="font-size:13.5px;font-weight:800;color:#FFFFFF;">${p.joined_display || p.joined_formatted || 'Mar 11, 2024'}</div>
            </div>
            <div style="background:#1A2234;border:1px solid #1E293B;border-radius:12px;padding:12px 14px;">
              <div style="font-size:11px;color:#94A3B8;margin-bottom:3px;">Tenure</div>
              <div style="font-size:13.5px;font-weight:800;color:#FFFFFF;">${p.tenure_display || p.tenure || '2 yr 7 mo'}</div>
            </div>
            <div style="background:#1A2234;border:1px solid #1E293B;border-radius:12px;padding:12px 14px;">
              <div style="font-size:11px;color:#94A3B8;margin-bottom:3px;">Tier</div>
              <div style="font-size:13.5px;font-weight:800;color:#FFFFFF;">${p.tier_display || p.tier || 'L3 senior lead'}</div>
            </div>
            <div style="background:#1A2234;border:1px solid #1E293B;border-radius:12px;padding:12px 14px;">
              <div style="font-size:11px;color:#94A3B8;margin-bottom:3px;">Currently handling</div>
              <div style="font-size:13.5px;font-weight:800;color:#FFFFFF;">${p.current_handling_display || p.currently_handling?.summary || `${p.department} · 0 open tickets`}</div>
            </div>
          </div>

          <!-- Work Mode Policy Toggle (Corporate Rule) -->
          <div style="background:#1A2234;border:1px solid #1E293B;border-radius:12px;padding:12px 14px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="font-size:11px;color:#94A3B8;margin-bottom:2px;">Work Mode Policy</div>
              <div style="font-size:12.5px;font-weight:700;color:#FFFFFF;">
                ${p.work_mode === 'remote_wfh' ? '🏠 Remote / WFH (Swipe Not Required)' : '🏢 In-Office (Door Swipe Clock-In Required)'}
              </div>
            </div>
            <select onchange="handleSetWorkMode('${p.id}', this.value)"
              style="padding:5px 9px;font-size:11.5px;font-weight:700;border-radius:6px;border:1px solid #334155;background:#121824;color:#FFFFFF;outline:none;">
              <option value="office" ${p.work_mode === 'office' ? 'selected' : ''}>🏢 In-Office</option>
              <option value="remote_wfh" ${p.work_mode === 'remote_wfh' ? 'selected' : ''}>🏠 Remote / WFH</option>
            </select>
          </div>

          <!-- Cross-Training Coverage Badges -->
          <div style="background:#1A2234;border:1px solid #1E293B;border-radius:12px;padding:12px 14px;margin-bottom:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div style="font-size:11px;color:#94A3B8;">Cross-Trained Coverage (Off-Peak Hours)</div>
              <button onclick="handleEditCrossTraining('${p.id}')" style="border:none;background:none;font-size:11px;color:#38BDF8;cursor:pointer;font-weight:700;text-decoration:underline;">Edit</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${(p.cross_training_depts || p.cross_coverage || ['HR', 'Customer Support']).map(cc => `
                <span style="background:rgba(56,189,248,0.15);color:#38BDF8;border:1px solid rgba(56,189,248,0.3);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;">
                  🔄 Cross-covers ${cc}
                </span>
              `).join('')}
            </div>
          </div>

          <!-- Leave Balance Progress Bar (Image 3 design) -->
          <div style="background:#1A2234;border:1px solid #1E293B;border-radius:12px;padding:12px 14px;margin-bottom:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#94A3B8;margin-bottom:6px;">
              <span>Leave balance</span>
              <span style="color:#22C55E;font-weight:700;">${p.leave_balance?.display || p.leave_balance?.summary || '14 of 18 days remaining'}</span>
            </div>
            <div style="width:100%;height:6px;background:#334155;border-radius:3px;overflow:hidden;">
              <div style="width:${p.leave_balance?.percent !== undefined ? p.leave_balance.percent : (p.leave_balance?.percentage || 78)}%;height:100%;background:#22C55E;border-radius:3px;"></div>
            </div>
          </div>

          <!-- Onboarding Checklist Tracker -->
          <div style="background:#1A2234;border:1px solid #1E293B;border-radius:12px;padding:12px 14px;margin-bottom:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#94A3B8;margin-bottom:8px;">
              <span>Onboarding Checklist</span>
              <span style="color:#38BDF8;font-weight:700;">${p.onboarding_checklist?.completed !== undefined ? p.onboarding_checklist.completed : (p.onboarding?.completed_count || 4)} of ${p.onboarding_checklist?.total !== undefined ? p.onboarding_checklist.total : (p.onboarding?.total_count || 5)} steps completed</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;font-size:11.5px;">
              ${(p.onboarding_checklist?.items || p.onboarding?.steps || [
                { name: 'Documents signed', completed: true },
                { name: 'Equipment assigned', completed: true },
                { name: 'Identity badge issued', completed: true },
                { name: 'First swipe recorded', completed: true },
                { name: 'Tier training completed', completed: false }
              ]).map(step => `
                <div style="display:flex;align-items:center;gap:6px;color:${step.completed ? '#E2E8F0' : '#64748B'};">
                  <span>${step.completed ? '✅' : '⚪'}</span>
                  <span style="${step.completed ? 'text-decoration:none;' : 'text-decoration:none;opacity:0.6;'}">${step.name || step.label}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Bottom Row: Pending Leave Request & Score (Image 3 design) -->
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;padding-top:4px;border-top:1px solid #1E293B;">
            <div style="color:#94A3B8;display:flex;align-items:center;gap:6px;">
              <span>📅</span>
              <span>${p.pending_leave_request ? (p.pending_leave_request.has_pending ? p.pending_leave_request.display : 'No pending leave request') : (p.pending_leave ? `Pending: ${p.pending_leave.days}d` : 'No pending leave request')}</span>
            </div>
            <div style="font-weight:800;color:#FBBF24;display:flex;align-items:center;gap:4px;">
              <span>★</span>
              <span>${Number(p.rolling_score !== undefined ? p.rolling_score : (p.score !== undefined ? p.score : 5.0)).toFixed(1)} score</span>
            </div>
          </div>

        </div>
      `;
    } catch (err) {
      mount.innerHTML = `<div style="color:#EF4444;text-align:center;padding:20px;">Error: ${err.message}</div>`;
    }
  };

  window.closeStaffProfileModal = () => {
    const modal = document.getElementById('staff-profile-modal');
    if (modal) modal.style.display = 'none';
  };

  window.handleSetWorkMode = async (staffId, mode) => {
    try {
      await window.PS18.request(`/manager/staff/${staffId}/work-mode`, {
        method: 'PATCH',
        body: JSON.stringify({ work_mode: mode }),
      });
      window.PS18.showToast(`Updated work mode to ${mode === 'remote_wfh' ? 'Remote / WFH' : 'In-Office'}`, 'success');
      await loadManagerData();
      if (document.getElementById('staff-profile-modal')?.style.display === 'flex') {
        await openStaffProfileModal(staffId);
      }
    } catch (err) {
      window.PS18.showToast(err.message || 'Error updating work mode', 'error');
    }
  };

  window.handleEditCrossTraining = async (staffId) => {
    const input = prompt("Enter comma-separated departments this staff member cross-covers:", "HR, Customer Support");
    if (input === null) return;
    const depts = input.split(',').map(s => s.trim()).filter(Boolean);
    try {
      await window.PS18.request(`/manager/staff/${staffId}/cross-train`, {
        method: 'PATCH',
        body: JSON.stringify({ departments: depts }),
      });
      window.PS18.showToast("Updated cross-training coverage", 'success');
      await openStaffProfileModal(staffId);
    } catch (err) {
      window.PS18.showToast(err.message || 'Error updating coverage', 'error');
    }
  };

  // ─── TAB 5: TICKET QUEUE ──────────────────────────────────────
  function renderQueueTab(mount) {
    const queue = dashboardData.queue || [];
    const roster = dashboardData.roster || [];
    const targetDept = isMain && inspectingDept ? inspectingDept : user.department;

    mount.innerHTML = `
      <div class="liquid-glass" style="padding:20px;border-radius:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
          <div>
            <h3 style="margin:0 0 2px;font-size:16px;font-weight:800;color:#0F172A;">
              ${targetDept === 'All' ? 'All 11 Departments (Org-Wide)' : targetDept} Ticket Queue & Specialist Assignment
            </h3>
            <div style="font-size:12px;color:var(--tx-tertiary);">
              ${targetDept === 'All' ? 'Review incoming issues across all departments and reassign tickets to department support executives.' : 'Review incoming issues and reassign tickets to department support executives.'}
            </div>
          </div>
          <span class="badge-light badge-blue" style="font-size:12px;">${queue.length} Active Tickets</span>
        </div>

        ${queue.length === 0 ? `
          <div style="padding:48px 24px;text-align:center;background:#FFFFFF;border:1px dashed #E2E8F0;border-radius:14px;">
            <div style="font-size:32px;margin-bottom:10px;">🎉</div>
            <div style="font-size:15px;font-weight:800;color:#0F172A;margin-bottom:4px;">No Pending Tickets in ${targetDept === 'All' ? 'Organization' : targetDept} Queue</div>
            <div style="font-size:12.5px;color:var(--tx-tertiary);max-width:380px;margin:0 auto;">
              All tickets ${targetDept === 'All' ? 'across all departments' : 'for this department'} have been resolved or are currently waiting for employee responses.
            </div>
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${queue.map(t => {
              const assignedAgent = roster.find(r => r.id === (t.assigned_agent_id || t.assigned_to));
              return `
                <div style="padding:16px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,0.04);display:flex;flex-direction:column;gap:10px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="font-weight:900;font-size:13px;color:#0284C7;">#${t.id}</span>
                      ${t.department ? `<span class="badge-light badge-purple" style="font-size:10px;font-weight:700;">${t.department}</span>` : ''}
                      <span class="badge-light badge-${t.priority === 'critical' ? 'red' : t.priority === 'high' ? 'amber' : 'blue'}" style="font-size:11px;font-weight:700;">
                        ${(t.priority || 'NORMAL').toUpperCase()}
                      </span>
                      <span class="badge-light" style="font-size:11px;font-weight:600;">Required: ${t.required_tier || 'L1'}</span>
                      <span class="badge-light ${t.status === 'open' ? 'badge-blue' : 'badge-green'}" style="font-size:11px;">
                        ${t.status.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <span class="badge-light ${t.breach_risk ? 'badge-red' : 'badge-green'}" style="font-size:11px;font-weight:700;">
                        ${t.breach_risk ? '⚠️ Near Breach' : '⏱️ On Track'}
                      </span>
                    </div>
                  </div>

                  <div style="font-size:14px;color:#0F172A;font-weight:700;line-height:1.4;">
                    ${t.subject || t.title || 'Support Request'}
                  </div>

                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-top:8px;border-top:1px solid #F1F5F9;">
                    <div style="font-size:12px;color:var(--tx-tertiary);">
                      Assigned to: <strong style="color:#0F172A;">${assignedAgent ? assignedAgent.name : (t.assigned_agent_name || 'Unassigned')}</strong>
                    </div>

                    <!-- Reassignment Control -->
                    <div style="display:flex;align-items:center;gap:6px;">
                      <select id="reassign-select-${t.id}" style="padding:5px 8px;font-size:11.5px;border-radius:6px;border:1px solid #CBD5E1;background:#FFFFFF;color:#0F172A;outline:none;">
                        <option value="">-- Assign Specialist --</option>
                        ${roster.map(r => `
                          <option value="${r.id}" ${(t.assigned_agent_id === r.id || t.assigned_to === r.id) ? 'selected' : ''}>
                            ${r.name} (${r.tier}) - ${r.status}
                          </option>
                        `).join('')}
                      </select>
                      <button class="btn-primary-liquid" onclick="handleReassignTicket('${t.id}')" style="padding:5px 10px;font-size:11.5px;font-weight:700;">
                        Assign
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  }

  // ─── TAB 6: BROADCAST ANNOUNCEMENTS ───────────────────────────
  async function renderAnnouncementsTab(mount) {
    const targetDept = isMain && inspectingDept ? inspectingDept : user.department;

    mount.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        
        <!-- Broadcast Dispatcher Card -->
        <div class="liquid-glass" style="padding:22px;border-radius:18px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div style="width:34px;height:34px;border-radius:10px;background:#F0F9FF;display:flex;align-items:center;justify-content:center;font-size:18px;">📢</div>
            <div>
              <h3 style="margin:0 0 2px;font-size:16px;font-weight:800;color:#0F172A;">
                Broadcast Priority Notification to ${targetDept} Staff
              </h3>
              <div style="font-size:12px;color:var(--tx-tertiary);">
                Dispatches an instant real-time alert and notice to all support executives and staff in your department.
              </div>
            </div>
          </div>

          <form onsubmit="handleBroadcastSubmit(event)" style="display:flex;flex-direction:column;gap:12px;">
            <div style="display:grid;grid-template-columns:3fr 1fr;gap:12px;">
              <div>
                <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Announcement Title</label>
                <input type="text" id="ann-title" required placeholder="e.g. Urgent: ERP System Patching Window at 19:00"
                  style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;" />
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Priority Level</label>
                <select id="ann-priority" style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;">
                  <option value="medium">Normal / Informational</option>
                  <option value="high">High Priority</option>
                  <option value="urgent">🚨 Urgent (Red Alert)</option>
                </select>
              </div>
            </div>

            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Message Body</label>
              <textarea id="ann-body" required rows="3" placeholder="Provide full details, required specialist actions, or operational instructions..."
                style="width:100%;padding:10px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;padding-top:4px;">
              <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#0F172A;cursor:pointer;">
                <input type="checkbox" id="ann-pinned" style="cursor:pointer;" />
                <span>📌 Pin announcement to the top of the department bulletin</span>
              </label>

              <button type="submit" id="ann-submit-btn" class="btn-primary-liquid" style="padding:9px 18px;font-size:13px;font-weight:700;">
                📡 Dispatch Broadcast to Staff
              </button>
            </div>
          </form>
        </div>

        <!-- Active Announcements Feed -->
        <div class="liquid-glass" style="padding:22px;border-radius:18px;">
          <h3 style="margin:0 0 14px;font-size:15px;font-weight:800;color:#0F172A;">
            Active ${targetDept} Department Announcements
          </h3>

          <div id="announcements-feed" style="display:flex;flex-direction:column;gap:10px;">
            <div style="padding:20px;text-align:center;color:var(--tx-tertiary);">Loading announcement feed...</div>
          </div>
        </div>

      </div>
    `;

    try {
      const annList = await window.PS18.request(`/manager/announcements?department=${targetDept}`);
      const feedEl = document.getElementById('announcements-feed');
      if (!feedEl) return;

      if (!Array.isArray(annList) || annList.length === 0) {
        feedEl.innerHTML = `
          <div style="padding:24px;text-align:center;color:var(--tx-tertiary);background:#FFFFFF;border:1px dashed #CBD5E1;border-radius:12px;">
            No announcements currently posted for this department. Use the form above to broadcast your first staff alert.
          </div>
        `;
        return;
      }

      feedEl.innerHTML = annList.map(a => `
        <div style="padding:16px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="badge-light badge-${a.priority === 'urgent' ? 'red' : a.priority === 'high' ? 'amber' : 'blue'}" style="font-size:11px;font-weight:700;">
                ${(a.priority || 'NORMAL').toUpperCase()}
              </span>
              ${a.pinned ? '<span class="badge-light badge-purple" style="font-size:11px;font-weight:700;">📌 PINNED</span>' : ''}
              <span style="font-size:14px;font-weight:800;color:#0F172A;">${a.title}</span>
            </div>
            <div style="font-size:11.5px;color:var(--tx-tertiary);">
              Posted by <strong>${a.created_by || 'Manager'}</strong> · ${new Date(a.created_at).toLocaleDateString()}
            </div>
          </div>
          <div style="font-size:13px;color:#334155;line-height:1.5;">${a.body}</div>
        </div>
      `).join('');
    } catch (err) {
      const feedEl = document.getElementById('announcements-feed');
      if (feedEl) {
        feedEl.innerHTML = `
          <div style="padding:24px;text-align:center;color:var(--tx-tertiary);background:#FFFFFF;border:1px dashed #CBD5E1;border-radius:12px;">
            Couldn't load announcements right now. Please refresh or try again later.
          </div>
        `;
      }
    }
  }

  // ─── TAB 7: PROVISION ACCOUNT WITH VERIFIED EMAIL DISPATCH ─────
  function renderProvisionTab(mount) {
    mount.innerHTML = `
      <div class="liquid-glass" style="max-width:560px;padding:24px;border-radius:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <h3 style="margin:0;font-size:16px;font-weight:800;color:#0F172A;">Provision Team Account</h3>
          <button class="btn-glass" onclick="openOutboxModal()" style="padding:4px 10px;font-size:11.5px;font-weight:700;">
            📬 View Outbox
          </button>
        </div>
        <p style="font-size:12.5px;color:var(--tx-tertiary);margin:0 0 16px;">
          ${isMain ? 'Provision Department Managers, Support Executives, or Employees across all 11 departments.' : `Provision Support Executives or Employees for ${user.department}.`}
          Temporary credentials are dispatched via Mailer (SMTP / Outbox).
        </p>

        <div id="prov-alert" style="display:none;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:14px;"></div>

        <form onsubmit="handleProvisionSubmit(event)" style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Full Name</label>
            <input type="text" id="prov-name" required placeholder="Full name" style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;" />
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Work Email</label>
            <input type="email" id="prov-email" required placeholder="name@company.com" style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;" />
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Role</label>
            <select id="prov-role" onchange="toggleProvRoleFields(this.value)" style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;">
              <option value="support_executive" selected>Support Executive (Specialist)</option>
              <option value="employee">Employee (Helpdesk Requester)</option>
              ${isMain ? '<option value="department_manager">Department Manager</option>' : ''}
            </select>
          </div>
          ${isMain ? `
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Department</label>
              <select id="prov-dept" style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;">
                <option value="IT">IT Support</option>
                <option value="HR">Human Resources</option>
                <option value="Finance">Finance & Accounts</option>
                <option value="Billing">Billing & Invoicing</option>
                <option value="Customer Support">Customer Support</option>
                <option value="Cybersecurity">Cybersecurity & InfoSec</option>
                <option value="Data & Analytics">Data & Analytics</option>
                <option value="Investor Relations">Investor Relations</option>
                <option value="Legal">Legal & Compliance</option>
                <option value="Marketing">Marketing & Brand</option>
                <option value="Quality Assurance">Quality Assurance</option>
              </select>
            </div>
          ` : ''}
          <div id="prov-tier-group">
            <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Tier (for Support Executive)</label>
            <select id="prov-tier" style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;">
              <option value="L1">Level 1 (Frontline)</option>
              <option value="L2">Level 2 (Specialist)</option>
              <option value="L3">Level 3 (Senior Specialist)</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Initial Temporary Password (min 12 chars)</label>
            <input type="password" id="prov-password" required placeholder="Min 12 chars, upper, lower, digit, symbol"
              style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;box-sizing:border-box;font-size:13px;" />
          </div>
          <button type="submit" id="prov-submit-btn" class="btn-primary-liquid" style="width:100%;padding:10px;font-size:13px;font-weight:700;margin-top:6px;">
            📧 Provision Account & Send Temporary Credentials
          </button>
        </form>
      </div>
    `;
  }

  // ─── WINDOW ACTIONS & EVENT HANDLERS ──────────────────────────
  window.switchManagerTab = (tab) => {
    activeTab = tab;
    document.querySelectorAll('[id^="nav-"]').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById(`nav-${tab}`);
    if (btn) btn.classList.add('active');
    renderActiveTab();
  };

  window.drillDownDepartment = async (deptId) => {
    inspectingDept = deptId;
    await loadManagerData();
    window.PS18.showToast(`Inspecting ${deptId} department view`, 'info');
  };

  window.exitDepartmentDrilldown = async () => {
    inspectingDept = null;
    await loadManagerData();
    window.PS18.showToast('Returned to Organization Command Center', 'info');
  };

  window.openAddStaffModal = () => {
    const modal = document.getElementById('add-staff-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeAddStaffModal = () => {
    const modal = document.getElementById('add-staff-modal');
    if (modal) modal.style.display = 'none';
  };

  window.openOutboxModal = async () => {
    const modal = document.getElementById('outbox-modal');
    const content = document.getElementById('outbox-content');
    if (!modal || !content) return;

    modal.style.display = 'flex';
    content.innerHTML = `<div style="text-align:center;padding:20px;color:var(--tx-tertiary);">Fetching recent dispatched emails...</div>`;

    try {
      const data = await window.PS18.request('/admin/outbox');
      if (!data.outbox || data.outbox.length === 0) {
        content.innerHTML = `<div style="text-align:center;padding:24px;color:var(--tx-tertiary);">Outbox is empty. No emails dispatched in this session yet.</div>`;
      } else {
        content.innerHTML = data.outbox.map(m => `
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px 14px;font-size:12px;display:flex;flex-direction:column;gap:4px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-weight:700;color:#0F172A;">To: ${m.to}</span>
              <span class="badge-light badge-green" style="font-size:10px;font-weight:700;">DELIVERED (${m.transport.toUpperCase()})</span>
            </div>
            <div style="font-weight:600;color:#334155;">Subject: ${m.subject}</div>
            <div style="font-size:11px;color:var(--tx-tertiary);">Dispatched: ${new Date(m.timestamp).toLocaleTimeString()}</div>
          </div>
        `).join('');
      }
    } catch (err) {
      content.innerHTML = `<div style="color:#DC2626;padding:16px;">Failed to inspect outbox: ${err.message}</div>`;
    }
  };

  window.closeOutboxModal = () => {
    const modal = document.getElementById('outbox-modal');
    if (modal) modal.style.display = 'none';
  };

  window.handleAddStaffSubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('modal-staff-name').value.trim();
    const email = document.getElementById('modal-staff-email').value.trim();
    const tier = document.getElementById('modal-staff-tier').value;
    const work_mode = document.getElementById('modal-staff-workmode')?.value || 'office';
    const password = document.getElementById('modal-staff-pass').value;
    const btn = document.getElementById('modal-staff-btn');

    btn.disabled = true;
    btn.innerText = 'Creating & Mailing...';

    try {
      const targetDept = isMain && inspectingDept ? inspectingDept : user.department;
      await window.PS18.request('/manager/staff', {
        method: 'POST',
        body: JSON.stringify({ name, email, tier, password, department: targetDept, work_mode }),
      });

      window.PS18.showToast(`Specialist ${name} provisioned & credentials emailed!`, 'success');
      closeAddStaffModal();
      await loadManagerData();
    } catch (err) {
      window.PS18.showToast(err.message || 'Failed to create specialist', 'error');
    } finally {
      btn.disabled = false;
      btn.innerText = 'Create Specialist';
    }
  };

  window.handleStaffStatusChange = async (staffId, newStatus) => {
    try {
      await window.PS18.request(`/manager/staff/${staffId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      window.PS18.showToast(`Presence updated to ${newStatus}`, 'success');
      await loadManagerData();
    } catch (err) {
      window.PS18.showToast(err.message || 'Error updating status', 'error');
    }
  };

  window.handleStaffTierChange = async (staffId, newTier) => {
    try {
      await window.PS18.request(`/manager/staff/${staffId}`, {
        method: 'PATCH',
        body: JSON.stringify({ tier: newTier }),
      });
      window.PS18.showToast(`Promoted specialist to Tier ${newTier}`, 'success');
      await loadManagerData();
    } catch (err) {
      window.PS18.showToast(err.message || 'Error updating tier', 'error');
    }
  };

  window.handleSimulateSwipe = async (staffId, direction) => {
    try {
      await window.PS18.request(`/manager/staff/${staffId}/swipe`, {
        method: 'POST',
        body: JSON.stringify({ direction }),
      });
      window.PS18.showToast(`Simulated door swipe ${direction} for specialist!`, 'success');
      await loadManagerData();
    } catch (err) {
      window.PS18.showToast(err.message || 'Error simulating swipe', 'error');
    }
  };

  window.handleReassignTicket = async (ticketId) => {
    const select = document.getElementById(`reassign-select-${ticketId}`);
    if (!select || !select.value) {
      window.PS18.showToast('Please select a specialist first', 'warning');
      return;
    }
    const agentId = select.value;

    try {
      const res = await window.PS18.request(`/manager/queue/${ticketId}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ agentId }),
      });
      window.PS18.showToast(res.message || 'Ticket reassigned successfully', 'success');
      await loadManagerData();
    } catch (err) {
      window.PS18.showToast(err.message || 'Reassignment failed', 'error');
    }
  };

  window.handleBroadcastSubmit = async (e) => {
    e.preventDefault();
    const title = document.getElementById('ann-title').value.trim();
    const priority = document.getElementById('ann-priority').value;
    const body = document.getElementById('ann-body').value.trim();
    const pinned = document.getElementById('ann-pinned').checked;
    const btn = document.getElementById('ann-submit-btn');

    btn.disabled = true;
    btn.innerText = 'Broadcasting...';

    try {
      const targetDept = isMain && inspectingDept ? inspectingDept : user.department;
      await window.PS18.request('/manager/announcements', {
        method: 'POST',
        body: JSON.stringify({ title, priority, body, pinned, department: targetDept }),
      });

      window.PS18.showToast('Priority announcement broadcasted to department staff!', 'success');
      document.getElementById('ann-title').value = '';
      document.getElementById('ann-body').value = '';
      await renderAnnouncementsTab(document.getElementById('manager-content'));
    } catch (err) {
      window.PS18.showToast(err.message || 'Broadcast failed', 'error');
    } finally {
      btn.disabled = false;
      btn.innerText = '📡 Dispatch Broadcast to Staff';
    }
  };

  window.handleProvisionSubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('prov-name').value.trim();
    const email = document.getElementById('prov-email').value.trim();
    const role = document.getElementById('prov-role').value;
    const tier = document.getElementById('prov-tier')?.value || 'L1';
    const dept = isMain ? (document.getElementById('prov-dept')?.value || 'IT') : user.department;
    const password = document.getElementById('prov-password').value;
    const alertEl = document.getElementById('prov-alert');
    const submitBtn = document.getElementById('prov-submit-btn');

    submitBtn.disabled = true;
    submitBtn.innerText = 'Provisioning & Sending Credentials...';

    try {
      if (role === 'support_executive') {
        await window.PS18.request('/manager/staff', {
          method: 'POST',
          body: JSON.stringify({ name, email, tier, password, department: dept }),
        });
      } else {
        await window.PS18.request('/admin/accounts', {
          method: 'POST',
          body: JSON.stringify({ name, email, role, tier, department: dept, password }),
        });
      }

      alertEl.style.display = 'block';
      alertEl.style.background = '#F0FDF4';
      alertEl.style.color = '#15803D';
      alertEl.innerHTML = `
        <strong>Account provisioned!</strong> Credentials dispatched to <strong>${email}</strong> via Mailer (SMTP / Outbox verified).
      `;
      window.PS18.showToast(`Temporary credentials dispatched to ${email}!`, 'success');
      await loadManagerData();
    } catch (err) {
      alertEl.style.display = 'block';
      alertEl.style.background = '#FEF2F2';
      alertEl.style.color = '#B91C1C';
      alertEl.innerText = err.message || 'Provisioning failed';
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = '📧 Provision Account & Send Temporary Credentials';
    }
  };

  window.toggleProvRoleFields = (role) => {
    const tierGroup = document.getElementById('prov-tier-group');
    if (tierGroup) {
      tierGroup.style.display = role === 'support_executive' ? 'block' : 'none';
    }
  };

  window.handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    localStorage.removeItem('ps18_token');
    window.PS18.user = null;
    navigate('hero');
  };

  await loadManagerData();
}

window.renderManager = renderManager;
