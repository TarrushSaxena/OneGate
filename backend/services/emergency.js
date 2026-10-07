// Emergency SOS and Safety Dispatch Service
// Data Classification: RESTRICTED
const { v4: uuidv4 } = require('uuid');

const DATA_CLASSIFICATION = 'RESTRICTED';

const sosAlerts = [];
const sosAuditLog = [];

function triggerEmergencySOS({ employee, location, notes, contactPhone, state = null, io = null }) {
  const alertId = `sos-${uuidv4().slice(0, 8)}`;
  const ticketId = `t-sos-${uuidv4().slice(0, 6)}`;
  const now = new Date().toISOString();

  // Create immediate urgent ticket in system state if available
  if (state && state.tickets) {
    const urgentTicket = {
      id: ticketId,
      user_id: employee.id,
      user_name: employee.name,
      department: employee.department || 'Facilities',
      subject: `🚨 EMERGENCY SOS — ${location}`,
      priority: 'critical',
      priority_reason: 'Emergency SOS alert triggered by employee',
      required_tier: 'L3',
      status: 'open',
      assigned_to: null,
      sla_deadline: Date.now() + 15 * 60 * 1000, // 15-minute emergency SLA
      created_at: Date.now(),
      is_emergency: true,
      emergency_details: {
        location,
        notes,
        contact_phone: contactPhone,
      },
    };
    state.tickets.unshift(urgentTicket);
  }

  // Targeted Notification Channels (Strictly Narrow: Direct Manager, Security, HR)
  const notifiedChannels = ['security:alerts', 'hr:leads'];
  if (employee.department) {
    notifiedChannels.push(`manager:dept:${employee.department}`);
  }

  const alert = {
    id: alertId,
    employee_id: employee.id,
    employee_name: employee.name,
    department: employee.department,
    location,
    notes: notes || 'Immediate security/medical assistance required',
    contact_phone: contactPhone || 'Not provided',
    priority: 'urgent',
    status: 'dispatched',
    ticket_id: ticketId,
    created_at: now,
  };

  sosAlerts.unshift(alert);

  // Deliver targeted WebSocket alerts if socket server is active
  if (io) {
    for (const channel of notifiedChannels) {
      io.to(channel).emit('emergency:sos:alert', {
        alert,
        message: `🚨 EMERGENCY SOS from ${employee.name} at ${location}`,
      });
    }
  }

  // Immutable Security Audit Log
  const auditEntry = {
    id: `audit-${uuidv4().slice(0, 8)}`,
    action: 'EMERGENCY_SOS_TRIGGERED',
    dataClassification: DATA_CLASSIFICATION,
    timestamp: now,
    alert_id: alertId,
    ticket_id: ticketId,
    employee_id: employee.id,
    employee_name: employee.name,
    location,
    notes,
    notified_channels: notifiedChannels,
    ip_or_agent: 'OneGate Internal Gateway',
  };

  sosAuditLog.unshift(auditEntry);

  return {
    alert,
    notified_channels: notifiedChannels,
    broadcast_to_all: false,
    audit_entry: auditEntry,
  };
}

function getSosAuditLog() {
  return [...sosAuditLog];
}

module.exports = {
  DATA_CLASSIFICATION,
  sosAlerts,
  sosAuditLog,
  triggerEmergencySOS,
  getSosAuditLog,
};
