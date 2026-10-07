// ============================================================
// HANDOFF PAYLOAD BUILDER (DTO)
// Safe user-facing DTO with strict deny-list enforcement
// NEVER exposes: scores, load, employee_id, rolling_score, internal tiers
// ============================================================

const { levelLabel } = require('./priority');

function safeLevel(tier) {
  try {
    return levelLabel(tier);
  } catch {
    return 'Level 1 support';
  }
}

/**
 * Builds user-facing handoff payload.
 * Strictly adheres to Part 1 UX contract.
 */
function buildHandoffPayload(ticket, assignee, etaLow, etaHigh, timezone = 'Asia/Kolkata') {
  const levelLbl = safeLevel(assignee?.tier || ticket.required_tier || 'L1');
  
  const now = Date.now();
  const clockMs = etaHigh ? now + etaHigh * 60000 : null;
  const etaClock = clockMs ? new Date(clockMs).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }) : null;

  const payload = {
    ticket_ref:         ticket.id ? ticket.id.slice(-6).toUpperCase() : 'NEW',
    department:         ticket.department ? `${ticket.department} Support` : 'Support',
    priority:           ticket.priority || 'medium',
    priority_reason:    ticket.priority_reason || 'Standard request',
    assigned_first_name: assignee?.name ? assignee.name.split(' ')[0] : null,
    level_label:        levelLbl,
    status_step:        ticket.status || 'open',
    eta_low_min:        etaLow,
    eta_high_min:       etaHigh,
    eta_clock:          etaClock,
    queue_position:     ticket.queue_position !== undefined ? ticket.queue_position : null,
    can_change_priority: true,
  };

  // Enforce deny-list security check
  const DENY_LIST = ['score', 'scores', 'load', 'current_load', 'employee_id', 'employeeId', 'rolling_score'];
  for (const deniedKey of DENY_LIST) {
    if (deniedKey in payload) {
      delete payload[deniedKey];
      throw new Error(`Security violation: Handoff payload contained denied key: ${deniedKey}`);
    }
  }

  return payload;
}

module.exports = { buildHandoffPayload, safeLevel };
