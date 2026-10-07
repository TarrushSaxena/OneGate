// ============================================================
// PRIORITY SERVICE
// Rules + sentiment → {priority, reason, priority_reason}
// Implements the spec: Critical/High/Normal/Low with reasons
// ============================================================

// ─── Signal Patterns ─────────────────────────────────────────
const CRITICAL_PATTERNS = [
  /\boutage\b/i,
  /\bdown\b.*\b(all|everyone|company|production|entire)\b/i,
  /\b(all users|all employees|everyone)\b.*(can'?t|cannot|unable)/i,
  /\b(security breach|compromised|hacked|ransomware|data leak)\b/i,
  /\bproduction\b.*\b(down|broken|failed)\b/i,
  /\b(lost|stolen)\b.*\b(laptop|phone|device|badge)\b/i,
  /\b(laptop|phone|device|badge)\b.*\b(lost|stolen)\b/i,
  /\b(smoking|swelling|burst|caught fire|sparking)\b/i,
  /\bpayroll error\b.*\b(payday|friday|tomorrow)\b/i,
  /\bcannot work\b.*\b(everyone|whole team|all of us)\b/i,
];

const HIGH_PATTERNS = [
  /\b(urgent|asap|immediately|right away|right now|desperately)\b/i,
  /\bblocks? (my work|me from working|our work|the team)\b/i,
  /\b(deadline|due|submission|presenting|demo|meeting|interview)\b.*(today|tomorrow|this morning|in \d+ hours?)\b/i,
  /\b(cannot|can'?t|unable to).*(work|access|login|connect|open|use)\b/i,
  /\bstill (broken|not working|failing|down)\b.*\b(after|since)\b/i,
  /\b(frustrated|angry|escalate|unacceptable)\b/i,
  /\bthis is.*(critical|urgent|blocking)\b/i,
];

const LOW_PATTERNS = [
  /\b(general question|wondering|curious|just asking|when you get a chance|no rush|low priority)\b/i,
  /\b(best practice|suggestion|recommendation|nice to have)\b/i,
  /\bhow (do i|can i|would i|should i)\b/i,
  /\b(what is|what are|where can i find|can you explain)\b/i,
  /\bwhat\s*(?:can|do)\s*you\b/i,
  /\bhelp\s*me\s*with\b/i,
  /\b(hello|hi|hey|greetings|good\s*(?:morning|afternoon|evening))\b/i,
  /\b(future|eventually|someday|when possible)\b/i,
];

// ─── Reasons shown to users (per spec) ───────────────────────
const PRIORITY_REASONS = {
  critical: 'Security or company-wide impact',
  high: 'Blocks your work today',
  medium: 'Standard request',
  low: 'No deadline given',
};

/**
 * Compute priority and user-facing reason from message text.
 * @param {string} text
 * @param {{label:string, hasUrgency:boolean}} sentiment  - from NLP engine
 * @returns {{ priority: string, priority_reason: string }}
 */
function computePriority(text, sentiment = {}) {
  // 1. Check critical signals first
  if (CRITICAL_PATTERNS.some(p => p.test(text))) {
    return { priority: 'critical', priority_reason: PRIORITY_REASONS.critical };
  }

  // 2. High signals
  if (HIGH_PATTERNS.some(p => p.test(text))) {
    return { priority: 'high', priority_reason: PRIORITY_REASONS.high };
  }

  // 3. Low signals and conversational greetings (evaluated before ambient sentiment urgency)
  if (LOW_PATTERNS.some(p => p.test(text))) {
    return { priority: 'low', priority_reason: PRIORITY_REASONS.low };
  }

  // 4. Frustrated user sentiment → high
  if (sentiment.label === 'frustrated') {
    return { priority: 'high', priority_reason: PRIORITY_REASONS.high };
  }

  // 5. Has urgency lexicon
  if (sentiment.hasUrgency) {
    return { priority: 'high', priority_reason: PRIORITY_REASONS.high };
  }

  // 6. Default medium
  return { priority: 'medium', priority_reason: PRIORITY_REASONS.medium };
}

/**
 * SLA hours by priority
 */
function getSLAHours(priority) {
  return { critical: 1, high: 2, medium: 8, low: 24 }[priority] || 8;
}

/**
 * ETA computation per spec formula.
 * queue_wait = (tickets_ahead / available_agents) * avg_first_reply_minutes
 * eta_mid = queue_wait + avg_first_reply_minutes
 * range = eta_mid * 0.75 to eta_mid * 1.25, rounded to 5 min
 */
function computeETA(ticketsAhead, availableAgents, priority) {
  const avgReplyMinutes = { critical: 10, high: 20, medium: 45, low: 90 }[priority] || 45;

  if (availableAgents === 0) {
    // No agents — use queue position
    const wait = (ticketsAhead + 1) * avgReplyMinutes;
    const low  = roundTo5(wait * 0.75);
    const high = roundTo5(wait * 1.25);
    return { etaLowMin: low, etaHighMin: high, queuePosition: ticketsAhead + 1 };
  }

  const queueWait   = (ticketsAhead / availableAgents) * avgReplyMinutes;
  const etaMid      = queueWait + avgReplyMinutes;
  const etaLowMin   = roundTo5(etaMid * 0.75);
  const etaHighMin  = roundTo5(etaMid * 1.25);
  const slaMinutes  = getSLAHours(priority) * 60;

  return {
    etaLowMin:  Math.min(etaLowMin,  slaMinutes),
    etaHighMin: Math.min(etaHighMin, slaMinutes),
    queuePosition: ticketsAhead > 0 ? ticketsAhead + 1 : null,
  };
}

function roundTo5(n) {
  return Math.max(5, Math.round(n / 5) * 5);
}

/**
 * Format ETA as user-facing string: "About 15 to 25 min, by 2:40 PM"
 */
function formatETAMessage(etaLowMin, etaHighMin, timezone = 'Asia/Kolkata') {
  const now = new Date();
  const clockMs = now.getTime() + etaHighMin * 60000;
  const clock = new Date(clockMs).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: timezone,
  });

  if (etaLowMin === etaHighMin) {
    return `About ${etaLowMin} min, by ${clock}`;
  }
  return `About ${etaLowMin} to ${etaHighMin} min, by ${clock}`;
}

/**
 * Level label mapper (internal tier → user-facing label)
 */
function levelLabel(tier) {
  const map = {
    L1: 'Level 1 support',
    L2: 'Level 2 specialist',
    L3: 'Level 3 senior specialist',
    'manager': 'Team lead',
    'manager queue': 'Team lead',
  };
  if (!map[tier]) throw new Error(`Unknown tier: ${tier}`);
  return map[tier];
}

module.exports = {
  computePriority,
  getSLAHours,
  computeETA,
  formatETAMessage,
  levelLabel,
  PRIORITY_REASONS,
};
