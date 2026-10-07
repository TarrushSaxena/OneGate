// Lost ID Card & Access Control Security Service
// Data Classification: RESTRICTED
const { v4: uuidv4 } = require('uuid');
const attendanceService = require('./attendance');
const { ROLES } = require('../auth/roles');

const DATA_CLASSIFICATION = 'RESTRICTED';

const lostCardReports = [];
const cardAuditLog = [];

function reportLostCard({
  reporterUser,
  cardId,
  employeeId = null,
  lostLocation = 'Unknown',
  lostTime = null,
  notes = '',
  state = null,
  io = null,
}) {
  const targetEmployeeId = employeeId || reporterUser.id;
  const isSelf = reporterUser.id === targetEmployeeId;
  const isSecurityOrMainMgr =
    reporterUser.role === ROLES.MAIN_MANAGER ||
    (reporterUser.role === ROLES.DEPARTMENT_MANAGER &&
      (reporterUser.department === 'Cybersecurity' || reporterUser.department === 'Facilities' || reporterUser.department === 'IT'));

  // Strict IDOR Rule: Only cardholder or Security/Facilities manager can report/deactivate
  if (!isSelf && !isSecurityOrMainMgr) {
    const err = new Error('Access denied: You do not have permission to deactivate this badge');
    err.status = 403;
    err.code = 'forbidden';
    throw err;
  }

  const effectiveCardId = cardId || `badge-${targetEmployeeId}`;

  // 1. Immediately deactivate badge in access control system
  attendanceService.setCardStatus(effectiveCardId, 'deactivated');

  const incidentId = `sec-inc-${uuidv4().slice(0, 8)}`;
  const ticketId = `t-badge-${uuidv4().slice(0, 6)}`;
  const now = new Date().toISOString();

  // 2. Create security replacement ticket in system state if available
  if (state && state.tickets) {
    const securityTicket = {
      id: ticketId,
      user_id: targetEmployeeId,
      department: 'Cybersecurity',
      subject: `🔒 Lost ID Badge Deactivated: ${effectiveCardId}`,
      priority: 'high',
      priority_reason: 'Lost physical access credential reported - requires urgent deactivation & reissue',
      required_tier: 'L2',
      status: 'open',
      assigned_to: null,
      created_at: Date.now(),
      sla_deadline: Date.now() + 2 * 3600 * 1000, // 2-hour high priority SLA
      is_security_incident: true,
      security_details: {
        incident_id: incidentId,
        deactivated_card: effectiveCardId,
        reported_by: reporterUser.id,
        lost_location: lostLocation,
        lost_time: lostTime || now,
        notes,
      },
    };
    state.tickets.unshift(securityTicket);
  }

  const report = {
    incident_id: incidentId,
    replacement_ticket_id: ticketId,
    card_id: effectiveCardId,
    employee_id: targetEmployeeId,
    reported_by: reporterUser.id,
    card_status: 'deactivated',
    lost_location: lostLocation,
    lost_time: lostTime || now,
    notes,
    created_at: now,
  };

  lostCardReports.unshift(report);

  // 3. Immutable Security Audit Log
  const auditEntry = {
    id: `audit-${uuidv4().slice(0, 8)}`,
    action: 'ID_CARD_DEACTIVATED',
    dataClassification: DATA_CLASSIFICATION,
    card_id: effectiveCardId,
    employee_id: targetEmployeeId,
    performed_by: reporterUser.id,
    timestamp: now,
    incident_id: incidentId,
  };
  cardAuditLog.unshift(auditEntry);

  if (io) {
    io.to('security:alerts').emit('security:badge:deactivated', {
      cardId: effectiveCardId,
      employeeId: targetEmployeeId,
      incidentId,
    });
  }

  return {
    success: true,
    card_id: effectiveCardId,
    card_status: 'deactivated',
    security_incident_id: incidentId,
    replacement_ticket_id: ticketId,
    report,
  };
}

function getCardAuditLog() {
  return [...cardAuditLog];
}

module.exports = {
  DATA_CLASSIFICATION,
  lostCardReports,
  cardAuditLog,
  reportLostCard,
  getCardAuditLog,
};
