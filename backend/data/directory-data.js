// ============================================================
// COMPANY DIRECTORY DATA
// 50+ employee profiles with org chart relationships
// Searchable by name, department, skill, role, location
// ============================================================

const directoryProfiles = [
  // ── C-Suite ───────────────────────────────────────────────
  { id: 'dir-001', name: 'Vikram Mehta',       role: 'CEO',                       department: 'Executive',   location: 'HQ — Floor 10',  phone: '+91 98100 10001', email: 'vikram.mehta@company.com',      slack: '@vikram.mehta',   manager_id: null,       avatar: '👨‍💼', skills: ['strategy', 'leadership', 'operations'],           bio: 'Founding CEO with 20+ years in enterprise SaaS.',           joined: '2015-01-15' },
  { id: 'dir-002', name: 'Priya Raghavan',     role: 'CTO',                       department: 'Engineering', location: 'HQ — Floor 9',   phone: '+91 98100 10002', email: 'priya.raghavan@company.com',    slack: '@priya.raghavan', manager_id: 'dir-001',  avatar: '👩‍💻', skills: ['architecture', 'cloud', 'AI/ML', 'security'],     bio: 'Former Google engineer. Leads all technology.',             joined: '2016-03-01' },
  { id: 'dir-003', name: 'Rajesh Khanna',      role: 'CFO',                       department: 'Finance',     location: 'HQ — Floor 8',   phone: '+91 98100 10003', email: 'rajesh.khanna@company.com',     slack: '@rajesh.khanna',  manager_id: 'dir-001',  avatar: '👨‍💼', skills: ['finance', 'audit', 'compliance', 'budgeting'],     bio: 'CA and CFA. Oversees all financial operations.',            joined: '2016-06-12' },
  { id: 'dir-004', name: 'Priya Swaminathan',  role: 'CHRO',                      department: 'HR',          location: 'HQ — Floor 7',   phone: '+91 98100 10004', email: 'p.swaminathan@company.com',     slack: '@priya.s',        manager_id: 'dir-001',  avatar: '👩‍💼', skills: ['HR strategy', 'talent', 'culture', 'compliance'],  bio: 'SHRM-SCP certified. 15 years in people operations.',       joined: '2017-01-10' },
  { id: 'dir-005', name: 'Col. Sameer Bakshi', role: 'VP Operations',             department: 'Facilities',  location: 'HQ — Floor 6',   phone: '+91 98100 10005', email: 'sameer.b@company.com',          slack: '@sameer.b',       manager_id: 'dir-001',  avatar: '👨‍💼', skills: ['facilities', 'security', 'safety', 'compliance'],  bio: 'Ex-Army Colonel. Runs building ops and physical security.', joined: '2018-04-01' },

  // ── IT Department ─────────────────────────────────────────
  { id: 'dir-006', name: 'Dr. Raghav Sen',     role: 'IT Director',               department: 'IT',          location: 'HQ — Floor 5',   phone: '+91 98100 20001', email: 'raghav.sen@company.com',         slack: '@raghav.sen',     manager_id: 'dir-002',  avatar: '👨‍💼', skills: ['ITSM', 'infrastructure', 'cybersecurity', 'cloud'], bio: 'PhD in CS. Heads IT operations and helpdesk.',              joined: '2017-08-15' },
  { id: 'dir-007', name: 'Ravi Sharma',        role: 'Senior Network Engineer',   department: 'IT',          location: 'HQ — Floor 5',   phone: '+91 98100 20002', email: 'ravi.sharma@company.com',        slack: '@ravi.s',         manager_id: 'dir-006',  avatar: '🧑‍💻', skills: ['network', 'vpn', 'wifi', 'firewall', 'CCNA'],      bio: 'CCNA and CompTIA Security+ certified L2 engineer.',        joined: '2021-03-01' },
  { id: 'dir-008', name: 'Meera Sundaram',     role: 'Principal Cloud Architect', department: 'IT',          location: 'HQ — Floor 5',   phone: '+91 98100 20003', email: 'meera.sundaram@helpdesk.com',   slack: '@meera.s',        manager_id: 'dir-006',  avatar: '👩‍💻', skills: ['aws', 'azure', 'server', 'disaster-recovery'],     bio: 'AWS Solutions Architect. Handles L3 infrastructure.',       joined: '2019-06-15' },
  { id: 'dir-009', name: 'Arjun Kapoor',       role: 'IT Support Analyst',        department: 'IT',          location: 'HQ — Floor 5',   phone: '+91 98100 20004', email: 'arjun.kapoor@helpdesk.com',     slack: '@arjun.k',        manager_id: 'dir-006',  avatar: '🧑‍💻', skills: ['password-reset', 'account', 'email', 'printer'],    bio: 'CompTIA A+ certified. First-line support.',                joined: '2024-01-10' },
  { id: 'dir-010', name: 'Neha Chawla',        role: 'Endpoint Security Engineer',department: 'IT',          location: 'HQ — Floor 5',   phone: '+91 98100 20005', email: 'neha.chawla@helpdesk.com',      slack: '@neha.c',         manager_id: 'dir-006',  avatar: '👩‍💻', skills: ['vpn', 'remote-access', 'endpoint', 'laptop'],       bio: 'CCNA and CompTIA Network+ certified.',                     joined: '2022-09-01' },
  { id: 'dir-011', name: 'Kunal Singhal',      role: 'Desktop Support Technician',department: 'IT',          location: 'HQ — Floor 5',   phone: '+91 98100 20006', email: 'kunal.singhal@helpdesk.com',    slack: '@kunal.s',        manager_id: 'dir-006',  avatar: '🧑‍💻', skills: ['windows', 'macos', 'printer', 'troubleshoot'],      bio: 'New hire. Handles software installs and peripherals.',      joined: '2025-06-01' },

  // ── HR Department ─────────────────────────────────────────
  { id: 'dir-012', name: 'Pooja Nair',         role: 'HR Business Partner',       department: 'HR',          location: 'HQ — Floor 7',   phone: '+91 98100 30001', email: 'pooja.nair@helpdesk.com',       slack: '@pooja.n',        manager_id: 'dir-004',  avatar: '👩‍💼', skills: ['leave', 'payroll', 'benefits', 'compliance'],       bio: 'PHR and SHRM-CP certified. Handles compensation.',         joined: '2020-11-01' },
  { id: 'dir-013', name: 'Rahul Deshmukh',     role: 'HR Coordinator',            department: 'HR',          location: 'HQ — Floor 7',   phone: '+91 98100 30002', email: 'rahul.deshmukh@helpdesk.com',   slack: '@rahul.d',        manager_id: 'dir-004',  avatar: '👨‍💼', skills: ['onboarding', 'offboarding', 'policy', 'handbook'],   bio: 'SHRM-CP certified. Runs onboarding programs.',             joined: '2023-05-15' },
  { id: 'dir-014', name: 'Sunita Raman',       role: 'Senior HR Manager',         department: 'HR',          location: 'HQ — Floor 7',   phone: '+91 98100 30003', email: 'sunita.raman@helpdesk.com',     slack: '@sunita.r',       manager_id: 'dir-004',  avatar: '👩‍💼', skills: ['performance', 'grievance', 'compliance', 'legal'],   bio: 'SPHR certified. 8+ years. Leads performance reviews.',     joined: '2017-09-01' },
  { id: 'dir-015', name: 'Varun Bhatia',       role: 'Benefits Specialist',       department: 'HR',          location: 'HQ — Floor 7',   phone: '+91 98100 30004', email: 'varun.bhatia@helpdesk.com',     slack: '@varun.b',        manager_id: 'dir-004',  avatar: '👨‍💼', skills: ['benefits', 'insurance', 'health', 'epf'],            bio: 'PHR certified. Manages all employee benefits.',            joined: '2021-11-01' },
  { id: 'dir-016', name: 'Divya Joshi',        role: 'Payroll Administrator',     department: 'HR',          location: 'HQ — Floor 7',   phone: '+91 98100 30005', email: 'divya.joshi@helpdesk.com',      slack: '@divya.j',        manager_id: 'dir-012',  avatar: '👩‍💼', skills: ['payslip', 'tax', 'form16', 'direct-deposit'],        bio: 'Handles payroll processing and tax compliance.',           joined: '2024-04-01' },

  // ── Finance Department ────────────────────────────────────
  { id: 'dir-017', name: 'Pradeep Singhania',  role: 'Finance Director',          department: 'Finance',     location: 'HQ — Floor 8',   phone: '+91 98100 40001', email: 'p.singhania@company.com',       slack: '@pradeep.s',      manager_id: 'dir-003',  avatar: '👨‍💼', skills: ['budgeting', 'audit', 'compliance', 'FP&A'],         bio: 'CA and CFA. Leads finance operations.',                    joined: '2018-02-01' },
  { id: 'dir-018', name: 'Vikram Malhotra',    role: 'Expense Manager',           department: 'Finance',     location: 'HQ — Floor 8',   phone: '+91 98100 40002', email: 'vikram.malhotra@helpdesk.com',  slack: '@vikram.m',       manager_id: 'dir-017',  avatar: '👨‍💼', skills: ['expense', 'reimbursement', 'procurement'],          bio: 'CA certified. Manages expense workflows.',                 joined: '2021-02-01' },
  { id: 'dir-019', name: 'Shweta Kulkarni',    role: 'Senior Financial Analyst',  department: 'Finance',     location: 'HQ — Floor 8',   phone: '+91 98100 40003', email: 'shweta.kulkarni@helpdesk.com',  slack: '@shweta.k',       manager_id: 'dir-017',  avatar: '👩‍💼', skills: ['budget', 'forecast', 'audit', 'gst', 'reporting'],   bio: 'CA and CFA. Handles SOX compliance and audit.',            joined: '2018-10-01' },
  { id: 'dir-020', name: 'Amit Saxena',        role: 'Accounts Payable Clerk',    department: 'Finance',     location: 'HQ — Floor 8',   phone: '+91 98100 40004', email: 'amit.saxena@helpdesk.com',      slack: '@amit.s',         manager_id: 'dir-017',  avatar: '👨‍💼', skills: ['invoice', 'vendor', 'payment', 'billing'],          bio: 'Processes vendor invoices and payments.',                  joined: '2023-11-01' },
  { id: 'dir-021', name: 'Ritu Agrawal',       role: 'Travel & Expense Analyst',  department: 'Finance',     location: 'HQ — Floor 8',   phone: '+91 98100 40005', email: 'ritu.agrawal@helpdesk.com',     slack: '@ritu.a',         manager_id: 'dir-017',  avatar: '👩‍💼', skills: ['travel', 'expense-report', 'corporate-card'],        bio: 'CA certified. Manages travel and expense policy.',         joined: '2022-03-01' },
  { id: 'dir-022', name: 'Deepa Menon',        role: 'Payroll Analyst',           department: 'Finance',     location: 'HQ — Floor 8',   phone: '+91 98100 40006', email: 'deepa.menon@helpdesk.com',      slack: '@deepa.m',        manager_id: 'dir-017',  avatar: '👩‍💼', skills: ['payroll', 'salary', 'direct-deposit', 'tax'],        bio: 'Handles payroll runs and salary disbursement.',            joined: '2024-01-15' },

  // ── Facilities Department ─────────────────────────────────
  { id: 'dir-023', name: 'Kavita Reddy',       role: 'Facilities Manager',        department: 'Facilities',  location: 'HQ — Floor 1',   phone: '+91 98100 50001', email: 'kavita.reddy@helpdesk.com',     slack: '@kavita.r',       manager_id: 'dir-005',  avatar: '👩‍🔧', skills: ['access', 'badge', 'security', 'parking'],           bio: 'CPP certified. Manages building access and security.',     joined: '2020-05-01' },
  { id: 'dir-024', name: 'Suresh Pillai',      role: 'Maintenance Technician',    department: 'Facilities',  location: 'HQ — Floor 1',   phone: '+91 98100 50002', email: 'suresh.pillai@helpdesk.com',    slack: '@suresh.p',       manager_id: 'dir-005',  avatar: '👨‍🔧', skills: ['cleaning', 'maintenance', 'hvac', 'repair'],        bio: 'Handles HVAC, cleaning, and physical maintenance.',        joined: '2023-02-01' },
  { id: 'dir-025', name: 'Harish Nambiar',     role: 'Safety & Compliance Officer',department: 'Facilities', location: 'HQ — Floor 1',   phone: '+91 98100 50003', email: 'harish.nambiar@helpdesk.com',   slack: '@harish.n',       manager_id: 'dir-005',  avatar: '👨‍🔧', skills: ['fire-safety', 'emergency', 'compliance', 'evacuation'], bio: 'CHSP and CISM certified. 9+ years in safety.',          joined: '2016-09-01' },
  { id: 'dir-026', name: 'Alok Tiwari',        role: 'Space & Events Coordinator',department: 'Facilities',  location: 'HQ — Floor 1',   phone: '+91 98100 50004', email: 'alok.tiwari@helpdesk.com',      slack: '@alok.t',         manager_id: 'dir-005',  avatar: '👨‍🔧', skills: ['meeting-room', 'conference', 'av-equipment'],        bio: 'Manages room bookings and AV equipment.',                 joined: '2022-01-01' },
  { id: 'dir-027', name: 'Renu Bansal',        role: 'Reception & Visitor Mgmt',  department: 'Facilities',  location: 'HQ — Floor 1',   phone: '+91 98100 50005', email: 'renu.bansal@helpdesk.com',      slack: '@renu.b',         manager_id: 'dir-023',  avatar: '👩‍🔧', skills: ['visitor', 'reception', 'courier', 'mail'],           bio: 'Manages front desk, visitors, and couriers.',             joined: '2025-04-01' },

  // ── Cybersecurity ─────────────────────────────────────────
  { id: 'dir-028', name: 'Anand Krishnan',     role: 'CISO',                      department: 'Cybersecurity', location: 'HQ — Floor 9', phone: '+91 98100 60001', email: 'anand.k@company.com',           slack: '@anand.k',        manager_id: 'dir-002',  avatar: '🛡️',  skills: ['incident-response', 'SOC', 'penetration-testing'],  bio: 'CISSP, CEH. Leads security operations center.',            joined: '2018-01-15' },
  { id: 'dir-029', name: 'Tanvi Shah',         role: 'Security Analyst',          department: 'Cybersecurity', location: 'HQ — Floor 9', phone: '+91 98100 60002', email: 'tanvi.shah@company.com',         slack: '@tanvi.s',        manager_id: 'dir-028',  avatar: '👩‍💻', skills: ['phishing', 'SIEM', 'threat-intel', 'forensics'],     bio: 'CompTIA Security+ and CySA+. Triages security alerts.',   joined: '2022-06-01' },
  { id: 'dir-030', name: 'Karthik Iyer',       role: 'Penetration Tester',        department: 'Cybersecurity', location: 'HQ — Floor 9', phone: '+91 98100 60003', email: 'karthik.iyer@company.com',       slack: '@karthik.i',      manager_id: 'dir-028',  avatar: '🧑‍💻', skills: ['pen-test', 'vulnerability', 'red-team', 'OWASP'],    bio: 'CEH and OSCP certified. Conducts quarterly pen tests.',    joined: '2023-03-15' },

  // ── Legal ─────────────────────────────────────────────────
  { id: 'dir-031', name: 'Adv. Nandini Kapoor',role: 'General Counsel',           department: 'Legal',       location: 'HQ — Floor 8',   phone: '+91 98100 70001', email: 'nandini.kapoor@company.com',    slack: '@nandini.k',      manager_id: 'dir-001',  avatar: '👩‍⚖️', skills: ['contract', 'NDA', 'IP', 'compliance', 'litigation'], bio: 'Bar-registered advocate. 12 years in corporate law.',      joined: '2019-02-01' },
  { id: 'dir-032', name: 'Siddharth Acharya',  role: 'Legal Associate',           department: 'Legal',       location: 'HQ — Floor 8',   phone: '+91 98100 70002', email: 'siddharth.a@company.com',       slack: '@sid.a',          manager_id: 'dir-031',  avatar: '👨‍⚖️', skills: ['contract-review', 'vendor', 'data-privacy', 'GDPR'], bio: 'Handles contract reviews and data privacy.',               joined: '2022-08-01' },

  // ── Marketing ─────────────────────────────────────────────
  { id: 'dir-033', name: 'Ritika Bose',        role: 'VP Marketing',              department: 'Marketing',   location: 'HQ — Floor 6',   phone: '+91 98100 80001', email: 'ritika.bose@company.com',       slack: '@ritika.b',       manager_id: 'dir-001',  avatar: '👩‍💼', skills: ['brand', 'campaigns', 'digital', 'content'],         bio: 'Ex-Ogilvy. Leads all marketing and brand strategy.',       joined: '2019-08-01' },
  { id: 'dir-034', name: 'Nikhil Gupta',       role: 'Content Manager',           department: 'Marketing',   location: 'HQ — Floor 6',   phone: '+91 98100 80002', email: 'nikhil.gupta@company.com',      slack: '@nikhil.g',       manager_id: 'dir-033',  avatar: '👨‍💼', skills: ['content', 'SEO', 'copywriting', 'social-media'],     bio: 'Manages company blog, social, and thought leadership.',    joined: '2021-11-01' },
  { id: 'dir-035', name: 'Aisha Fernandes',    role: 'Design Lead',               department: 'Marketing',   location: 'HQ — Floor 6',   phone: '+91 98100 80003', email: 'aisha.fernandes@company.com',   slack: '@aisha.f',        manager_id: 'dir-033',  avatar: '👩‍🎨', skills: ['figma', 'brand-design', 'UI/UX', 'illustration'],    bio: 'Leads visual design for all brand touchpoints.',           joined: '2020-09-15' },

  // ── Data Analytics ────────────────────────────────────────
  { id: 'dir-036', name: 'Dr. Arun Patel',     role: 'Head of Data & Analytics',  department: 'Data Analytics', location: 'HQ — Floor 9', phone: '+91 98100 90001', email: 'arun.patel@company.com',       slack: '@arun.p',         manager_id: 'dir-002',  avatar: '👨‍🔬', skills: ['data-science', 'ML', 'SQL', 'python', 'dashboards'], bio: 'PhD in Statistics. Leads BI and advanced analytics.',      joined: '2019-04-01' },
  { id: 'dir-037', name: 'Sneha Mukherjee',    role: 'Data Engineer',             department: 'Data Analytics', location: 'HQ — Floor 9', phone: '+91 98100 90002', email: 'sneha.m@company.com',           slack: '@sneha.m',        manager_id: 'dir-036',  avatar: '👩‍💻', skills: ['ETL', 'spark', 'airflow', 'data-pipeline'],          bio: 'Manages data pipelines and warehouse.',                    joined: '2022-01-15' },

  // ── Customer Support ──────────────────────────────────────
  { id: 'dir-038', name: 'Manish Thakur',      role: 'VP Customer Success',       department: 'Customer Support', location: 'HQ — Floor 4', phone: '+91 98100 11001', email: 'manish.thakur@company.com',   slack: '@manish.t',       manager_id: 'dir-001',  avatar: '👨‍💼', skills: ['customer-success', 'SLA', 'escalation', 'retention'],bio: 'Leads external customer support operations.',              joined: '2018-07-01' },
  { id: 'dir-039', name: 'Shalini Das',        role: 'Customer Support Lead',     department: 'Customer Support', location: 'HQ — Floor 4', phone: '+91 98100 11002', email: 'shalini.das@company.com',     slack: '@shalini.d',      manager_id: 'dir-038',  avatar: '👩‍💼', skills: ['ticketing', 'CRM', 'zendesk', 'customer-care'],      bio: 'Manages Tier 1-2 external customer support.',              joined: '2021-05-01' },

  // ── Quality Assurance ─────────────────────────────────────
  { id: 'dir-040', name: 'Rohan Shetty',       role: 'QA Lead',                   department: 'Quality Assurance', location: 'HQ — Floor 5', phone: '+91 98100 12001', email: 'rohan.shetty@company.com',  slack: '@rohan.s',        manager_id: 'dir-002',  avatar: '🧑‍💻', skills: ['testing', 'automation', 'selenium', 'jira'],         bio: 'Leads QA automation and release sign-off.',                joined: '2020-03-01' },
  { id: 'dir-041', name: 'Prerna Singh',        role: 'QA Engineer',               department: 'Quality Assurance', location: 'HQ — Floor 5', phone: '+91 98100 12002', email: 'prerna.singh@company.com',  slack: '@prerna.s',       manager_id: 'dir-040',  avatar: '👩‍💻', skills: ['manual-testing', 'regression', 'UAT', 'bug-reports'],bio: 'Handles regression testing and user acceptance.',           joined: '2023-06-01' },

  // ── Billing ───────────────────────────────────────────────
  { id: 'dir-042', name: 'Gaurav Sharma',       role: 'Billing Manager',           department: 'Billing',     location: 'HQ — Floor 8',   phone: '+91 98100 13001', email: 'gaurav.sharma@company.com',     slack: '@gaurav.s',       manager_id: 'dir-003',  avatar: '👨‍💼', skills: ['invoicing', 'payment-terms', 'credit-memo', 'AR'],   bio: 'Manages customer billing and accounts receivable.',        joined: '2020-10-01' },
  { id: 'dir-043', name: 'Meghna Jain',        role: 'Billing Analyst',           department: 'Billing',     location: 'HQ — Floor 8',   phone: '+91 98100 13002', email: 'meghna.jain@company.com',       slack: '@meghna.j',       manager_id: 'dir-042',  avatar: '👩‍💼', skills: ['invoice-dispute', 'reconciliation', 'ERP'],           bio: 'Processes billing disputes and reconciliation.',           joined: '2023-09-01' },

  // ── Investor Relations ────────────────────────────────────
  { id: 'dir-044', name: 'Ashwin Rao',         role: 'Head of Investor Relations', department: 'Investor Relations', location: 'HQ — Floor 10', phone: '+91 98100 14001', email: 'ashwin.rao@company.com', slack: '@ashwin.r',       manager_id: 'dir-003',  avatar: '👨‍💼', skills: ['earnings', 'shareholder', 'SEC', 'board-reporting'],  bio: 'Manages investor communications and board reporting.',     joined: '2019-11-01' },

  // ── Engineering (Product) ─────────────────────────────────
  { id: 'dir-045', name: 'Ankita Verma',       role: 'Engineering Manager',       department: 'Engineering', location: 'HQ — Floor 9',   phone: '+91 98100 15001', email: 'ankita.verma@company.com',      slack: '@ankita.v',       manager_id: 'dir-002',  avatar: '👩‍💻', skills: ['backend', 'microservices', 'node.js', 'kubernetes'],  bio: 'Leads backend platform and infrastructure.',               joined: '2020-01-01' },
  { id: 'dir-046', name: 'Sahil Mehta',        role: 'Frontend Engineer',         department: 'Engineering', location: 'HQ — Floor 9',   phone: '+91 98100 15002', email: 'sahil.mehta@company.com',       slack: '@sahil.m',        manager_id: 'dir-045',  avatar: '🧑‍💻', skills: ['react', 'javascript', 'CSS', 'accessibility'],       bio: 'Builds the web frontend and design system.',               joined: '2022-07-01' },
  { id: 'dir-047', name: 'Nisha Kumari',       role: 'DevOps Engineer',           department: 'Engineering', location: 'HQ — Floor 9',   phone: '+91 98100 15003', email: 'nisha.kumari@company.com',      slack: '@nisha.k',        manager_id: 'dir-045',  avatar: '👩‍💻', skills: ['CI/CD', 'terraform', 'docker', 'monitoring'],         bio: 'Manages deployment pipelines and infrastructure.',         joined: '2021-10-01' },

  // ── Product ───────────────────────────────────────────────
  { id: 'dir-048', name: 'Tarun Sethi',        role: 'VP Product',                department: 'Product',     location: 'HQ — Floor 6',   phone: '+91 98100 16001', email: 'tarun.sethi@company.com',       slack: '@tarun.s',        manager_id: 'dir-001',  avatar: '👨‍💼', skills: ['product-strategy', 'roadmap', 'user-research'],       bio: 'Leads product strategy and roadmap.',                      joined: '2019-05-01' },
  { id: 'dir-049', name: 'Isha Malhotra',      role: 'Product Manager',           department: 'Product',     location: 'HQ — Floor 6',   phone: '+91 98100 16002', email: 'isha.malhotra@company.com',     slack: '@isha.m',         manager_id: 'dir-048',  avatar: '👩‍💼', skills: ['analytics', 'A/B testing', 'jira', 'PRD'],            bio: 'Manages core product features and sprint planning.',       joined: '2021-08-01' },
  { id: 'dir-050', name: 'Rishi Kapoor',       role: 'UX Researcher',             department: 'Product',     location: 'HQ — Floor 6',   phone: '+91 98100 16003', email: 'rishi.kapoor@company.com',      slack: '@rishi.k',        manager_id: 'dir-048',  avatar: '👨‍🎨', skills: ['user-interviews', 'usability', 'figma', 'surveys'],   bio: 'Conducts user research and usability testing.',            joined: '2023-01-15' },
];

// ─── Org chart helper: returns tree structure ────────────────
function buildOrgTree() {
  const byId = {};
  directoryProfiles.forEach(p => { byId[p.id] = { ...p, children: [] }; });
  const roots = [];
  Object.values(byId).forEach(node => {
    if (node.manager_id && byId[node.manager_id]) {
      byId[node.manager_id].children.push(node);
    } else if (!node.manager_id) {
      roots.push(node);
    }
  });
  return roots;
}

// ─── Search ─────────────────────────────────────────────────
function searchDirectory(query, filters = {}) {
  const q = (query || '').toLowerCase();
  return directoryProfiles.filter(p => {
    // Text match
    const textMatch = !q || [p.name, p.role, p.department, p.email, p.bio, ...p.skills]
      .some(f => f.toLowerCase().includes(q));
    // Department filter
    const deptMatch = !filters.department || p.department.toLowerCase() === filters.department.toLowerCase();
    // Location filter
    const locMatch = !filters.location || p.location.toLowerCase().includes(filters.location.toLowerCase());
    return textMatch && deptMatch && locMatch;
  });
}

module.exports = { directoryProfiles, buildOrgTree, searchDirectory };
