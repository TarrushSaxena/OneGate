// ============================================================
// ANNOUNCEMENTS, SERVICE CATALOG, ONBOARDING & SURVEYS DATA
// Company-wide notifications, service items, checklists, pulses
// ============================================================

const { v4: uuidv4 } = require('uuid');

// ─── Announcements ──────────────────────────────────────────
const announcements = [
  { id: 'ann-001', title: 'VPN Maintenance Window — Oct 4, 10 PM–2 AM', body: 'GlobalProtect VPN will undergo scheduled maintenance on Saturday, Oct 4 from 10:00 PM to 2:00 AM IST. Remote access will be unavailable during this period. Please plan accordingly. Local office network will not be affected.', department: 'IT', priority: 'high', pinned: true, created_by: 'IT Operations Lead', created_at: '2026-09-28T10:00:00Z', expires_at: '2026-10-05T02:00:00Z', read_by: ['u1', 'u3'] },
  { id: 'ann-002', title: 'Open Enrollment for 2027 Benefits Starts Nov 1', body: 'Annual benefits open enrollment begins November 1 and closes November 30. Review your health, dental, vision, and 401k options in Workday. HR will host an info session on Nov 1 at 11 AM (Virtual — Teams). Changes take effect January 1, 2027.', department: 'HR', priority: 'medium', pinned: true, created_by: 'HR Operations Lead', created_at: '2026-09-27T09:00:00Z', expires_at: '2026-12-01T00:00:00Z', read_by: ['u2'] },
  { id: 'ann-003', title: 'New Expense Report Deadline Policy', body: 'Effective October 1, all expense reports must be submitted within 15 business days of the transaction (previously 30 days). Reports submitted late will require VP approval. This change aligns with our Q4 close process. Contact Finance for questions.', department: 'Finance', priority: 'medium', pinned: false, created_by: 'Pradeep Singhania', created_at: '2026-09-26T14:00:00Z', expires_at: null, read_by: [] },
  { id: 'ann-004', title: 'Diwali Office Celebration — Oct 30', body: 'Join us for the annual Diwali celebration on October 30 at 4 PM in the Floor 2 Cafeteria. Rangoli, sweets, team activities, and a surprise gift for everyone. Bring your festive spirit! 🪔', department: 'All', priority: 'low', pinned: false, created_by: 'Kavita Reddy', created_at: '2026-09-25T11:00:00Z', expires_at: '2026-10-31T00:00:00Z', read_by: ['u1', 'u2', 'u3'] },
  { id: 'ann-005', title: 'Phishing Alert — Fake Payroll Emails Circulating', body: 'URGENT: We have detected a phishing campaign targeting employees with fake payroll verification emails. These emails appear to come from payroll@company-hr.com (note: our real domain is company.com). Do NOT click any links. Report suspicious emails using the Report Phishing button in Outlook. If you already clicked, disconnect from network and call IT immediately (ext. 4911).', department: 'Cybersecurity', priority: 'critical', pinned: true, created_by: 'Anand Krishnan', created_at: '2026-09-29T08:00:00Z', expires_at: null, read_by: ['u1'] },
  { id: 'ann-006', title: 'Parking Garage Level 3 Closed for Resurfacing', body: 'Parking garage Level 3 will be closed from Oct 6–10 for resurfacing. Please use Levels 1, 2, or 4 during this period. Overflow parking is available at the adjacent building with shuttle service running every 15 minutes.', department: 'Facilities', priority: 'medium', pinned: false, created_by: 'Facilities Operations Lead', created_at: '2026-09-28T15:00:00Z', expires_at: '2026-10-11T00:00:00Z', read_by: [] },
  { id: 'ann-007', title: 'Q3 All-Hands Meeting — Oct 5 at 10 AM', body: 'The quarterly all-hands meeting is scheduled for October 5 at 10:00 AM in the Training Lab (Floor 5). CEO Vikram Mehta will present company performance, product roadmap updates, and take live Q&A. Remote employees can join via the Teams link sent to your calendar.', department: 'All', priority: 'medium', pinned: true, created_by: 'Vikram Mehta', created_at: '2026-09-29T06:00:00Z', expires_at: '2026-10-06T00:00:00Z', read_by: [] },
];

// ─── Service Catalog ────────────────────────────────────────
const serviceCatalog = [
  // IT Services
  { id: 'cat-001', category: 'IT',         name: 'New Laptop Request',           description: 'Request a new laptop. Standard: Dell Latitude (Windows) or MacBook Pro 14" (macOS). Engineering roles qualify for Apple Silicon models.',                                   approval_required: true,  approver_role: 'manager', sla_days: 10, icon: '💻' },
  { id: 'cat-002', category: 'IT',         name: 'Monitor / Display Request',    description: 'Request an additional monitor or replacement. Standard: Dell UltraSharp 27". Dual-monitor setups available for design and engineering.',                                     approval_required: true,  approver_role: 'manager', sla_days: 7,  icon: '🖥️' },
  { id: 'cat-003', category: 'IT',         name: 'Software License Request',     description: 'Request access to licensed software (Adobe CC, JetBrains, Tableau, etc.). Include business justification. Security review required for new tools.',                            approval_required: true,  approver_role: 'manager', sla_days: 5,  icon: '📦' },
  { id: 'cat-004', category: 'IT',         name: 'Password / Account Reset',     description: 'Reset your SSO password or unlock a locked account. Self-service available at reset.company.com. Use this form if self-service fails.',                                         approval_required: false, approver_role: null,      sla_days: 0.5, icon: '🔑' },
  { id: 'cat-005', category: 'IT',         name: 'VPN Access Setup',             description: 'Set up or troubleshoot VPN access (GlobalProtect). Required for all remote work. Include your device type and OS version.',                                                      approval_required: false, approver_role: null,      sla_days: 1,  icon: '🔒' },
  { id: 'cat-006', category: 'IT',         name: 'Email Distribution List',      description: 'Create or modify a shared mailbox or email distribution list. Include list name, members, and purpose.',                                                                         approval_required: true,  approver_role: 'manager', sla_days: 3,  icon: '📧' },
  { id: 'cat-007', category: 'IT',         name: 'Peripheral Equipment',         description: 'Request keyboard, mouse, webcam, headset, or docking station. Standard peripherals are self-service from the office supply room (Floor 1).',                                     approval_required: false, approver_role: null,      sla_days: 2,  icon: '🎧' },

  // HR Services
  { id: 'cat-010', category: 'HR',         name: 'PTO / Leave Request',          description: 'Submit a leave request (PTO, sick, bereavement, comp-off). PTO requires 2 weeks advance notice. Sick leave must be logged the same day.',                                       approval_required: true,  approver_role: 'manager', sla_days: 2,  icon: '🏖️' },
  { id: 'cat-011', category: 'HR',         name: 'Benefits Change Request',      description: 'Update health, dental, vision, or 401k elections. Life event changes allowed within 30 days of the event. Open enrollment: November.',                                          approval_required: false, approver_role: null,      sla_days: 5,  icon: '🏥' },
  { id: 'cat-012', category: 'HR',         name: 'Personal Information Update',  description: 'Update your address, phone number, emergency contacts, or direct deposit in Workday. Changes reflect within 2 business days.',                                                   approval_required: false, approver_role: null,      sla_days: 2,  icon: '📝' },
  { id: 'cat-013', category: 'HR',         name: 'Letter Request (Employment)',  description: 'Request an employment verification letter, visa sponsorship letter, or salary certificate. Specify the purpose and recipient.',                                                   approval_required: false, approver_role: null,      sla_days: 3,  icon: '📄' },
  { id: 'cat-014', category: 'HR',         name: 'Training / Course Enrollment', description: 'Enroll in company-sponsored training, certification, or conference. Include cost, dates, and business justification. Budget approval required if > ₹50,000.',                   approval_required: true,  approver_role: 'manager', sla_days: 5,  icon: '🎓' },
  { id: 'cat-015', category: 'HR',         name: 'Report Workplace Concern',     description: 'Report harassment, discrimination, ethics violation, or workplace safety concern. Reports can be anonymous. HR investigates within 5 business days.',                           approval_required: false, approver_role: null,      sla_days: 1,  icon: '🛡️' },

  // Finance Services
  { id: 'cat-020', category: 'Finance',    name: 'Expense Report Submission',    description: 'Submit an expense report with receipts. Submit within 15 business days. Approval limits: manager (<₹40K), Director (₹40K–₹1.5L), VP (₹1.5L–₹8L), CFO (>₹8L).',              approval_required: true,  approver_role: 'manager', sla_days: 5,  icon: '🧾' },
  { id: 'cat-021', category: 'Finance',    name: 'Corporate Card Request',       description: 'Request an Amex corporate card. Eligibility: employees who travel 4+ times/year or manage vendor relationships. Requires Director approval.',                                   approval_required: true,  approver_role: 'director', sla_days: 7, icon: '💳' },
  { id: 'cat-022', category: 'Finance',    name: 'Purchase Order / Procurement', description: 'Submit a purchase order for goods or services >₹40K. Use Coupa for standard procurement. Include 3 vendor quotes for purchases >₹2L.',                                         approval_required: true,  approver_role: 'manager', sla_days: 5,  icon: '📋' },
  { id: 'cat-023', category: 'Finance',    name: 'Travel Request & Pre-Approval', description: 'Submit a travel pre-approval for business trips. Include destination, dates, estimated cost, and business purpose. Book via Concur after approval.',                             approval_required: true,  approver_role: 'manager', sla_days: 3,  icon: '✈️' },
  { id: 'cat-024', category: 'Finance',    name: 'Invoice Query / Dispute',      description: 'Report a billing discrepancy, late vendor payment, or invoice dispute. Include invoice number, vendor name, and amount.',                                                        approval_required: false, approver_role: null,      sla_days: 3,  icon: '📊' },

  // Facilities Services
  { id: 'cat-030', category: 'Facilities', name: 'Meeting Room Booking',         description: 'Book a meeting room via Teams or Robin app. Rooms available on Floors 2–4. AV rooms have projectors and webcams. Max 4-hour booking unless approved.',                        approval_required: false, approver_role: null,      sla_days: 0,  icon: '🏢' },
  { id: 'cat-031', category: 'Facilities', name: 'Desk / Workspace Booking',     description: 'Reserve a hot desk via Robin app. Quiet zones on Floors 3–5. Collaboration zones on Floor 2. Check in by 10 AM or desk is auto-released.',                                     approval_required: false, approver_role: null,      sla_days: 0,  icon: '🪑' },
  { id: 'cat-032', category: 'Facilities', name: 'Badge Replacement / Access',   description: 'Report a lost or damaged building access badge. Temporary badge issued same-day at Security Desk (Lobby A). Permanent replacement: 2 business days.',                           approval_required: false, approver_role: null,      sla_days: 2,  icon: '🪪' },
  { id: 'cat-033', category: 'Facilities', name: 'Maintenance / Repair Request', description: 'Report broken furniture, HVAC issues, lighting problems, plumbing, or cleaning needs. Include floor, room number, and description. Emergency: call ext. 5555.',                 approval_required: false, approver_role: null,      sla_days: 2,  icon: '🔧' },
  { id: 'cat-034', category: 'Facilities', name: 'Parking Permit',               description: 'Apply for a monthly parking permit (₹11,250/month via payroll deduction). EV charging stations on Level 2 — max 4h per session.',                                                approval_required: false, approver_role: null,      sla_days: 3,  icon: '🅿️' },
  { id: 'cat-035', category: 'Facilities', name: 'Visitor / Guest Registration', description: 'Register a visitor for badge access. Submit at least 24h before visit. Include visitor name, company, date, time, and host employee name.',                                      approval_required: false, approver_role: null,      sla_days: 1,  icon: '🧑‍🤝‍🧑' },
  { id: 'cat-036', category: 'Facilities', name: 'Event / Catering Request',     description: 'Request catering or event setup for meetings, team lunches, or celebrations. Minimum 48h notice. Include headcount, dietary preferences, and budget.',                          approval_required: true,  approver_role: 'manager', sla_days: 3,  icon: '🍽️' },
];

// ─── Onboarding Checklists ──────────────────────────────────
const onboardingTemplates = {
  day1: [
    { id: 'ob-001', task: 'Pick up laptop and badge from IT desk (Floor 5)',        owner: 'IT',         due: 'Day 1' },
    { id: 'ob-002', task: 'Attend HR orientation at 9:00 AM',                       owner: 'HR',         due: 'Day 1' },
    { id: 'ob-003', task: 'Verify I-9 documents with HR',                           owner: 'HR',         due: 'Day 1' },
    { id: 'ob-004', task: 'Set up SSO password and MFA (myaccount.company.com)',     owner: 'IT',         due: 'Day 1' },
    { id: 'ob-005', task: 'Download and test VPN (GlobalProtect)',                   owner: 'IT',         due: 'Day 1' },
    { id: 'ob-006', task: 'Join Slack workspace and introduce yourself in #general', owner: 'Employee',   due: 'Day 1' },
  ],
  week1: [
    { id: 'ob-010', task: 'Complete Security Awareness Training (Workday Learning)', owner: 'Employee',   due: 'Week 1' },
    { id: 'ob-011', task: 'Complete Harassment Prevention Training',                 owner: 'Employee',   due: 'Week 1' },
    { id: 'ob-012', task: 'Review Code of Conduct and sign acknowledgment',         owner: 'Employee',   due: 'Week 1' },
    { id: 'ob-013', task: 'Meet your assigned buddy',                                owner: 'Employee',   due: 'Week 1' },
    { id: 'ob-014', task: 'Set up benefits enrollment in Workday',                   owner: 'HR',         due: 'Week 1' },
    { id: 'ob-015', task: 'Schedule 1:1 with your manager',                          owner: 'Employee',   due: 'Week 1' },
    { id: 'ob-016', task: 'Set up direct deposit in Workday > Pay',                  owner: 'Employee',   due: 'Week 1' },
  ],
  day30: [
    { id: 'ob-020', task: '30-day check-in with manager',                            owner: 'Manager',    due: 'Day 30' },
    { id: 'ob-021', task: 'Complete department-specific training modules',            owner: 'Employee',   due: 'Day 30' },
    { id: 'ob-022', task: 'Get access to all department-specific tools',             owner: 'IT',         due: 'Day 30' },
    { id: 'ob-023', task: 'Submit first feedback via pulse survey',                  owner: 'Employee',   due: 'Day 30' },
  ],
  day60: [
    { id: 'ob-030', task: '60-day performance check-in with manager',                owner: 'Manager',    due: 'Day 60' },
    { id: 'ob-031', task: 'Join a cross-functional project or working group',        owner: 'Employee',   due: 'Day 60' },
  ],
  day90: [
    { id: 'ob-040', task: '90-day probation review with manager + HRBP',             owner: 'Manager',    due: 'Day 90' },
    { id: 'ob-041', task: 'Complete buddy program feedback survey',                  owner: 'Employee',   due: 'Day 90' },
    { id: 'ob-042', task: 'Set goals for the next quarter in Lattice',               owner: 'Employee',   due: 'Day 90' },
  ],
};

// Active onboarding instances
const activeOnboarding = [
  {
    user_id: 'u1', name: 'Naveen Kulkarni', start_date: '2026-06-01', department: 'Engineering',
    buddy: 'Sahil Mehta', manager: 'Ankita Verma',
    tasks: [
      ...onboardingTemplates.day1.map(t => ({ ...t, completed: true, completed_date: '2026-06-01' })),
      ...onboardingTemplates.week1.map(t => ({ ...t, completed: true, completed_date: '2026-06-05' })),
      ...onboardingTemplates.day30.map(t => ({ ...t, completed: true, completed_date: '2026-06-30' })),
      ...onboardingTemplates.day60.map(t => ({ ...t, completed: true, completed_date: '2026-07-30' })),
      ...onboardingTemplates.day90.map(t => ({ ...t, completed: true, completed_date: '2026-08-29' })),
    ],
    status: 'completed',
  },
  {
    user_id: 'new-hire-1', name: 'Priya Desai', start_date: '2026-09-22', department: 'Marketing',
    buddy: 'Nikhil Gupta', manager: 'Ritika Bose',
    tasks: [
      ...onboardingTemplates.day1.map(t => ({ ...t, completed: true, completed_date: '2026-09-22' })),
      ...onboardingTemplates.week1.map((t, i) => ({ ...t, completed: i < 4, completed_date: i < 4 ? '2026-09-26' : null })),
      ...onboardingTemplates.day30.map(t => ({ ...t, completed: false, completed_date: null })),
      ...onboardingTemplates.day60.map(t => ({ ...t, completed: false, completed_date: null })),
      ...onboardingTemplates.day90.map(t => ({ ...t, completed: false, completed_date: null })),
    ],
    status: 'in_progress',
  },
];

// ─── Pulse Surveys ──────────────────────────────────────────
const pulseSurveys = [
  {
    id: 'ps-001', title: 'Weekly Pulse — Sep 29', status: 'active',
    start_date: '2026-09-29', end_date: '2026-10-03',
    questions: [
      { id: 'q1', text: 'How are you feeling about your workload this week?', type: 'scale', scale: [1, 5] },
      { id: 'q2', text: 'Do you have the tools and resources you need to do your job?', type: 'scale', scale: [1, 5] },
      { id: 'q3', text: 'How connected do you feel to your team?', type: 'scale', scale: [1, 5] },
      { id: 'q4', text: 'Any feedback or concerns? (optional)', type: 'text' },
    ],
    responses: [
      { user_id: 'u1', answers: { q1: 4, q2: 5, q3: 4, q4: '' }, submitted_at: '2026-09-29T10:15:00Z' },
      { user_id: 'u3', answers: { q1: 3, q2: 4, q3: 3, q4: 'Would appreciate more cross-team meetings' }, submitted_at: '2026-09-29T11:30:00Z' },
    ],
    anonymous: true,
  },
  {
    id: 'ps-002', title: 'Monthly Engagement — September', status: 'closed',
    start_date: '2026-09-01', end_date: '2026-09-07',
    questions: [
      { id: 'q1', text: 'I am proud to work at this company.', type: 'scale', scale: [1, 5] },
      { id: 'q2', text: 'I feel my contributions are recognized.', type: 'scale', scale: [1, 5] },
      { id: 'q3', text: 'I see a clear path for career growth here.', type: 'scale', scale: [1, 5] },
      { id: 'q4', text: 'My manager provides useful feedback.', type: 'scale', scale: [1, 5] },
      { id: 'q5', text: 'I would recommend this company as a great place to work.', type: 'nps', scale: [0, 10] },
    ],
    responses: [
      { user_id: 'u1', answers: { q1: 5, q2: 4, q3: 4, q4: 4, q5: 9 }, submitted_at: '2026-09-02T08:00:00Z' },
      { user_id: 'u2', answers: { q1: 4, q2: 3, q3: 3, q4: 3, q5: 7 }, submitted_at: '2026-09-02T09:15:00Z' },
      { user_id: 'u3', answers: { q1: 4, q2: 4, q3: 4, q4: 5, q5: 8 }, submitted_at: '2026-09-03T14:00:00Z' },
      { user_id: 'u4', answers: { q1: 3, q2: 2, q3: 2, q4: 3, q5: 5 }, submitted_at: '2026-09-04T16:30:00Z' },
      { user_id: 'u5', answers: { q1: 5, q2: 5, q3: 4, q4: 4, q5: 9 }, submitted_at: '2026-09-03T10:00:00Z' },
    ],
    anonymous: true,
  },
];

// ─── System Status ──────────────────────────────────────────
const systemStatus = [
  { id: 'sys-001', service: 'Email (Microsoft 365)',     status: 'operational',   last_checked: '2026-09-29T17:00:00Z', uptime_30d: 99.97 },
  { id: 'sys-002', service: 'VPN (GlobalProtect)',       status: 'operational',   last_checked: '2026-09-29T17:00:00Z', uptime_30d: 99.82 },
  { id: 'sys-003', service: 'Slack',                     status: 'operational',   last_checked: '2026-09-29T17:00:00Z', uptime_30d: 99.99 },
  { id: 'sys-004', service: 'Zoom',                      status: 'operational',   last_checked: '2026-09-29T17:00:00Z', uptime_30d: 99.95 },
  { id: 'sys-005', service: 'Jira / Confluence',         status: 'operational',   last_checked: '2026-09-29T17:00:00Z', uptime_30d: 99.90 },
  { id: 'sys-006', service: 'GitHub Enterprise',         status: 'operational',   last_checked: '2026-09-29T17:00:00Z', uptime_30d: 99.98 },
  { id: 'sys-007', service: 'Workday (HR)',              status: 'operational',   last_checked: '2026-09-29T17:00:00Z', uptime_30d: 99.85 },
  { id: 'sys-008', service: 'Concur (Expenses)',         status: 'operational',   last_checked: '2026-09-29T17:00:00Z', uptime_30d: 99.91 },
  { id: 'sys-009', service: 'Building Access (Badges)',  status: 'operational',   last_checked: '2026-09-29T17:00:00Z', uptime_30d: 99.99 },
  { id: 'sys-010', service: 'Corporate Wi-Fi',           status: 'operational',   last_checked: '2026-09-29T17:00:00Z', uptime_30d: 99.72 },
  { id: 'sys-011', service: 'Coupa (Procurement)',       status: 'degraded',      last_checked: '2026-09-29T17:00:00Z', uptime_30d: 98.50, incident: 'Slow response times — vendor investigating' },
  { id: 'sys-012', service: 'Robin (Room Booking)',      status: 'operational',   last_checked: '2026-09-29T17:00:00Z', uptime_30d: 99.88 },
];

// ─── Incident History ───────────────────────────────────────
const incidentHistory = [
  { id: 'inc-001', service: 'VPN (GlobalProtect)', severity: 'major', title: 'VPN Outage — All Remote Users', start_time: '2026-09-15T14:30:00Z', end_time: '2026-09-15T16:45:00Z', duration_min: 135, root_cause: 'Certificate expiration on authentication gateway', status: 'resolved', updates: ['14:30 — Investigating VPN connection failures', '15:00 — Identified certificate expiry', '15:30 — Certificate renewed, propagation in progress', '16:45 — All VPN connections restored'] },
  { id: 'inc-002', service: 'Email (Microsoft 365)', severity: 'minor', title: 'Email Delivery Delays', start_time: '2026-09-20T09:00:00Z', end_time: '2026-09-20T11:30:00Z', duration_min: 150, root_cause: 'Microsoft Exchange Online service degradation', status: 'resolved', updates: ['09:00 — Reports of delayed email delivery', '09:30 — Confirmed Microsoft service issue', '11:30 — Microsoft resolved, all emails delivered'] },
  { id: 'inc-003', service: 'Coupa (Procurement)', severity: 'minor', title: 'Slow Response Times on Coupa', start_time: '2026-09-29T10:00:00Z', end_time: null, duration_min: null, root_cause: 'Vendor database maintenance', status: 'investigating', updates: ['10:00 — Users reporting slow load times', '12:00 — Confirmed vendor-side maintenance', '15:00 — Vendor ETA: resolved by end of day'] },
];

// ─── Approval Queue ─────────────────────────────────────────
const approvalQueue = [
  { id: 'apv-001', type: 'leave',     requester_id: 'u1', requester_name: 'Tanya Mehra',    item: '2 days PTO (Oct 14–15)',         approver_id: 'mgr-it',  approver_name: 'Devendra Sethi', status: 'pending',  submitted_at: '2026-09-25T10:00:00Z', decided_at: null,  notes: '' },
  { id: 'apv-002', type: 'leave',     requester_id: 'u3', requester_name: 'Rohan Verma',    item: '3 days PTO (Oct 20–24)',         approver_id: 'mgr-fin', approver_name: 'Pradeep Singhania', status: 'pending',  submitted_at: '2026-09-22T14:00:00Z', decided_at: null,  notes: '' },
  { id: 'apv-003', type: 'leave',     requester_id: 'u5', requester_name: 'Aditya Nair',    item: '5 days PTO (Nov 1–7)',           approver_id: 'mgr-fin', approver_name: 'Pradeep Singhania', status: 'pending',  submitted_at: '2026-09-20T09:00:00Z', decided_at: null,  notes: '' },
  { id: 'apv-004', type: 'asset',     requester_id: 'u2', requester_name: 'Ananya Iyer',    item: 'Dell UltraSharp 27" Monitor',    approver_id: 'mgr-it',  approver_name: 'Devendra Sethi', status: 'pending',  submitted_at: '2026-09-25T11:00:00Z', decided_at: null,  notes: 'For dual-monitor design work' },
  { id: 'apv-005', type: 'software',  requester_id: 'u5', requester_name: 'Aditya Nair',    item: 'Tableau Desktop License',        approver_id: 'mgr-fin', approver_name: 'Pradeep Singhania', status: 'pending',  submitted_at: '2026-09-27T16:00:00Z', decided_at: null,  notes: 'Quarterly financial data visualization' },
  { id: 'apv-006', type: 'expense',   requester_id: 'u3', requester_name: 'Rohan Verma',    item: '₹4,500 Client Dinner (Sep 18)',  approver_id: 'mgr-fin', approver_name: 'Pradeep Singhania', status: 'approved', submitted_at: '2026-09-19T08:00:00Z', decided_at: '2026-09-20T10:30:00Z', notes: 'Approved — within meal limits' },
  { id: 'apv-007', type: 'travel',    requester_id: 'u2', requester_name: 'Ananya Iyer',    item: 'Mumbai Trip (Oct 8–10) ₹28,000', approver_id: 'mgr-hr',  approver_name: 'Sonal Deshmukh', status: 'approved', submitted_at: '2026-09-15T12:00:00Z', decided_at: '2026-09-16T09:00:00Z', notes: 'Approved — marketing event' },
];

module.exports = {
  announcements, serviceCatalog,
  onboardingTemplates, activeOnboarding,
  pulseSurveys, systemStatus, incidentHistory,
  approvalQueue,
};
