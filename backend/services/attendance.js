// Attendance and Door Swipe Simulation Service
// Data Classification: SENSITIVE
const { v4: uuidv4 } = require('uuid');

const DATA_CLASSIFICATION = 'SENSITIVE';

// In-memory door swipe event log
// Fields: id, card_id, employee_id, door_id, building, floor, direction ('in' | 'out'), timestamp
const doorSwipeEvents = [];

// Track active/deactivated badge status (hook for Item 22 Lost ID Card)
const idCardRegistry = new Map();

function getCardStatus(cardId) {
  return idCardRegistry.get(cardId) || 'active';
}

function setCardStatus(cardId, status) {
  idCardRegistry.set(cardId, status);
}

function simulateSwipe({ employeeId, cardId, doorId, building = 'Campus', floor = 1, direction = 'in', timestamp = null }) {
  const effectiveCardId = cardId || `card-${employeeId}`;
  const cardStatus = getCardStatus(effectiveCardId);

  if (cardStatus === 'deactivated') {
    const err = new Error('ID card has been deactivated due to security report');
    err.code = 'card_deactivated';
    err.status = 403;
    throw err;
  }

  const event = {
    id: `swipe-${uuidv4().slice(0, 8)}`,
    card_id: effectiveCardId,
    employee_id: employeeId,
    door_id: doorId || 'turnstile-main-01',
    building,
    floor: Number(floor) || 1,
    direction: direction === 'out' ? 'out' : 'in',
    timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
  };

  doorSwipeEvents.push(event);
  return event;
}

function getEmployeeSwipes(employeeId, dateStr = null) {
  return doorSwipeEvents.filter(e => {
    if (e.employee_id !== employeeId) return false;
    if (dateStr) {
      const eventDate = e.timestamp.split('T')[0];
      return eventDate === dateStr;
    }
    return true;
  });
}

function deriveAttendanceForDate(employeeId, dateStr) {
  const swipes = getEmployeeSwipes(employeeId, dateStr);
  const inSwipes = swipes.filter(s => s.direction === 'in').sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const outSwipes = swipes.filter(s => s.direction === 'out').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const firstIn = inSwipes.length ? inSwipes[0].timestamp : null;
  const lastOut = outSwipes.length ? outSwipes[0].timestamp : null;

  let totalHours = 0;
  if (firstIn && lastOut) {
    const diffMs = new Date(lastOut) - new Date(firstIn);
    totalHours = Math.max(0, Number((diffMs / 3600000).toFixed(2)));
  }

  let status = 'absent';
  if (firstIn) {
    status = 'present';
    if (lastOut && totalHours > 0.5 && totalHours < 4) {
      status = 'half_day';
    }
  }

  return {
    date: dateStr,
    employee_id: employeeId,
    status,
    first_swipe_in: firstIn,
    last_swipe_out: lastOut,
    total_hours: totalHours,
    swipe_count: swipes.length,
    swipes,
  };
}

function getEmployeeAttendanceHistory(employeeId, days = 7) {
  const records = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];
    records.push(deriveAttendanceForDate(employeeId, dateStr));
  }
  return records;
}

module.exports = {
  DATA_CLASSIFICATION,
  doorSwipeEvents,
  idCardRegistry,
  getCardStatus,
  setCardStatus,
  simulateSwipe,
  getEmployeeSwipes,
  deriveAttendanceForDate,
  getEmployeeAttendanceHistory,
};
