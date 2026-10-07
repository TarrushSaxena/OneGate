// ============================================================
// TIER RECALCULATION & AGENT PERFORMANCE ENGINE (USP-4)
// Multi-cycle promotion & demotion with audit trails & snapshot integrity
// ============================================================

const auditService = require('./audit');

const TIERS = {
  L1: { name: 'Level 1 Specialist', rank: 1, next: 'L2', prev: null },
  L2: { name: 'Level 2 Specialist', rank: 2, next: 'L3', prev: 'L1' },
  L3: { name: 'Level 3 Specialist', rank: 3, next: null, prev: 'L2' },
};

const TIER_CONFIG = {
  PROMOTION_THRESHOLD: 85,
  PROMOTION_CONSECUTIVE_CYCLES: 3,
  DEMOTION_THRESHOLD: 60,
  DEMOTION_CONSECUTIVE_CYCLES: 2,
};

/**
 * Evaluate single employee for tier adjustment based on consecutive review cycles
 */
function evaluateEmployeeTier(employee, opts = {}) {
  if (!employee) return null;

  const currentTier = employee.tier || 'L1';
  const score = employee.rolling_score !== undefined ? employee.rolling_score : 75;
  const history = employee.tier_cycle_history || [];

  let consecutiveHigh = employee.consecutive_high_cycles || 0;
  let consecutiveLow = employee.consecutive_low_cycles || 0;
  let actionTaken = 'none';
  let previousTier = currentTier;
  let newTier = currentTier;
  let reason = '';

  if (score >= TIER_CONFIG.PROMOTION_THRESHOLD) {
    consecutiveHigh += 1;
    consecutiveLow = 0;
    if (consecutiveHigh >= TIER_CONFIG.PROMOTION_CONSECUTIVE_CYCLES) {
      const nextTier = TIERS[currentTier]?.next;
      if (nextTier) {
        newTier = nextTier;
        actionTaken = 'promoted';
        reason = `Promoted to ${newTier} after ${consecutiveHigh} consecutive cycles maintaining rolling score >= ${TIER_CONFIG.PROMOTION_THRESHOLD}`;
        consecutiveHigh = 0;
      }
    }
  } else if (score < TIER_CONFIG.DEMOTION_THRESHOLD) {
    consecutiveLow += 1;
    consecutiveHigh = 0;
    if (consecutiveLow >= TIER_CONFIG.DEMOTION_CONSECUTIVE_CYCLES) {
      const prevTier = TIERS[currentTier]?.prev;
      if (prevTier) {
        newTier = prevTier;
        actionTaken = 'demoted';
        reason = `Demoted to ${newTier} after ${consecutiveLow} consecutive cycles with rolling score < ${TIER_CONFIG.DEMOTION_THRESHOLD}`;
        consecutiveLow = 0;
      }
    }
  } else {
    // Normal performance resets consecutive streak
    consecutiveHigh = 0;
    consecutiveLow = 0;
  }

  // Update employee record
  employee.tier = newTier;
  employee.consecutive_high_cycles = consecutiveHigh;
  employee.consecutive_low_cycles = consecutiveLow;
  employee.tier_cycle_history = [
    ...history,
    {
      cycle_date: new Date().toISOString(),
      score,
      tier: newTier,
      action: actionTaken,
    },
  ].slice(-15);

  if (actionTaken !== 'none') {
    auditService.logAuditEvent({
      actor_id: opts.actor_id || 'system',
      actor_name: opts.actor_name || 'Tier Automation Service',
      actor_type: 'system',
      action: actionTaken === 'promoted' ? 'tier_promoted' : 'tier_demoted',
      target_type: 'employee',
      target_id: employee.id,
      department: employee.department || 'General',
      details: reason,
      metadata: {
        previous_tier: previousTier,
        new_tier: newTier,
        score,
        consecutive_cycles: actionTaken === 'promoted' ? TIER_CONFIG.PROMOTION_CONSECUTIVE_CYCLES : TIER_CONFIG.DEMOTION_CONSECUTIVE_CYCLES,
      },
    });
  }

  return {
    employee_id: employee.id,
    previous_tier: previousTier,
    current_tier: newTier,
    rolling_score: score,
    consecutive_high_cycles: consecutiveHigh,
    consecutive_low_cycles: consecutiveLow,
    action: actionTaken,
    reason,
  };
}

/**
 * Run tier evaluation across an array of employees
 */
function runTierRecalculationCycle(employees = [], opts = {}) {
  const results = [];
  for (const emp of employees) {
    const res = evaluateEmployeeTier(emp, opts);
    if (res) results.push(res);
  }
  return results;
}

module.exports = {
  TIERS,
  TIER_CONFIG,
  evaluateEmployeeTier,
  runTierRecalculationCycle,
};
