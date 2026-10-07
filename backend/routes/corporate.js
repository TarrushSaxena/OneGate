// Corporate Modules Router
// Strict server-side ownership, IDOR prevention, and data classification
const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../auth/middleware');
const { ROLES } = require('../auth/roles');
const accountStore = require('../auth/accountStore');
const attendanceService = require('../services/attendance');

router.use(authenticate);

// ─── ITEM 20: Door Swipe Simulation & Attendance ─────────────

// Simulate Swipe In/Out
router.post('/swipes/simulate', (req, res) => {
  const { door_id, building, floor, direction, card_id, timestamp } = req.body || {};

  try {
    const event = attendanceService.simulateSwipe({
      employeeId: req.user.id,
      cardId: card_id,
      doorId: door_id,
      building,
      floor,
      direction,
      timestamp,
    });

    return res.status(201).json({
      success: true,
      message: `Swipe recorded successfully (${event.direction.toUpperCase()})`,
      event,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.code || 'swipe_error',
      message: err.message,
    });
  }
});

// Current User's Attendance History (Self-Service)
router.get('/attendance/my', (req, res) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const records = attendanceService.getEmployeeAttendanceHistory(req.user.id, 7);
  const today = records.find(r => r.date === todayStr) || attendanceService.deriveAttendanceForDate(req.user.id, todayStr);

  return res.json({
    dataClassification: attendanceService.DATA_CLASSIFICATION,
    employee_id: req.user.id,
    presence_status: req.account.status || 'online', // Separate presence from attendance
    today,
    records,
  });
});

// Team Attendance (Department Manager or Main Manager)
router.get('/attendance/team', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  const accounts = accountStore.listAccounts();
  const todayStr = new Date().toISOString().split('T')[0];

  // Hard-scope: Dept Manager can ONLY see their own department's staff
  const targetDept = isMain && req.query.department ? req.query.department : req.user.department;
  const teamAccounts = accounts.filter(a => isMain && !req.query.department ? true : a.department === targetDept);

  const teamAttendance = teamAccounts.map(member => {
    const att = attendanceService.deriveAttendanceForDate(member.id, todayStr);
    return {
      employee_id: member.id,
      name: member.name,
      department: member.department,
      role: member.role,
      tier: member.tier || 'L1',
      presence_status: member.status || 'online',
      attendance_status: att.status,
      first_swipe_in: att.first_swipe_in,
      last_swipe_out: att.last_swipe_out,
      total_hours: att.total_hours,
    };
  });

  return res.json({
    dataClassification: attendanceService.DATA_CLASSIFICATION,
    department: targetDept,
    date: todayStr,
    count: teamAttendance.length,
    team: teamAttendance,
  });
});

// Specific Employee Attendance with Strict IDOR Check
router.get('/attendance/:employeeId', (req, res) => {
  const targetId = req.params.employeeId;
  const isSelf = req.user.id === targetId;
  const isMain = req.user.role === ROLES.MAIN_MANAGER;

  const targetAccount = accountStore.findById(targetId);
  if (!targetAccount) {
    return res.status(404).json({ error: 'not_found', message: 'Employee not found' });
  }

  const isDirectManager =
    req.user.role === ROLES.DEPARTMENT_MANAGER && req.user.department === targetAccount.department;

  // Strict IDOR Rule: Only owner, their direct department manager, or main manager can access
  if (!isSelf && !isDirectManager && !isMain) {
    return res.status(403).json({
      error: 'forbidden',
      message: 'Access denied: You do not have permission to inspect this employee attendance records',
    });
  }

  const records = attendanceService.getEmployeeAttendanceHistory(targetId, 7);
  return res.json({
    dataClassification: attendanceService.DATA_CLASSIFICATION,
    employee_id: targetId,
    presence_status: targetAccount.status || 'online',
    records,
  });
});

// ─── ITEM 21: Emergency SOS Targeted Alerting System ─────────
const emergencyService = require('../services/emergency');

// Trigger Emergency SOS (Any authenticated user)
router.post('/emergency/sos', (req, res) => {
  const { location, notes, contact_phone } = req.body || {};
  if (!location) {
    return res.status(400).json({ error: 'missing_location', message: 'Location is required for emergency dispatch' });
  }

  const state = req.app.get('state');
  const io = req.app.get('io');

  const result = emergencyService.triggerEmergencySOS({
    employee: req.user,
    location,
    notes,
    contactPhone: contact_phone,
    state,
    io,
  });

  return res.status(201).json({
    success: true,
    message: 'EMERGENCY SOS DISPATCHED: Targeted notification sent to Manager, Security, and HR',
    alert: result.alert,
    notified_channels: result.notified_channels,
    broadcast_to_all: result.broadcast_to_all,
  });
});

// Emergency SOS Audit Trail (Restricted to Managers / Security)
router.get('/emergency/sos/audit', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const auditLog = emergencyService.getSosAuditLog();
  return res.json({
    dataClassification: emergencyService.DATA_CLASSIFICATION,
    count: auditLog.length,
    audit_log: auditLog,
  });
});

// ─── ITEM 22: Lost ID Card Security Protocol ──────────────────
const idCardService = require('../services/idCardService');

// Report Lost ID Card (Cardholder or Security Admin)
router.post('/id-cards/report-lost', (req, res) => {
  const { card_id, employee_id, lost_location, lost_time, notes } = req.body || {};
  const state = req.app.get('state');
  const io = req.app.get('io');

  try {
    const result = idCardService.reportLostCard({
      reporterUser: req.user,
      cardId: card_id,
      employeeId: employee_id,
      lostLocation: lost_location,
      lostTime: lost_time,
      notes,
      state,
      io,
    });

    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.code || 'report_error',
      message: err.message,
    });
  }
});

// Lost Card Security Audit Trail
router.get('/id-cards/audit', requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const audit = idCardService.getCardAuditLog();
  return res.json({
    dataClassification: idCardService.DATA_CLASSIFICATION,
    count: audit.length,
    audit_log: audit,
  });
});

module.exports = router;
