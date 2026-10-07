// Manager dashboards router with strict department and role scoping
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const accountStore = require('../auth/accountStore');
const { ROLES } = require('../auth/roles');
const { isValidDepartment, DEPARTMENTS } = require('../auth/departments');
const { authenticate, requireRoles } = require('../auth/middleware');
const { getDepartmentMetrics, getOrgAggregate } = require('../services/analytics');
const auditService = require('../services/audit');
const attendanceService = require('../services/attendance');
const { validatePasswordStrength } = require('../auth/passwords');
const mailer = require('../auth/mailer');
const { leaveBalances, leaveRequests, companyHolidays, companyEvents, getLeaveBalance } = require('../data/leave-data');

router.use(['/manager', '/dashboard', '/departments'], authenticate);

// ─── Department Dashboard (Dept Manager or Main Manager) ─────
router.get('/manager/department', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const state = req.app.get('state') || { tickets: [], routingLogs: [] };
  const accounts = accountStore.listAccounts();

  let targetDept = req.user.department;
  // Main manager can optionally inspect a specific department
  if (req.user.role === ROLES.MAIN_MANAGER && req.query.department) {
    if (isValidDepartment(req.query.department)) {
      targetDept = req.query.department;
    }
  }

  const metrics = getDepartmentMetrics(targetDept, state.tickets, accounts, state.routingLogs);
  return res.json(metrics);
});

// ─── Department Queue (Dept Manager or Main Manager) ─────────
router.get('/manager/queue', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const state = req.app.get('state') || { tickets: [] };
  const { status, priority, tier, required_tier } = req.query;

  let targetDept = req.user.department;
  if (req.user.role === ROLES.MAIN_MANAGER) {
    const deptParam = req.query.department || req.query.department_id;
    if (deptParam && isValidDepartment(deptParam)) {
      targetDept = deptParam;
    } else {
      targetDept = null; // all departments
    }
  }

  let tickets = state.tickets;
  if (targetDept) {
    tickets = tickets.filter(t => t.department === targetDept);
  }

  if (status) {
    tickets = tickets.filter(t => t.status === status);
  }

  if (priority) {
    tickets = tickets.filter(t => t.priority === priority);
  }

  const requestedTier = tier || required_tier;
  if (requestedTier) {
    tickets = tickets.filter(t => (t.required_tier || 'L1') === requestedTier);
  }

  return res.json(tickets);
});

// ─── Reassign Ticket in Department Queue ──────────────────────
router.patch('/manager/queue/:ticketId/assign', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const { ticketId } = req.params;
  const { agentId } = req.body || {};
  if (!agentId) {
    return res.status(400).json({ error: 'missing_agent', message: 'agentId is required' });
  }

  const state = req.app.get('state');
  const ticket = (state?.tickets || []).find(t => t.id === ticketId);
  if (!ticket) {
    return res.status(404).json({ error: 'not_found', message: 'Ticket not found' });
  }

  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  if (!isMain && ticket.department !== req.user.department) {
    return res.status(403).json({ error: 'forbidden', message: 'Ticket is outside your department' });
  }

  const agent = accountStore.findById(agentId);
  if (!agent || agent.role !== ROLES.SUPPORT_EXECUTIVE || (!isMain && agent.department !== req.user.department)) {
    return res.status(400).json({ error: 'invalid_agent', message: 'Agent must be a support executive in your department' });
  }

  ticket.assigned_agent_id = agent.id;
  ticket.assigned_agent_name = agent.name;
  ticket.status = 'assigned';
  ticket.assigned_at = new Date().toISOString();

  auditService.recordAudit({
    actorId: req.user.id,
    actorType: 'manager',
    action: 'ticket_manager_reassigned',
    targetType: 'ticket',
    targetId: ticketId,
    department: ticket.department,
    metadata: { assignedTo: agent.name, agentId: agent.id },
  });

  const io = req.app.get('io');
  if (io) {
    io.emit('ticket:assigned', { ticketId: ticket.id, agentId: agent.id, agentName: agent.name });
  }

  return res.json({
    message: `Ticket #${ticketId} reassigned to ${agent.name}`,
    ticket,
  });
});

// ─── Org Aggregate / All Dashboard ───────────────────────────
router.get('/dashboard/all', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const state = req.app.get('state') || { tickets: [], routingLogs: [] };
  const accounts = accountStore.listAccounts();

  // If Main Manager -> return full org aggregate across all 11 departments
  if (req.user.role === ROLES.MAIN_MANAGER) {
    const aggregate = getOrgAggregate(state.tickets, accounts, state.routingLogs);
    return res.json(aggregate);
  }

  // If Department Manager -> strictly return ONLY their own department's slice
  const deptSlice = getDepartmentMetrics(req.user.department, state.tickets, accounts, state.routingLogs);
  return res.json({
    organization: 'OneGate Enterprise (Department Scoped)',
    departmentCount: 1,
    departments: [
      {
        department: deptSlice.department,
        departmentName: deptSlice.departmentName,
        open: deptSlice.open,
        resolved: deptSlice.resolved,
        slaCompliance: deptSlice.slaCompliance,
        slaBreachesThisWeek: deptSlice.slaBreachesThisWeek,
        staffCount: deptSlice.staffCount,
        onlineStaff: deptSlice.onlineStaff,
        routingAccuracy: deptSlice.routingAccuracy,
      },
    ],
    myDepartment: deptSlice,
  });
});

// ─── Department Drilldown (Read-Only) ─────────────────────────
router.get('/departments/:departmentId/dashboard', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const { departmentId } = req.params;
  const isMain = req.user.role === ROLES.MAIN_MANAGER;

  if (!isValidDepartment(departmentId)) {
    return res.status(404).json({ error: 'not_found', message: `Department "${departmentId}" does not exist` });
  }

  // Department Manager is hard-scoped to their own department
  if (!isMain && departmentId !== req.user.department) {
    return res.status(403).json({
      error: 'forbidden',
      message: 'Department Managers cannot access data from other departments',
    });
  }

  const state = req.app.get('state') || { tickets: [], routingLogs: [] };
  const accounts = accountStore.listAccounts();
  const metrics = getDepartmentMetrics(departmentId, state.tickets, accounts, state.routingLogs);

  return res.json({
    ...metrics,
    readOnly: isMain && departmentId !== req.user.department,
  });
});

// ─── Manage Staff: Provision Support Executive for Department ─
router.post('/manager/staff', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), async (req, res) => {
  const { name, email, tier, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'missing_fields', message: 'Name, email, and password are required' });
  }

  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  const dept = isMain && req.body.department && isValidDepartment(req.body.department)
    ? req.body.department
    : req.user.department;

  const existing = accountStore.findByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'email_exists', message: 'An account with this email already exists' });
  }

  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    return res.status(400).json({ error: 'weak_password', message: strength.error });
  }

  const staffTier = ['L1', 'L2', 'L3'].includes(tier) ? tier : 'L1';
  const newStaff = await accountStore.createAccount({
    name,
    email,
    password,
    role: ROLES.SUPPORT_EXECUTIVE,
    department: dept,
    tier: staffTier,
    active: true,
    must_change_password: false,
    status: 'online',
    current_load: 0,
    rolling_score: 5.0,
  });

  // Sync to runtime state if available
  const state = req.app.get('state');
  if (state && Array.isArray(state.employees)) {
    state.employees.push({
      id: newStaff.id,
      name: newStaff.name,
      email: newStaff.email,
      department: newStaff.department,
      tier: newStaff.tier,
      active: true,
      current_load: 0,
      rolling_score: 5.0,
    });
  }

  auditService.recordAudit({
    actorId: req.user.id,
    actorType: 'manager',
    action: 'staff_created',
    targetType: 'staff',
    targetId: newStaff.id,
    department: dept,
    metadata: { name: newStaff.name, email: newStaff.email, tier: newStaff.tier, department: dept },
  });

  // Securely deliver temporary credentials to employee email via mailer
  await mailer.sendTemporaryPassword({
    to: newStaff.email,
    name: newStaff.name,
    tempPassword: password,
  });

  return res.status(201).json({
    message: 'Staff member provisioned successfully and temporary credentials dispatched',
    staff: accountStore.toPublic(newStaff),
  });
});

// ─── Manage Staff: Update Tier, Duty Status, or Active State ──
router.patch('/manager/staff/:id', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), async (req, res) => {
  const staffId = req.params.id;
  const staff = accountStore.findById(staffId);
  if (!staff) {
    return res.status(404).json({ error: 'not_found', message: 'Staff member not found' });
  }

  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  if (!isMain && staff.department !== req.user.department) {
    return res.status(403).json({ error: 'forbidden', message: 'Cannot modify staff outside your department' });
  }

  const updates = {};
  if (req.body.tier && ['L1', 'L2', 'L3'].includes(req.body.tier)) {
    updates.tier = req.body.tier;
  }
  if (req.body.status && ['online', 'busy', 'away', 'offline'].includes(req.body.status)) {
    updates.status = req.body.status;
  }
  if (typeof req.body.active === 'boolean') {
    updates.active = req.body.active;
  }
  if (Array.isArray(req.body.skill_tags)) {
    updates.skill_tags = req.body.skill_tags;
  }

  const updated = await accountStore.updateAccount(staffId, updates);

  // Sync to runtime state
  const state = req.app.get('state');
  if (state && Array.isArray(state.employees)) {
    const s = state.employees.find(e => e.id === staffId);
    if (s) Object.assign(s, updates);
  }

  auditService.recordAudit({
    actorId: req.user.id,
    actorType: 'manager',
    action: 'staff_updated',
    targetType: 'staff',
    targetId: staffId,
    department: staff.department,
    metadata: updates,
  });

  return res.json({
    message: 'Staff profile updated successfully',
    staff: accountStore.toPublic(updated),
  });
});

// ─── Manage Staff: Simulate Swipe / Clock In/Out ───────────────
router.post('/manager/staff/:id/swipe', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const staffId = req.params.id;
  const staff = accountStore.findById(staffId);
  if (!staff) {
    return res.status(404).json({ error: 'not_found', message: 'Staff member not found' });
  }

  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  if (!isMain && staff.department !== req.user.department) {
    return res.status(403).json({ error: 'forbidden', message: 'Cannot simulate swipe for staff outside your department' });
  }

  const direction = req.body.direction === 'OUT' ? 'OUT' : 'IN';
  const swipe = attendanceService.simulateSwipe({
    employeeId: staff.id,
    cardId: `CARD-${staff.id.slice(0, 6)}`,
    readerId: `READER-${staff.department}-DOOR-01`,
    direction,
    department: staff.department,
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const attendance = attendanceService.deriveAttendanceForDate(staff.id, todayStr);

  return res.json({
    message: `Recorded swipe ${direction} for ${staff.name}`,
    swipe,
    attendance,
  });
});

// ─── Department Announcements: Post Priority Broadcast ─────────
router.post('/manager/announcements', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const { title, body, priority, pinned } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: 'missing_fields', message: 'Title and message are required' });
  }

  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  const dept = isMain && req.body.department ? req.body.department : req.user.department;

  const { announcements } = require('../data/enterprise-data');
  const ann = {
    id: 'ann-' + uuidv4().slice(0, 6),
    title,
    body,
    department: dept,
    priority: priority || 'medium',
    pinned: pinned || false,
    created_by: req.user.name,
    created_at: new Date().toISOString(),
    expires_at: null,
    read_by: [],
  };

  announcements.push(ann);

  const io = req.app.get('io');
  if (io) {
    io.emit('announcement:new', ann);
    io.emit('department_alert', ann);
  }

  auditService.recordAudit({
    actorId: req.user.id,
    actorType: 'manager',
    action: 'announcement_broadcast',
    targetType: 'announcement',
    targetId: ann.id,
    department: dept,
    metadata: { title, priority: ann.priority, department: dept },
  });

  return res.status(201).json({
    message: 'Announcement broadcasted to department staff',
    announcement: ann,
  });
});

// ─── Department Announcements: Fetch Active Notices ───────────
router.get('/manager/announcements', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  const isAll = (isMain && (!req.query.department || req.query.department === 'All')) || req.query.department === 'All' || req.user.department === 'All';
  const targetDept = isAll ? 'All' : (req.query.department || req.user.department);

  const { announcements } = require('../data/enterprise-data');
  let list = announcements || [];
  if (targetDept && targetDept !== 'All') {
    list = list.filter(a => a.department === targetDept || a.department === 'All');
  }

  // Sort: pinned first, then newest first
  const sorted = [...list].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  return res.json(sorted);
});

// ─── Helpers ──────────────────────────────────────────────────
function calculateTenure(joinedDateStr) {
  if (!joinedDateStr) return '0 mo';
  const joined = new Date(joinedDateStr);
  const now = new Date();
  const diffMonths = (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth());
  if (diffMonths <= 0) return '1 mo';
  const years = Math.floor(diffMonths / 12);
  const months = diffMonths % 12;
  if (years === 0) return `${months} mo`;
  if (months === 0) return `${years} yr`;
  return `${years} yr ${months} mo`;
}

function formatJoinedDate(joinedDateStr) {
  if (!joinedDateStr) return 'Recently';
  const d = new Date(joinedDateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Department Calendar View ─────────────────────────────────
router.get('/manager/calendar', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  const isAll = (isMain && (!req.query.department || req.query.department === 'All')) || req.query.department === 'All' || req.user.department === 'All';
  const targetDept = isAll ? 'All' : (req.query.department || req.user.department);

  const monthParam = req.query.month || '2026-10'; // e.g. '2026-10'
  const [yearStr, monthNumStr] = monthParam.split('-');
  const year = parseInt(yearStr, 10) || 2026;
  const monthIndex = (parseInt(monthNumStr, 10) || 10) - 1; // 0-indexed

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, monthIndex, 1).getDay(); // 0 = Sun

  const deptAccounts = isAll ? accountStore.listAccounts() : accountStore.listAccounts({ department: targetDept });
  const deptStaffIds = new Set(deptAccounts.map(a => a.id));
  const deptStaffNames = new Set(deptAccounts.map(a => a.name.toLowerCase()));

  // Real company employee accounts from accountStore (strictly real registered accounts, no fake directory mock data)
  const companyStaff = deptAccounts.filter(a => a.role === ROLES.EMPLOYEE && a.active !== false);
  const supportStaff = deptAccounts.filter(a => a.role === ROLES.SUPPORT_EXECUTIVE && a.active !== false);
  const realCompanyProfiles = companyStaff.map(a => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: 'Corporate Staff',
    department: a.department,
    location: 'HQ Floor 4',
    avatar: '🧑‍💼',
    joined: a.created_at ? a.created_at.slice(0, 10) : '2026-01-15',
  }));

  // Filter holidays and events for month
  const monthHolidays = companyHolidays.filter(h => h.date.startsWith(monthParam));
  const monthEvents = companyEvents.filter(e => e.date.startsWith(monthParam) && (isAll || e.department === 'All' || e.department === targetDept));
  
  // Filter leaves for this department (or org-wide if All) — strictly require user to exist in deptAccounts
  const monthLeaves = leaveRequests.filter(r => {
    if (r.status !== 'approved' && r.status !== 'pending') return false;
    const isDeptStaff = deptStaffIds.has(r.user_id) || deptStaffNames.has((r.name || '').toLowerCase());
    return isDeptStaff && (r.start_date.startsWith(monthParam) || r.end_date.startsWith(monthParam));
  });

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = `${yearStr}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const weekday = new Date(year, monthIndex, d).getDay();

    const holiday = monthHolidays.find(h => h.date === dayStr) || null;
    const dayEvents = monthEvents.filter(e => e.date === dayStr);

    const onLeave = monthLeaves.filter(r => dayStr >= r.start_date && dayStr <= r.end_date);

    // Look up swipes for department staff on this date
    const daySwipes = attendanceService.doorSwipeEvents.filter(s => {
      const swipeDate = s.timestamp.split('T')[0];
      return swipeDate === dayStr && deptStaffIds.has(s.employee_id);
    });

    const presentStaff = Array.from(new Set(daySwipes.map(s => s.employee_id))).map(id => {
      const acct = accountStore.findById(id);
      return acct ? { id: acct.id, name: acct.name, email: acct.email, role: acct.role, department: acct.department } : { id };
    });

    let attendanceStatus = 'normal';
    if (holiday) {
      attendanceStatus = 'holiday';
    } else if (onLeave.length > 0) {
      attendanceStatus = 'leave';
    } else if (presentStaff.length > 0) {
      attendanceStatus = 'full';
    }

    const activeLeaves = onLeave.map(l => ({
      id: l.id,
      name: l.name,
      employee_name: l.name,
      type: l.type,
      leave_type: l.type,
      reason: l.reason,
      status: l.status,
      user_id: l.user_id,
      start_date: l.start_date,
      end_date: l.end_date,
    }));

    const remoteStaff = deptAccounts.filter(a => a.work_mode === 'remote_wfh' && a.status === 'online').map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      department: a.department,
    }));

    const dots = {
      holiday: Boolean(holiday),
      hasHoliday: Boolean(holiday),
      leave: onLeave.length > 0,
      hasLeave: onLeave.length > 0,
      attendance: presentStaff.length > 0,
      hasAttendance: presentStaff.length > 0,
    };

    days.push({
      date: dayStr,
      day: d,
      dayNumber: d,
      weekday,
      holiday,
      events: dayEvents,
      event: dayEvents[0] || null,
      onLeave: activeLeaves,
      leaves: activeLeaves,
      presentStaff,
      staffPresent: presentStaff,
      staffRemote: remoteStaff,
      dots,
      attendanceDots: dots,
      attendanceStatus,
    });
  }

  return res.json({
    month: monthParam,
    year,
    department: targetDept,
    departmentName: isAll ? 'All Departments (Org-Wide)' : (DEPARTMENTS.find(d => d.id === targetDept)?.name || targetDept),
    daysInMonth,
    firstDayOfWeek,
    days,
    calendarDays: days,
    holidaysCount: monthHolidays.length,
    eventsCount: monthEvents.length,
    leavesCount: monthLeaves.length,
    totalStaffCount: deptAccounts.length,
    supportStaffCount: supportStaff.length,
    companyStaffCount: companyStaff.length,
    directoryProfiles: realCompanyProfiles,
  });
});

// ─── Department Leave Requests Queue ──────────────────────────
router.get('/manager/leave-requests', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  const isAll = (isMain && (!req.query.department || req.query.department === 'All')) || req.query.department === 'All' || req.user.department === 'All';
  const targetDept = isAll ? 'All' : (req.query.department || req.user.department);

  const deptAccounts = isAll ? accountStore.listAccounts() : accountStore.listAccounts({ department: targetDept });
  const deptStaffIds = new Set(deptAccounts.map(a => a.id));
  const deptStaffNames = new Set(deptAccounts.map(a => a.name.toLowerCase()));

  const requests = leaveRequests.filter(r => {
    return deptStaffIds.has(r.user_id) || deptStaffNames.has((r.name || '').toLowerCase());
  }).map(r => {
    const acct = deptAccounts.find(a => a.id === r.user_id || a.name.toLowerCase() === (r.name || '').toLowerCase());
    const bal = getLeaveBalance(r.user_id) || leaveBalances.find(b => b.name === r.name) || {
      pto_total: 18,
      pto_used: 4,
      pto_pending: r.status === 'pending' ? r.days : 0,
    };

    return {
      ...r,
      department: acct?.department || targetDept,
      user_email: acct?.email || null,
      balance: {
        total: bal.pto_total,
        used: bal.pto_used,
        remaining: Math.max(0, bal.pto_total - bal.pto_used),
        pending: bal.pto_pending || 0,
      },
    };
  });

  return res.json(requests.sort((a, b) => new Date(b.requested_date || 0) - new Date(a.requested_date || 0)));
});

// ─── Leave Request Approval / Denial ──────────────────────────
router.patch('/manager/leave-requests/:id', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const { id } = req.params;
  const { action, notes } = req.body || {}; // action: 'approve' | 'deny'

  if (!['approve', 'deny'].includes(action)) {
    return res.status(400).json({ error: 'invalid_action', message: 'Action must be approve or deny' });
  }

  const reqItem = leaveRequests.find(r => r.id === id);
  if (!reqItem) {
    return res.status(404).json({ error: 'not_found', message: 'Leave request not found' });
  }

  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  const acct = accountStore.findById(reqItem.user_id) || accountStore.listAccounts().find(a => a.name === reqItem.name);
  if (!isMain && acct && acct.department !== req.user.department) {
    return res.status(403).json({ error: 'forbidden', message: 'Leave request belongs to another department' });
  }

  reqItem.status = action === 'approve' ? 'approved' : 'denied';
  reqItem.approved_by = req.user.name;
  reqItem.decision_notes = notes || null;
  reqItem.decided_at = new Date().toISOString();

  let bal = getLeaveBalance(reqItem.user_id) || leaveBalances.find(b => b.name === reqItem.name);
  if (!bal) {
    bal = { user_id: reqItem.user_id, name: reqItem.name, pto_total: 18, pto_used: 4, pto_pending: reqItem.days, sick_total: 10, sick_used: 1 };
    leaveBalances.push(bal);
  }

  if (action === 'approve') {
    bal.pto_pending = Math.max(0, (bal.pto_pending || 0) - reqItem.days);
    bal.pto_used = Math.min(bal.pto_total, (bal.pto_used || 0) + reqItem.days);
  } else {
    bal.pto_pending = Math.max(0, (bal.pto_pending || 0) - reqItem.days);
  }

  auditService.recordAudit({
    actorId: req.user.id,
    actorType: 'manager',
    action: action === 'approve' ? 'leave_approved' : 'leave_denied',
    targetType: 'leave_request',
    targetId: id,
    department: acct?.department || req.user.department,
    metadata: { employee: reqItem.name, days: reqItem.days, type: reqItem.type, action },
  });

  const io = req.app.get('io');
  if (io) {
    io.emit('leave:updated', { id, status: reqItem.status, employee: reqItem.name });
  }

  return res.json({
    message: `Leave request for ${reqItem.name} ${reqItem.status}`,
    request: reqItem,
    balance: {
      total: bal.pto_total,
      used: bal.pto_used,
      remaining: Math.max(0, bal.pto_total - bal.pto_used),
    },
  });
});

// ─── Expanded Staff Profile View ──────────────────────────────
router.get('/manager/staff/:id/profile', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const staffId = req.params.id;
  const staff = accountStore.findById(staffId);
  if (!staff) {
    return res.status(404).json({ error: 'not_found', message: 'Staff member not found' });
  }

  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  if (!isMain && staff.department !== req.user.department) {
    return res.status(403).json({ error: 'forbidden', message: 'Staff member is outside your department' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const attendance = attendanceService.deriveAttendanceForDate(staff.id, todayStr);

  const state = req.app.get('state') || { tickets: [] };
  const currentTickets = (state.tickets || []).filter(t =>
    (t.assigned_agent_id === staff.id || t.assigned_to === staff.id) && t.status !== 'resolved'
  );

  let bal = getLeaveBalance(staff.id) || leaveBalances.find(b => b.name === staff.name);
  if (!bal) {
    bal = { user_id: staff.id, name: staff.name, pto_total: 18, pto_used: 4, pto_pending: 0, sick_total: 10, sick_used: 1 };
  }

  const pendingLeave = leaveRequests.find(r =>
    (r.user_id === staff.id || r.name === staff.name) && r.status === 'pending'
  ) || null;

  // Joined date: default to stable mock if not explicitly set
  const joinedAt = staff.joined_at || (staff.name.includes('Priya') ? '2024-03-11T09:00:00Z' : staff.created_at || '2025-06-01T09:00:00Z');
  const joinedDisplay = formatJoinedDate(joinedAt);
  const tenureDisplay = calculateTenure(joinedAt);

  const roleLabel = staff.role === ROLES.SUPPORT_EXECUTIVE
    ? 'Support staff'
    : (staff.role === ROLES.DEPARTMENT_MANAGER ? 'Department Manager' : 'Company staff');

  const workMode = staff.work_mode || 'office'; // 'office' | 'remote_wfh'

  const onboardingChecklist = staff.onboarding_checklist || [
    { id: 'docs', label: 'Offer Letter & Corporate NDA Signed', completed: true },
    { id: 'badge', label: 'Physical Security NFC Badge Issued', completed: true },
    { id: 'equipment', label: 'Laptop & Hardware Profile Allocated', completed: true },
    { id: 'swipe', label: 'First Physical Door Swipe Recorded', completed: Boolean(attendance.first_swipe_in) },
    { id: 'security', label: 'Annual Cybersecurity Awareness Training', completed: true },
  ];

  return res.json({
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    role_label: roleLabel,
    department: staff.department,
    tier: staff.tier || 'L1',
    tier_display: staff.tier === 'L3' ? 'L3 senior lead' : staff.tier === 'L2' ? 'L2 specialist' : 'L1 frontline',
    joined_at: joinedAt,
    joined_display: joinedDisplay,
    tenure_display: tenureDisplay,
    work_mode: workMode,
    work_mode_display: workMode === 'remote_wfh' ? '🏠 Remote / WFH' : '🏢 In-Office',
    presence_status: staff.status || 'online',
    current_tickets: currentTickets.map(t => ({ id: t.id, subject: t.subject || t.issue, priority: t.priority, sla_deadline: t.sla_deadline })),
    current_handling_display: `${staff.department} · ${currentTickets.length} open ticket${currentTickets.length === 1 ? '' : 's'}`,
    leave_balance: {
      total: bal.pto_total,
      used: bal.pto_used,
      remaining: Math.max(0, bal.pto_total - bal.pto_used),
      display: `${Math.max(0, bal.pto_total - bal.pto_used)} of ${bal.pto_total} days remaining`,
      percent: Math.round(((Math.max(0, bal.pto_total - bal.pto_used)) / bal.pto_total) * 100),
    },
    pending_leave_request: pendingLeave ? {
      id: pendingLeave.id,
      days: pendingLeave.days,
      type: pendingLeave.type,
      start_date: pendingLeave.start_date,
      end_date: pendingLeave.end_date,
      reason: pendingLeave.reason,
      display: `Pending: ${pendingLeave.days} days (${pendingLeave.type.toUpperCase()})`,
    } : null,
    rolling_score: typeof staff.rolling_score === 'number' ? staff.rolling_score.toFixed(1) : '5.0',
    cross_training_depts: staff.cross_training_depts || (staff.role === ROLES.SUPPORT_EXECUTIVE ? ['HR', 'Customer Support'] : []),
    onboarding_checklist: onboardingChecklist,
    attendance_today: {
      status: attendance.status,
      first_swipe_in: attendance.first_swipe_in,
      last_swipe_out: attendance.last_swipe_out,
      total_hours: attendance.total_hours,
      swipe_count: attendance.swipe_count,
    },
  });
});

// ─── Work Mode & Policy: Toggle Office vs Remote/WFH ──────────
router.patch('/manager/staff/:id/work-mode', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), async (req, res) => {
  const staffId = req.params.id;
  const { work_mode } = req.body || {};

  if (!['office', 'remote_wfh'].includes(work_mode)) {
    return res.status(400).json({ error: 'invalid_mode', message: 'work_mode must be office or remote_wfh' });
  }

  const staff = accountStore.findById(staffId);
  if (!staff) {
    return res.status(404).json({ error: 'not_found', message: 'Staff member not found' });
  }

  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  if (!isMain && staff.department !== req.user.department) {
    return res.status(403).json({ error: 'forbidden', message: 'Cannot modify staff outside your department' });
  }

  const updated = await accountStore.updateAccount(staffId, { work_mode });

  auditService.recordAudit({
    actorId: req.user.id,
    actorType: 'manager',
    action: 'staff_work_mode_changed',
    targetType: 'staff',
    targetId: staffId,
    department: staff.department,
    metadata: { work_mode },
  });

  return res.json({
    message: `Work mode updated to ${work_mode === 'remote_wfh' ? 'Remote / WFH' : 'In-Office'}`,
    staff: accountStore.toPublic(updated),
  });
});

// ─── Cross-Training Coverage Tagging ──────────────────────────
router.patch('/manager/staff/:id/cross-train', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), async (req, res) => {
  const staffId = req.params.id;
  const { cross_training_depts } = req.body || {};

  if (!Array.isArray(cross_training_depts)) {
    return res.status(400).json({ error: 'invalid_input', message: 'cross_training_depts must be an array' });
  }

  const staff = accountStore.findById(staffId);
  if (!staff) return res.status(404).json({ error: 'not_found', message: 'Staff member not found' });

  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  if (!isMain && staff.department !== req.user.department) {
    return res.status(403).json({ error: 'forbidden', message: 'Staff member outside your department' });
  }

  const updated = await accountStore.updateAccount(staffId, { cross_training_depts });

  return res.json({
    message: 'Cross-training coverage updated',
    cross_training_depts: updated.cross_training_depts,
  });
});

// ─── Workload Balance View ────────────────────────────────────
router.get('/manager/workload', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  const isAll = (isMain && (!req.query.department || req.query.department === 'All')) || req.query.department === 'All' || req.user.department === 'All';
  const targetDept = isAll ? 'All' : (req.query.department || req.user.department);

  const state = req.app.get('state') || { tickets: [] };
  const deptTickets = (state.tickets || []).filter(t => (isAll ? true : t.department === targetDept) && t.status !== 'resolved');

  const staffAccounts = isAll
    ? accountStore.listAccounts({ role: ROLES.SUPPORT_EXECUTIVE })
    : accountStore.listAccounts({ department: targetDept, role: ROLES.SUPPORT_EXECUTIVE });
  const MAX_CAPACITY = 10;

  const workload = staffAccounts.map(s => {
    const assignedTickets = deptTickets.filter(t => t.assigned_agent_id === s.id || t.assigned_to === s.id);
    const load = assignedTickets.length;
    const capacityPercent = Math.min(100, Math.round((load / MAX_CAPACITY) * 100));

    let status = 'balanced';
    if (load >= 8) status = 'overloaded';
    else if (load >= 5) status = 'near_cap';
    else if (load === 0) status = 'idle';

    return {
      id: s.id,
      name: s.name,
      email: s.email,
      tier: s.tier || 'L1',
      department: s.department,
      status: s.status || 'online',
      work_mode: s.work_mode || 'office',
      load,
      max_capacity: MAX_CAPACITY,
      capacity_percent: capacityPercent,
      fairness_status: status,
      tickets: assignedTickets.map(t => ({ id: t.id, subject: t.subject || t.issue, priority: t.priority })),
    };
  });

  return res.json({
    department: targetDept,
    max_capacity_per_agent: MAX_CAPACITY,
    total_open_tickets: deptTickets.length,
    staff_count: staffAccounts.length,
    workload,
  });
});

// ─── Attendance Compliance Trend ──────────────────────────────
router.get('/manager/attendance-compliance', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  const isAll = (isMain && (!req.query.department || req.query.department === 'All')) || req.query.department === 'All' || req.user.department === 'All';
  const targetDept = isAll ? 'All' : (req.query.department || req.user.department);

  const staffAccounts = isAll
    ? accountStore.listAccounts({ role: ROLES.SUPPORT_EXECUTIVE })
    : accountStore.listAccounts({ department: targetDept, role: ROLES.SUPPORT_EXECUTIVE });
  const todayStr = new Date().toISOString().split('T')[0];

  const staffReport = staffAccounts.map(s => {
    const history = attendanceService.getEmployeeAttendanceHistory(s.id, 7);
    const presentDays = history.filter(h => h.status === 'present').length;
    const halfDays = history.filter(h => h.status === 'half_day').length;
    const totalSwipes = history.reduce((sum, h) => sum + h.swipe_count, 0);

    const isRemote = s.work_mode === 'remote_wfh';
    const compliant = isRemote || presentDays > 0;

    return {
      id: s.id,
      name: s.name,
      department: s.department,
      work_mode: s.work_mode || 'office',
      present_days: presentDays,
      half_days: halfDays,
      total_swipes_7d: totalSwipes,
      compliant_7d: compliant,
      today_status: history[0]?.status || 'absent',
      today_swipes: history[0]?.swipe_count || 0,
      unverified_presence: s.status === 'online' && !isRemote && (history[0]?.swipe_count || 0) === 0,
    };
  });

  const totalStaff = staffAccounts.length;
  const compliantCount = staffReport.filter(s => s.compliant_7d).length;
  const unverifiedCount = staffReport.filter(s => s.unverified_presence).length;

  return res.json({
    department: targetDept,
    compliance_rate: totalStaff > 0 ? Math.round((compliantCount / totalStaff) * 100) : 100,
    unverified_presences: unverifiedCount,
    staff: staffReport,
  });
});

// ─── Live Active Assignments ("Who's handling what right now") ─
router.get('/manager/active-assignments', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  const isAll = (isMain && (!req.query.department || req.query.department === 'All')) || req.query.department === 'All' || req.user.department === 'All';
  const targetDept = isAll ? 'All' : (req.query.department || req.user.department);

  const state = req.app.get('state') || { tickets: [] };
  const tickets = (state.tickets || []).filter(t =>
    t.status !== 'resolved' && (isAll ? true : t.department === targetDept)
  );

  const assignments = tickets.map(t => {
    const agent = t.assigned_agent_id ? accountStore.findById(t.assigned_agent_id) : (t.assigned_to ? accountStore.findById(t.assigned_to) : null);
    const now = Date.now();
    const remainingMs = t.sla_deadline ? Math.max(0, t.sla_deadline - now) : null;
    const remainingMin = remainingMs !== null ? Math.round(remainingMs / 60000) : null;

    return {
      ticket_id: t.id,
      department: t.department,
      subject: t.subject || t.issue || 'Active ticket',
      priority: t.priority,
      status: t.status,
      assigned_agent: agent ? { id: agent.id, name: agent.name, tier: agent.tier, status: agent.status, email: agent.email } : null,
      required_tier: t.required_tier || 'L1',
      sla_deadline: t.sla_deadline,
      remaining_min: remainingMin,
      breach_risk: remainingMin !== null && remainingMin <= 30,
    };
  });

  return res.json({
    department: targetDept,
    active_count: assignments.length,
    assigned_count: assignments.filter(a => a.assigned_agent).length,
    unassigned_count: assignments.filter(a => !a.assigned_agent).length,
    assignments,
  });
});

module.exports = router;
