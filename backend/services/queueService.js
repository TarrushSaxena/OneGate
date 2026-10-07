// ============================================================
// QUEUE & OPERATING HOURS SERVICE (PS18-11 / States 9 & 10)
// Implements business-hours detection and live busy queue tracking
// ============================================================

/**
 * Business hours check (Default: Mon-Fri 9:00 AM - 6:00 PM in specified timezone)
 */
function isBusinessHours(date = new Date(), department = 'IT', timezone = 'Asia/Kolkata') {
  // Convert date to parts in target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find(p => p.type === type)?.value;

  const weekday = getPart('weekday'); // Mon, Tue, Wed, Thu, Fri, Sat, Sun
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);
  const timeVal = hour + minute / 60;

  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  const isWorkHours = timeVal >= 9.0 && timeVal < 18.0;

  if (!isWeekend && isWorkHours) {
    return {
      isOffline: false,
      onlineAt: null,
      timezone,
    };
  }

  // Calculate when support resumes
  let onlineAt = '9:00 AM';
  if (isWeekend) {
    onlineAt = '9:00 AM Monday';
  } else if (timeVal >= 18.0 && weekday === 'Fri') {
    onlineAt = '9:00 AM Monday';
  } else if (timeVal >= 18.0) {
    onlineAt = '9:00 AM';
  } else if (timeVal < 9.0) {
    onlineAt = '9:00 AM';
  }

  return {
    isOffline: true,
    onlineAt,
    timezone,
  };
}

/**
 * Format State 9 Off-Hours Card per Part 1 copy spec:
 * "IT Support is offline until 9:00 AM. Your ticket is first in line. Here's a self serve fix to try now." + cited article
 */
function buildOffHoursCard(department, onlineAt, kbArticle) {
  const deptLabel = `${department} Support`;
  const citation = kbArticle?.source_citation || `${department} Corporate Policy §1.0`;
  const selfServeText = kbArticle?.content ? kbArticle.content.substring(0, 300) : 'Standard corporate self-service procedures apply.';

  const message = `${deptLabel} is offline until ${onlineAt}. Your ticket is first in line. Here's a self-serve fix to try now:\n\n${selfServeText}\n\n📎 *Source: ${citation}*`;

  return {
    state: 9,
    type: 'off_hours',
    department,
    onlineAt,
    message,
    citation,
    articleTitle: kbArticle?.title || 'Policy Guide',
  };
}

/**
 * Calculate queue position and busy status for State 10 (No One Free)
 */
function getQueueStatus(department, priority, tier = 'L1', employees = [], openTickets = []) {
  const MAX_LOAD = { L1: 6, L2: 8, L3: 10 };
  const maxCap = MAX_LOAD[tier] || 6;

  // Filter employees for this department and tier
  const tierEmps = employees.filter(e => e.department === department && e.tier === tier);
  const onlineEmps = tierEmps.filter(e => e.status === 'online');
  const availableEmps = onlineEmps.filter(e => (e.current_load || 0) < maxCap);

  // Department open tickets ahead of this one
  const deptTickets = openTickets.filter(t => t.department === department && t.status !== 'resolved');
  const queuePosition = deptTickets.length + 1;

  // Busy if no available agents or queue has accumulated
  const isBusy = availableEmps.length === 0 || queuePosition > 1;

  return {
    isBusy,
    queuePosition,
    totalQueued: deptTickets.length,
    availableAgents: availableEmps.length,
    onlineAgents: onlineEmps.length,
  };
}

/**
 * Format State 10 Busy Queue Card per Part 1 copy spec:
 * "Everyone at this level is busy. You're 3rd in line, about 20 to 30 min."
 */
function buildBusyQueueCard(queuePosition, etaLowMin, etaHighMin) {
  const suffix = (n) => {
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    return `${n}th`;
  };

  const posStr = suffix(queuePosition);
  const copy = `Everyone at this level is busy. You're ${posStr} in line, about ${etaLowMin} to ${etaHighMin} min.`;

  return {
    state: 10,
    type: 'no_one_free',
    queuePosition,
    etaLowMin,
    etaHighMin,
    copy,
  };
}

module.exports = {
  isBusinessHours,
  buildOffHoursCard,
  getQueueStatus,
  buildBusyQueueCard,
};
