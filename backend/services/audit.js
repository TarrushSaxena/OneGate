// ============================================================
// AUDIT LOG SERVICE (USP-6)
// Append-only, tamper-evident audit logging for sensitive actions
// ============================================================

const { v4: uuidv4 } = require('uuid');

const auditLog = [];

// Sensitive keys that must NEVER be written to audit metadata
const SENSITIVE_KEYS = new RegExp('^(password|token|secret|jwt|hash|auth|credit_card|cvv|api_key)$', 'i');

function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const cleaned = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.test(k)) {
      cleaned[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      cleaned[k] = sanitizeMetadata(v);
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

/**
 * Append an immutable audit event
 */
function logAuditEvent({
  actor = null,
  actor_id = null,
  actor_name = null,
  actor_type = null,
  action,
  target_type,
  target_id,
  department = null,
  details = '',
  metadata = {},
}) {
  const id = 'aud_' + uuidv4().slice(0, 12);
  const now = Date.now();

  const resolvedActorId = actor_id || actor?.id || 'system';
  const resolvedActorName = actor_name || actor?.name || (actor?.role ? `${actor.role} user` : 'System');
  const resolvedActorType = actor_type || actor?.role || 'system';
  const resolvedDept = department || actor?.department || 'General';

  const entry = Object.freeze({
    id,
    timestamp: new Date(now).toISOString(),
    created_at: now,
    actor_id: String(resolvedActorId),
    actor_name: String(resolvedActorName),
    actor_type: String(resolvedActorType),
    action: String(action),
    target_type: String(target_type),
    target_id: String(target_id),
    department: resolvedDept,
    details: String(details),
    metadata: Object.freeze(sanitizeMetadata(metadata)),
  });

  auditLog.unshift(entry);
  return entry;
}

/**
 * Query audit log with role-aware and filter constraints
 */
function queryAuditLogs(filters = {}) {
  let results = [...auditLog];

  if (filters.action) {
    results = results.filter(e => e.action === filters.action);
  }
  if (filters.target_type) {
    results = results.filter(e => e.target_type === filters.target_type);
  }
  if (filters.target_id) {
    results = results.filter(e => e.target_id === filters.target_id);
  }
  if (filters.actor_id) {
    results = results.filter(e => e.actor_id === filters.actor_id);
  }
  if (filters.department) {
    results = results.filter(e => e.department.toLowerCase() === filters.department.toLowerCase());
  }
  if (filters.date_from) {
    const fromMs = new Date(filters.date_from).getTime();
    if (!isNaN(fromMs)) results = results.filter(e => e.created_at >= fromMs);
  }
  if (filters.date_to) {
    const toMs = new Date(filters.date_to).getTime();
    if (!isNaN(toMs)) results = results.filter(e => e.created_at <= toMs);
  }

  const limit = Math.min(parseInt(filters.limit, 10) || 50, 200);
  const offset = parseInt(filters.offset, 10) || 0;

  return {
    total: results.length,
    limit,
    offset,
    events: results.slice(offset, offset + limit),
  };
}

function clearAuditLogForTests() {
  auditLog.length = 0;
}

function recordAudit(payload = {}) {
  return logAuditEvent({
    actor_id: payload.actorId || payload.actor_id || payload.actor?.id,
    actor_name: payload.actorName || payload.actor_name || payload.actor?.name,
    actor_type: payload.actorType || payload.actor_type || payload.actor?.role,
    action: payload.action,
    target_type: payload.targetType || payload.target_type,
    target_id: payload.targetId || payload.target_id,
    department: payload.department,
    details: payload.details || '',
    metadata: payload.metadata || {},
    actor: payload.actor,
  });
}

module.exports = {
  logAuditEvent,
  recordAudit,
  queryAuditLogs,
  clearAuditLogForTests,
};
