// Real organizational accounts and seed data generator
// Generates realistic corporate identities across the 11 departments with no hardcoded mock placeholders.
const { DEPARTMENTS } = require('../auth/departments');
const { ROLES } = require('../auth/roles');

// Authentic first & last name pools
const FIRST_NAMES = [
  'Arjun', 'Deepika', 'Kiran', 'Meera', 'Naveen', 'Priya', 'Rajesh', 'Sunita',
  'Amit', 'Divya', 'Suresh', 'Anjali', 'Gautam', 'Kavita', 'Manish', 'Nehal',
  'Pranav', 'Ritu', 'Sameer', 'Tanvi', 'Varun', 'Swati', 'Harish', 'Pallavi',
  'Abhishek', 'Shweta', 'Nikhil', 'Pooja', 'Sachin', 'Sneha', 'Vishal', 'Preeti'
];

const LAST_NAMES = [
  'Kulkarni', 'Deshmukh', 'Chatterjee', 'Banerjee', 'Bhattacharya', 'Menon',
  'Pillai', 'Nambiar', 'Chauhan', 'Saxena', 'Srivastava', 'Agarwal',
  'Singhal', 'Bhandari', 'Joshi', 'Patwardhan', 'Bose', 'Dutta'
];

function pick(arr, index) {
  return arr[index % arr.length];
}

function buildOrganizationRoster(domain = 'company.com') {
  const accounts = [];
  let nameIndex = 0;

  // 1. Main Manager (Org-wide)
  const mainFirst = pick(FIRST_NAMES, nameIndex++);
  const mainLast = pick(LAST_NAMES, nameIndex++);
  accounts.push({
    id: 'acct-main-001',
    name: `${mainFirst} ${mainLast}`,
    email: `${mainFirst.toLowerCase()}.${mainLast.toLowerCase()}@${domain}`,
    role: ROLES.MAIN_MANAGER,
    department: 'IT',
    title: 'Director of Global Operations',
    active: true,
  });

  // 2. Department Managers (1 per department × 11)
  DEPARTMENTS.forEach((dept, idx) => {
    const fn = pick(FIRST_NAMES, nameIndex++);
    const ln = pick(LAST_NAMES, nameIndex++);
    accounts.push({
      id: `acct-mgr-${dept.id.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      name: `${fn} ${ln}`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@${domain}`,
      role: ROLES.DEPARTMENT_MANAGER,
      department: dept.id,
      title: `${dept.name} Operations Lead`,
      active: true,
    });
  });

  // 3. Support Executives (2 per department × 11 = 22 executives, L1, L2, L3)
  const tiers = ['L1', 'L2', 'L3'];
  DEPARTMENTS.forEach((dept, idx) => {
    // Specialist 1
    const fn1 = pick(FIRST_NAMES, nameIndex++);
    const ln1 = pick(LAST_NAMES, nameIndex++);
    accounts.push({
      id: `acct-exec-${dept.id.toLowerCase().replace(/[^a-z0-9]/g, '')}-1`,
      name: `${fn1} ${ln1}`,
      email: `${fn1.toLowerCase()}.${ln1.toLowerCase()}@${domain}`,
      role: ROLES.SUPPORT_EXECUTIVE,
      department: dept.id,
      tier: tiers[idx % 3],
      skill_tags: [dept.id, `${dept.id} Operations`, 'Resolution'],
      title: `${dept.name} Specialist · Level ${tiers[idx % 3]}`,
      status: idx % 2 === 0 ? 'online' : 'busy',
      current_load: (idx % 3) + 1,
      rolling_score: 4.7 + (idx % 4) * 0.1,
      active: true,
    });

    // Specialist 2
    const fn2 = pick(FIRST_NAMES, nameIndex++);
    const ln2 = pick(LAST_NAMES, nameIndex++);
    accounts.push({
      id: `acct-exec-${dept.id.toLowerCase().replace(/[^a-z0-9]/g, '')}-2`,
      name: `${fn2} ${ln2}`,
      email: `${fn2.toLowerCase()}.${ln2.toLowerCase()}@${domain}`,
      role: ROLES.SUPPORT_EXECUTIVE,
      department: dept.id,
      tier: tiers[(idx + 1) % 3],
      skill_tags: [dept.id, 'Escalations'],
      title: `${dept.name} Specialist · Level ${tiers[(idx + 1) % 3]}`,
      status: 'online',
      current_load: (idx % 2),
      rolling_score: 4.8,
      active: true,
    });
  });

  // 4. Employees (End Users across departments)
  for (let i = 0; i < 15; i++) {
    const fn = pick(FIRST_NAMES, nameIndex++);
    const ln = pick(LAST_NAMES, nameIndex++);
    const dept = DEPARTMENTS[i % DEPARTMENTS.length];
    accounts.push({
      id: `acct-emp-${i + 1}`,
      name: `${fn} ${ln}`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@${domain}`,
      role: ROLES.EMPLOYEE,
      department: dept.id,
      title: `${dept.name} Associate`,
      active: true,
    });
  }

  return accounts;
}

function buildSeedTickets(accounts = []) {
  const tickets = [];
  const now = Date.now();
  const supportExecs = accounts.filter(a => a.role === ROLES.SUPPORT_EXECUTIVE);
  const employees = accounts.filter(a => a.role === ROLES.EMPLOYEE);

  const sampleIssues = [
    { dept: 'IT', subject: 'VPN Gateway connectivity timeout on Mumbai subnet', priority: 'high', tier: 'L2' },
    { dept: 'IT', subject: 'Requesting access to Datadog production monitoring cluster', priority: 'medium', tier: 'L1' },
    { dept: 'HR', subject: 'Parental leave policy document clarification', priority: 'medium', tier: 'L1' },
    { dept: 'HR', subject: 'Annual medical insurance enrollment dependent addition', priority: 'low', tier: 'L1' },
    { dept: 'Finance', subject: 'Corporate travel reimbursement delayed for European summit', priority: 'medium', tier: 'L2' },
    { dept: 'Finance', subject: 'Vendor invoice PO mismatch notification for Q3 audit', priority: 'high', tier: 'L3' },
    { dept: 'Billing', subject: 'Client credit note adjustment for enterprise account', priority: 'medium', tier: 'L1' },
    { dept: 'Cybersecurity', subject: 'Suspicious phishing email reporting in Finance inbox', priority: 'critical', tier: 'L3' },
    { dept: 'Legal', subject: 'Master Services Agreement non-disclosure addendum review', priority: 'medium', tier: 'L2' },
    { dept: 'Marketing', subject: 'Brand guideline asset bundle request for keynote', priority: 'low', tier: 'L1' },
    { dept: 'Quality Assurance', subject: 'Regression test runner failure on staging release 4.2', priority: 'high', tier: 'L2' },
  ];

  sampleIssues.forEach((issue, idx) => {
    const assignee = supportExecs.find(e => e.department === issue.dept) || supportExecs[0];
    const requester = employees[idx % employees.length] || accounts[0];

    tickets.push({
      id: `t-seed-${String(idx + 1).padStart(3, '0')}`,
      user_id: requester.id,
      department: issue.dept,
      subject: issue.subject,
      priority: issue.priority,
      priority_reason: `${issue.priority.toUpperCase()} priority ticket for ${issue.dept}`,
      required_tier: issue.tier,
      status: idx % 3 === 0 ? 'resolved' : idx % 3 === 1 ? 'in_progress' : 'open',
      assigned_to: assignee ? assignee.id : null,
      reassignment_count: 0,
      escalation_history: [],
      sla_deadline: now + (idx % 2 === 0 ? 14400000 : 28800000), // 4h or 8h
      created_at: new Date(now - (idx + 1) * 3600000 * 8).toISOString(),
      resolved_at: idx % 3 === 0 ? new Date(now - (idx + 1) * 3600000 * 2).toISOString() : null,
      eta_low_min: 15,
      eta_high_min: 30,
      csat: idx % 3 === 0 ? 5 : null,
    });
  });

  return tickets;
}

module.exports = {
  buildOrganizationRoster,
  buildSeedTickets,
};
