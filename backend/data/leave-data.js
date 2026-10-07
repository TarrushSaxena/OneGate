// ============================================================
// LEAVE / PTO TRACKER DATA
// Balances, accrual rules, requests, team calendar
// ============================================================

// ─── Leave Balances & Requests (Driven by Real Provisioned Accounts) ──
const leaveBalances = [];
const leaveRequests = [];

// ─── Company Holidays ───────────────────────────────────────
const companyHolidays = [
  { date: '2026-01-01', name: 'New Year\'s Day',           type: 'national' },
  { date: '2026-01-14', name: 'Makar Sankranti / Pongal',  type: 'national' },
  { date: '2026-01-26', name: 'Republic Day',              type: 'national' },
  { date: '2026-03-14', name: 'Holi',                      type: 'national' },
  { date: '2026-03-30', name: 'Eid ul-Fitr',               type: 'national' },
  { date: '2026-04-02', name: 'Ram Navami',                type: 'national' },
  { date: '2026-04-14', name: 'Ambedkar Jayanti',          type: 'national' },
  { date: '2026-05-01', name: 'May Day / Labour Day',      type: 'national' },
  { date: '2026-06-06', name: 'Eid ul-Adha (Bakri-Eid)',   type: 'national' },
  { date: '2026-07-06', name: 'Muharram',                  type: 'national' },
  { date: '2026-08-15', name: 'Independence Day',          type: 'national' },
  { date: '2026-08-25', name: 'Janmashtami',               type: 'national' },
  { date: '2026-10-02', name: 'Gandhi Jayanti',            type: 'national' },
  { date: '2026-10-12', name: 'Dussehra',                  type: 'national' },
  { date: '2026-10-31', name: 'Diwali',                    type: 'national' },
  { date: '2026-11-01', name: 'Diwali (Day 2)',            type: 'company' },
  { date: '2026-11-04', name: 'Bhai Dooj',                 type: 'optional' },
  { date: '2026-11-19', name: 'Guru Nanak Jayanti',        type: 'national' },
  { date: '2026-12-25', name: 'Christmas Day',             type: 'national' },
  { date: '2026-12-31', name: 'Company Year-End Closure',  type: 'company' },
];

// ─── Company Events ─────────────────────────────────────────
const companyEvents = [
  { id: 'evt-001', title: 'Q3 All-Hands Meeting',          date: '2026-10-05', time: '10:00', location: 'Training Lab (Floor 5)',   department: 'All',        mandatory: true,  description: 'CEO quarterly update — company performance, roadmap, Q&A.' },
  { id: 'evt-002', title: 'Annual Health Check-Up Camp',    date: '2026-10-10', time: '09:00', location: 'Floor 1 — Wellness Room', department: 'All',        mandatory: false, description: 'Free annual health screening by Apollo Diagnostics.' },
  { id: 'evt-003', title: 'Security Awareness Training',    date: '2026-10-15', time: '14:00', location: 'Virtual (Zoom)',           department: 'All',        mandatory: true,  description: 'Annual cybersecurity training — phishing, MFA, incident response.' },
  { id: 'evt-004', title: 'Hackathon 2026',                 date: '2026-11-15', time: '09:00', location: 'Floor 2 — Collaboration',  department: 'Engineering',mandatory: false, description: '48-hour internal hackathon. Theme: AI-powered enterprise tools.' },
  { id: 'evt-005', title: 'Open Enrollment Kickoff',        date: '2026-11-01', time: '11:00', location: 'Virtual (Teams)',           department: 'HR',         mandatory: false, description: 'Benefits open enrollment info session. Review 2027 plan options.' },
  { id: 'evt-006', title: 'Diwali Office Celebration',      date: '2026-10-30', time: '16:00', location: 'Floor 2 — Cafeteria',      department: 'All',        mandatory: false, description: 'Rangoli, snacks, and team activities to celebrate Diwali.' },
  { id: 'evt-007', title: 'Monthly Town Hall',              date: '2026-10-28', time: '15:00', location: 'Makalu (Floor 3)',          department: 'All',        mandatory: false, description: 'Open forum with leadership. Bring your questions.' },
  { id: 'evt-008', title: 'Fire Drill & Evacuation Exercise', date: '2026-10-20', time: '11:00', location: 'All Floors',           department: 'Facilities', mandatory: true,  description: 'Quarterly fire evacuation drill. All employees must participate.' },
];

// ─── Accrual Rules ──────────────────────────────────────────
const accrualRules = {
  pto: [
    { min_tenure: 0, max_tenure: 2, days_per_year: 15 },
    { min_tenure: 2, max_tenure: 5, days_per_year: 20 },
    { min_tenure: 5, max_tenure: 99, days_per_year: 25 },
  ],
  sick: { days_per_year: 10, rollover: false },
  bereavement: { immediate_family: 3, extended_family: 1 },
  comp_off: { earned_per_extra_day: 1 },
  max_rollover: 5,
};

function getLeaveBalance(userId) {
  const existing = leaveBalances.find(b => b.user_id === userId);
  if (existing) return existing;

  try {
    const accountStore = require('../auth/accountStore');
    const acct = accountStore.findById(userId);
    if (!acct) return null;

    const userLeaves = leaveRequests.filter(r => r.user_id === userId);
    const ptoUsed = userLeaves.filter(r => r.status === 'approved' && (r.type === 'pto' || r.type === 'vacation')).reduce((sum, r) => sum + (r.days || 1), 0);
    const ptoPending = userLeaves.filter(r => r.status === 'pending' && (r.type === 'pto' || r.type === 'vacation')).reduce((sum, r) => sum + (r.days || 1), 0);
    const sickUsed = userLeaves.filter(r => r.status === 'approved' && r.type === 'sick').reduce((sum, r) => sum + (r.days || 1), 0);

    return {
      user_id: userId,
      name: acct.name,
      tenure_years: 2.0,
      pto_total: 18,
      pto_used: ptoUsed,
      pto_pending: ptoPending,
      sick_total: 10,
      sick_used: sickUsed,
      bereavement_used: 0,
      comp_off: 0,
    };
  } catch (_) {
    return null;
  }
}

function getUpcomingHolidays(count = 5) {
  const today = new Date().toISOString().slice(0, 10);
  return companyHolidays.filter(h => h.date >= today).slice(0, count);
}

function getUpcomingEvents(count = 5, department = null) {
  const today = new Date().toISOString().slice(0, 10);
  return companyEvents
    .filter(e => e.date >= today && (!department || e.department === 'All' || e.department === department))
    .slice(0, count);
}

module.exports = {
  leaveBalances, leaveRequests,
  companyHolidays, companyEvents,
  accrualRules,
  getLeaveBalance, getUpcomingHolidays, getUpcomingEvents,
};
