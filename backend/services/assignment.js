// ============================================================
// ASSIGNMENT SCORING ENGINE
// score(e,t) = w1·skill_match + w2·availability + w3·(1-load_ratio)
//            + w4·historical_success_rate - w5·avg_response_time
// Weighted random pick from top 3 (fairness-aware)
// ============================================================

const WEIGHTS = {
  skill_match:    0.35,
  availability:   0.25,
  load_ratio:     0.20,
  success_rate:   0.15,
  response_time:  0.05,
};

const AVAILABILITY_SCORE = {
  online: 1.0,
  busy:   0.4,
  offline: 0.0,
};

const TIER_RANK = { L1: 1, L2: 2, L3: 3 };

// ─── Skill Matching ──────────────────────────────────────────
function computeSkillMatch(employee, ticket) {
  if (!ticket.tags || ticket.tags.length === 0) return 0.5;

  const empSkills = new Set(employee.skill_tags.map(s => s.toLowerCase()));
  const matchCount = ticket.tags.filter(tag => {
    // Also check partial match
    return empSkills.has(tag.toLowerCase()) ||
      [...empSkills].some(s => s.includes(tag) || tag.includes(s));
  }).length;

  return Math.min(1.0, matchCount / ticket.tags.length + 0.1);
}

// ─── Load Ratio ───────────────────────────────────────────────
function computeLoadRatio(employee) {
  const MAX_LOAD = { L1: 6, L2: 8, L3: 10 };
  const max = MAX_LOAD[employee.tier] || 6;
  return Math.min(1.0, employee.current_load / max);
}

// ─── Historical Success Rate (normalized 0-1) ─────────────────
function computeSuccessRate(employee) {
  return employee.rolling_score / 100;
}

// ─── Avg Response Time Score (inverse, lower is better) ───────
function computeResponseTimeScore(employee) {
  // Approximate: higher tier → faster response assumed
  const tierBonus = TIER_RANK[employee.tier] * 0.1;
  const tenureBonus = Math.min(0.2, employee.tenure * 0.03);
  return Math.min(1.0, 0.5 + tierBonus + tenureBonus);
}

// ─── Main Scoring Function ─────────────────────────────────────
function scoreEmployee(employee, ticket) {
  const skillMatch    = computeSkillMatch(employee, ticket);
  const availability  = AVAILABILITY_SCORE[employee.status] || 0;
  const loadRatio     = computeLoadRatio(employee);
  const successRate   = computeSuccessRate(employee);
  const responseTime  = computeResponseTimeScore(employee);

  const score =
    WEIGHTS.skill_match   * skillMatch +
    WEIGHTS.availability  * availability +
    WEIGHTS.load_ratio    * (1 - loadRatio) +   // inverse: lower load = better
    WEIGHTS.success_rate  * successRate +
    WEIGHTS.response_time * responseTime;

  return {
    employeeId: employee.id,
    name: employee.name,
    department: employee.department,
    tier: employee.tier,
    score: parseFloat(score.toFixed(4)),
    breakdown: {
      skill_match:   parseFloat((WEIGHTS.skill_match * skillMatch).toFixed(4)),
      availability:  parseFloat((WEIGHTS.availability * availability).toFixed(4)),
      load_ratio:    parseFloat((WEIGHTS.load_ratio * (1 - loadRatio)).toFixed(4)),
      success_rate:  parseFloat((WEIGHTS.success_rate * successRate).toFixed(4)),
      response_time: parseFloat((WEIGHTS.response_time * responseTime).toFixed(4)),
    },
  };
}

// ─── Weighted Random Pick (fairness) ─────────────────────────
function weightedRandomPick(candidates) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Use top 3 max
  const pool = candidates.slice(0, 3);
  const totalScore = pool.reduce((sum, c) => sum + c.score, 0);

  // Softmax-style weighted random
  const rand = Math.random() * totalScore;
  let cumulative = 0;

  for (const candidate of pool) {
    cumulative += candidate.score;
    if (rand <= cumulative) return candidate;
  }

  return pool[0]; // fallback to best
}

// ─── Main Assignment Function ─────────────────────────────────
function assignTicket(ticket, employees) {
  const TIER_RANK_NUM = { L1: 1, L2: 2, L3: 3 };
  const requiredTierNum = TIER_RANK_NUM[ticket.required_tier] || 1;

  // Filter: same department, tier >= required, not offline (unless no other option)
  let candidates = employees.filter(e =>
    e.department === ticket.department &&
    TIER_RANK_NUM[e.tier] >= requiredTierNum &&
    e.status !== 'offline'
  );

  // If no online candidates, include busy
  if (candidates.length === 0) {
    candidates = employees.filter(e =>
      e.department === ticket.department &&
      TIER_RANK_NUM[e.tier] >= requiredTierNum
    );
  }

  // If still none, drop into unclaimed pool
  if (candidates.length === 0) {
    return {
      assigned: false,
      reason: 'No available employees in department with required tier',
      pool: `${ticket.department}_unclaimed`,
      scores: [],
    };
  }

  // Score all candidates
  const scored = candidates
    .map(e => scoreEmployee(e, ticket))
    .sort((a, b) => b.score - a.score);

  // Weighted random pick from top 3
  const selected = weightedRandomPick(scored);

  const matchedFactors = [];
  if (selected.breakdown.skill_match > 0.15) matchedFactors.push('skill_overlap');
  if (selected.breakdown.load_ratio > 0.08) matchedFactors.push('current_load');
  if (selected.breakdown.success_rate > 0.10) matchedFactors.push('past_resolution_rate');
  if (selected.breakdown.availability > 0.15) matchedFactors.push('availability');

  const factorDescriptions = [];
  if (matchedFactors.includes('skill_overlap')) factorDescriptions.push('skill overlap');
  if (matchedFactors.includes('current_load')) factorDescriptions.push('current workload');
  if (matchedFactors.includes('past_resolution_rate')) factorDescriptions.push('past resolution rate');
  if (matchedFactors.includes('availability')) factorDescriptions.push('active availability');

  const reason = factorDescriptions.length > 0
    ? `Matched on ${factorDescriptions.join(', ')}`
    : 'Matched on specialist availability and tier eligibility';
  const safeSummary = 'Your request was matched with a specialist based on their expertise and availability.';

  const score100 = Math.min(100, Math.max(0, Math.round(selected.score * 100)));

  return {
    assigned: true,
    assignedTo: selected.employeeId,
    assigneeName: selected.name,
    score: score100,
    raw_score: selected.score,
    scores: scored,
    breakdown: selected.breakdown,
    reason,
    safe_summary: safeSummary,
    matched_factors: matchedFactors,
    required_tier_snapshot: ticket.required_tier || 'L1',
    assigned_at: new Date().toISOString(),
    algorithm: 'weighted_random_top3',
  };
}

// ─── Escalation Logic ─────────────────────────────────────────
function escalateTicket(ticket, employees, reason) {
  const TIER_RANK_NUM = { L1: 1, L2: 2, L3: 3 };
  const TIER_UP = { L1: 'L2', L2: 'L3', L3: 'L3' };

  const currentTierNum = TIER_RANK_NUM[ticket.required_tier] || 1;
  const newTier = TIER_UP[ticket.required_tier];

  if (ticket.reassignment_count >= 2) {
    // Go straight to department manager
    return {
      escalationType: 'manager',
      newTier,
      reason: `${reason} — exceeded 2 reassignments, routing to department manager`,
    };
  }

  // Re-run assignment with higher tier
  const updatedTicket = { ...ticket, required_tier: newTier };
  const result = assignTicket(updatedTicket, employees);

  return {
    escalationType: 'tier_bump',
    newTier,
    reason,
    assignment: result,
  };
}

// ─── SLA Urgency Calculation ──────────────────────────────────
function calculateSlaUrgency(slaDeadline, now = new Date()) {
  const deadline = new Date(slaDeadline);
  const currentTime = new Date(now);
  const diffMs = deadline.getTime() - currentTime.getTime();
  const minutesRemaining = Math.round(diffMs / 60000);

  let tier = 'normal';
  if (minutesRemaining <= 0) {
    tier = 'breached';
  } else if (minutesRemaining <= 5) {
    tier = 'urgent';
  } else if (minutesRemaining <= 15) {
    tier = 'warning';
  }

  return {
    tier,
    minutesRemaining,
    deadlineIso: deadline.toISOString(),
  };
}

// ─── Queue Tickets Sorting for Agent Portal ───────────────────
function getQueueTicketsForAgent(tickets, now = new Date()) {
  const PRIORITY_ORDER = { urgent: 4, high: 3, normal: 2, low: 1 };

  return tickets
    .map(t => {
      const urgency = calculateSlaUrgency(t.sla_deadline, now);
      // Clean safe view model: omit any internal dev/debug logs
      const safeTicket = { ...t, urgency };
      delete safeTicket.debugLog;
      delete safeTicket.rawStackTrace;
      return safeTicket;
    })
    .sort((a, b) => {
      // 1. Sort by minutes remaining ascending (smallest/most overdue first)
      if (a.urgency.minutesRemaining !== b.urgency.minutesRemaining) {
        return a.urgency.minutesRemaining - b.urgency.minutesRemaining;
      }
      // 2. Tie break by priority weight descending
      const pA = PRIORITY_ORDER[a.priority] || 0;
      const pB = PRIORITY_ORDER[b.priority] || 0;
      return pB - pA;
    });
}

// ─── Filter Tickets by Priority ───────────────────────────────
function filterTicketsByPriority(tickets, priorityFilter) {
  if (!priorityFilter || priorityFilter.toLowerCase() === 'all') {
    return tickets;
  }
  return tickets.filter(t => (t.priority || '').toLowerCase() === priorityFilter.toLowerCase());
}

module.exports = {
  assignTicket,
  escalateTicket,
  scoreEmployee,
  calculateSlaUrgency,
  getQueueTicketsForAgent,
  filterTicketsByPriority,
};
