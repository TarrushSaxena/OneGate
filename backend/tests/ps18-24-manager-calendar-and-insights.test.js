const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, fetchApi } = require('./helpers/harness');

test('PS18-24: Department Calendar — October 2026 days, holidays, events, and staff leaves', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const mgr = await accountStore.createAccount({
    email: 'cal.it.mgr@company.com',
    name: 'IT Calendar Lead',
    role: 'department_manager',
    department: 'IT',
    password: 'ManagerPowersPass#2026',
    active: true,
  });
  const token = tokens.signToken(mgr);

  const res = await fetchApi('/api/manager/calendar?month=2026-10', {
    method: 'GET',
    token,
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.month, '2026-10');
  assert.strictEqual(res.data.daysInMonth, 31);
  assert.strictEqual(res.data.days.length, 31);

  // Check Oct 2 (Gandhi Jayanti holiday)
  const day2 = res.data.days.find(d => d.dayNumber === 2);
  assert.ok(day2);
  assert.strictEqual(day2.attendanceStatus, 'holiday');
  assert.strictEqual(day2.holiday.name, "Gandhi Jayanti");

  // Check Oct 5 (Q3 All-Hands Meeting event)
  const day5 = res.data.days.find(d => d.dayNumber === 5);
  assert.ok(day5);
  assert.ok(day5.events.some(e => e.title.includes('All-Hands')));
});

test('PS18-24: Leave Approvals Queue — Pending requests view and manager approve/deny action', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');
  const { leaveRequests } = require('../data/leave-data');

  const mgr = accountStore.findByEmail('cal.it.mgr@company.com');
  const token = tokens.signToken(mgr);

  // Create staff and pending leave
  const staff = await accountStore.createAccount({
    email: 'rohan.leave.test@company.com',
    name: 'Rohan Leave Test',
    role: 'support_executive',
    department: 'IT',
    tier: 'L2',
    password: 'SecureStaffPass#2026',
    active: true,
  });

  const testLeaveId = 'lr-test-' + Date.now();
  leaveRequests.push({
    id: testLeaveId,
    user_id: staff.id,
    name: staff.name,
    type: 'pto',
    start_date: '2026-10-18',
    end_date: '2026-10-20',
    days: 3,
    reason: 'Family event in Pune',
    status: 'pending',
    requested_date: '2026-10-01',
    approved_by: null,
  });

  // Query pending requests
  const listRes = await fetchApi('/api/manager/leave-requests', {
    method: 'GET',
    token,
  });
  assert.strictEqual(listRes.status, 200);
  assert.ok(listRes.data.some(r => r.id === testLeaveId));

  // Approve leave
  const approveRes = await fetchApi(`/api/manager/leave-requests/${testLeaveId}`, {
    method: 'PATCH',
    token,
    body: { action: 'approve', notes: 'Approved for family event' },
  });
  assert.strictEqual(approveRes.status, 200);
  assert.strictEqual(approveRes.data.request.status, 'approved');
  assert.ok(approveRes.data.balance.used >= 3);
});

test('PS18-24: Expanded Staff Profile — Tenure, leave balance, currently handling, and onboarding', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const mgr = accountStore.findByEmail('cal.it.mgr@company.com');
  const token = tokens.signToken(mgr);

  const priya = await accountStore.createAccount({
    email: 'priya.sharma.profile@company.com',
    name: 'Priya Sharma',
    role: 'support_executive',
    department: 'IT',
    tier: 'L3',
    joined_at: '2024-03-11T09:00:00Z',
    password: 'SecureStaffPass#2026',
    active: true,
  });

  const res = await fetchApi(`/api/manager/staff/${priya.id}/profile`, {
    method: 'GET',
    token,
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.name, 'Priya Sharma');
  assert.strictEqual(res.data.role_label, 'Support staff');
  assert.strictEqual(res.data.tier_display, 'L3 senior lead');
  assert.strictEqual(res.data.joined_display, 'Mar 11, 2024');
  assert.ok(res.data.tenure_display.includes('yr'), 'Tenure calculates years dynamically');
  assert.ok(res.data.leave_balance.display.includes('18 days remaining') || res.data.leave_balance.total === 18);
  assert.ok(Array.isArray(res.data.onboarding_checklist), 'Onboarding checklist included');
  assert.ok(Array.isArray(res.data.cross_training_depts), 'Cross training departments included');
});

test('PS18-24: Work Mode Policy & Workload Balance — Toggle Office/WFH and view team capacity', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const mgr = accountStore.findByEmail('cal.it.mgr@company.com');
  const token = tokens.signToken(mgr);
  const priya = accountStore.findByEmail('priya.sharma.profile@company.com');

  // Toggle to remote_wfh
  const wfhRes = await fetchApi(`/api/manager/staff/${priya.id}/work-mode`, {
    method: 'PATCH',
    token,
    body: { work_mode: 'remote_wfh' },
  });
  assert.strictEqual(wfhRes.status, 200);
  assert.strictEqual(wfhRes.data.staff.work_mode, 'remote_wfh');

  // Query workload balancing view
  const loadRes = await fetchApi('/api/manager/workload', {
    method: 'GET',
    token,
  });
  assert.strictEqual(loadRes.status, 200);
  assert.strictEqual(loadRes.data.department, 'IT');
  assert.strictEqual(loadRes.data.max_capacity_per_agent, 10);
  assert.ok(Array.isArray(loadRes.data.workload));

  // Query attendance compliance report
  const compRes = await fetchApi('/api/manager/attendance-compliance', {
    method: 'GET',
    token,
  });
  assert.strictEqual(compRes.status, 200);
  assert.ok(typeof compRes.data.compliance_rate === 'number');

  // Query active assignments ("Who's handling what right now")
  const activeRes = await fetchApi('/api/manager/active-assignments', {
    method: 'GET',
    token,
  });
  assert.strictEqual(activeRes.status, 200);
  assert.ok(Array.isArray(activeRes.data.assignments));
});

test('PS18-24: Truthful Dashboard Stats & Department Health Score', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const mgr = accountStore.findByEmail('cal.it.mgr@company.com');
  const token = tokens.signToken(mgr);

  const res = await fetchApi('/api/manager/department', {
    method: 'GET',
    token,
  });

  assert.strictEqual(res.status, 200);
  assert.ok(res.data.healthScore);
  assert.ok(res.data.healthScore.score >= 0 && res.data.healthScore.score <= 100);
  assert.ok(['Excellent', 'Good', 'Needs Attention'].includes(res.data.healthScore.grade));

  // If no tickets have been resolved/rated, avgCSAT must be null (not hardcoded 4.6)
  if (res.data.resolved === 0) {
    assert.strictEqual(res.data.avgCSAT, null, 'Unrated queue must return null CSAT instead of hardcoded 4.6');
  }
});
