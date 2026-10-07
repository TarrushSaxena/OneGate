// ============================================================
// IT ASSET MANAGEMENT DATA
// Hardware + software inventory per employee
// Lifecycle tracking: active, repair, returned, retired
// ============================================================

const assets = [
  // ── Laptops ───────────────────────────────────────────────
  { id: 'ast-001', type: 'hardware', category: 'laptop',    name: 'MacBook Pro 14" M3 Pro', serial: 'FVFG2RH1Q6', assigned_to: 'u1', assigned_name: 'Naveen Kulkarni',     department: 'Engineering', status: 'active', purchased_date: '2024-03-15', warranty_expiry: '2027-03-15', value: 189900, notes: 'Engineering standard issue' },
  { id: 'ast-002', type: 'hardware', category: 'laptop',    name: 'Dell Latitude 5540',      serial: 'DL5540-8842', assigned_to: 'u2', assigned_name: 'Ananya Iyer',     department: 'Marketing',   status: 'active', purchased_date: '2024-06-01', warranty_expiry: '2027-06-01', value: 98500,  notes: 'Standard business laptop' },
  { id: 'ast-003', type: 'hardware', category: 'laptop',    name: 'Dell Latitude 5540',      serial: 'DL5540-9103', assigned_to: 'u3', assigned_name: 'Rohan Verma',     department: 'Sales',       status: 'active', purchased_date: '2024-01-10', warranty_expiry: '2027-01-10', value: 98500,  notes: 'Standard business laptop' },
  { id: 'ast-004', type: 'hardware', category: 'laptop',    name: 'MacBook Pro 16" M3 Max',  serial: 'FVFG3MX2Q4', assigned_to: 'u4', assigned_name: 'Sneha Patel',     department: 'Product',     status: 'active', purchased_date: '2024-09-01', warranty_expiry: '2027-09-01', value: 299900, notes: 'Design workstation' },
  { id: 'ast-005', type: 'hardware', category: 'laptop',    name: 'Lenovo ThinkPad X1 Carbon', serial: 'TP-X1C-4421', assigned_to: 'u5', assigned_name: 'Aditya Nair', department: 'Finance',     status: 'active', purchased_date: '2023-11-15', warranty_expiry: '2026-11-15', value: 145000, notes: 'Finance approved model' },
  { id: 'ast-006', type: 'hardware', category: 'laptop',    name: 'Dell Latitude 5540',      serial: 'DL5540-7701', assigned_to: null, assigned_name: null,              department: 'IT',          status: 'available', purchased_date: '2024-08-01', warranty_expiry: '2027-08-01', value: 98500,  notes: 'Spare — loaner pool' },
  { id: 'ast-007', type: 'hardware', category: 'laptop',    name: 'MacBook Air M2',          serial: 'FVFA2MR5Q1', assigned_to: null, assigned_name: null,              department: 'IT',          status: 'available', purchased_date: '2024-04-20', warranty_expiry: '2027-04-20', value: 114900, notes: 'Spare — loaner pool' },
  { id: 'ast-008', type: 'hardware', category: 'laptop',    name: 'Dell Latitude 5540',      serial: 'DL5540-6602', assigned_to: null, assigned_name: null,              department: 'IT',          status: 'repair',   purchased_date: '2023-05-01', warranty_expiry: '2026-05-01', value: 98500,  notes: 'Battery swelling — under repair' },

  // ── Monitors ──────────────────────────────────────────────
  { id: 'ast-010', type: 'hardware', category: 'monitor',   name: 'Dell UltraSharp 27" U2722D', serial: 'DU27-1101', assigned_to: 'u1', assigned_name: 'Naveen Kulkarni',  department: 'Engineering', status: 'active', purchased_date: '2024-03-15', warranty_expiry: '2027-03-15', value: 42500,  notes: 'Dual-monitor setup' },
  { id: 'ast-011', type: 'hardware', category: 'monitor',   name: 'Dell UltraSharp 27" U2722D', serial: 'DU27-1102', assigned_to: 'u1', assigned_name: 'Naveen Kulkarni',  department: 'Engineering', status: 'active', purchased_date: '2024-03-15', warranty_expiry: '2027-03-15', value: 42500,  notes: 'Dual-monitor setup — second screen' },
  { id: 'ast-012', type: 'hardware', category: 'monitor',   name: 'LG 24" FHD IPS',          serial: 'LG24-5501', assigned_to: 'u2', assigned_name: 'Ananya Iyer',     department: 'Marketing',   status: 'active', purchased_date: '2024-06-01', warranty_expiry: '2027-06-01', value: 18500,  notes: 'Single monitor' },

  // ── Peripherals ───────────────────────────────────────────
  { id: 'ast-020', type: 'hardware', category: 'peripheral', name: 'Logitech MX Keys Keyboard', serial: 'LG-MXK-001', assigned_to: 'u1', assigned_name: 'Naveen Kulkarni', department: 'Engineering', status: 'active', purchased_date: '2024-03-15', warranty_expiry: '2026-03-15', value: 9995, notes: '' },
  { id: 'ast-021', type: 'hardware', category: 'peripheral', name: 'Logitech MX Master 3S',    serial: 'LG-MXM-001', assigned_to: 'u1', assigned_name: 'Naveen Kulkarni', department: 'Engineering', status: 'active', purchased_date: '2024-03-15', warranty_expiry: '2026-03-15', value: 8995, notes: '' },
  { id: 'ast-022', type: 'hardware', category: 'peripheral', name: 'Jabra Evolve2 75 Headset', serial: 'JB-E75-001', assigned_to: 'u1', assigned_name: 'Naveen Kulkarni', department: 'Engineering', status: 'active', purchased_date: '2024-03-15', warranty_expiry: '2026-03-15', value: 26500, notes: 'Noise-cancelling headset' },
  { id: 'ast-023', type: 'hardware', category: 'peripheral', name: 'Logitech C920 Webcam',     serial: 'LG-C92-001', assigned_to: 'u3', assigned_name: 'Rohan Verma',  department: 'Sales',       status: 'active', purchased_date: '2024-01-10', warranty_expiry: '2026-01-10', value: 7500, notes: 'For client calls' },

  // ── Mobile Devices ────────────────────────────────────────
  { id: 'ast-030', type: 'hardware', category: 'mobile',    name: 'iPhone 15 Pro (Company)',  serial: 'AP-I15P-001', assigned_to: 'u3', assigned_name: 'Rohan Verma',    department: 'Sales',       status: 'active', purchased_date: '2024-09-20', warranty_expiry: '2026-09-20', value: 134900, notes: 'Sales team — client comms' },
  { id: 'ast-031', type: 'hardware', category: 'mobile',    name: 'Samsung Galaxy S24 (Company)', serial: 'SG-S24-001', assigned_to: 'u5', assigned_name: 'Aditya Nair', department: 'Finance',     status: 'active', purchased_date: '2024-03-01', warranty_expiry: '2026-03-01', value: 79999, notes: 'Finance on-call device' },
];

// ── Software Licenses ───────────────────────────────────────
const softwareLicenses = [
  { id: 'lic-001', name: 'Microsoft 365 E5',        vendor: 'Microsoft',  type: 'subscription', cost_per_seat: 2750,  total_seats: 200, used_seats: 147, renewal_date: '2026-12-31', category: 'productivity',  status: 'active' },
  { id: 'lic-002', name: 'Slack Business+',          vendor: 'Salesforce', type: 'subscription', cost_per_seat: 1050,  total_seats: 200, used_seats: 183, renewal_date: '2026-06-30', category: 'communication', status: 'active' },
  { id: 'lic-003', name: 'Zoom Business',            vendor: 'Zoom',       type: 'subscription', cost_per_seat: 1650,  total_seats: 100, used_seats: 89,  renewal_date: '2027-01-15', category: 'communication', status: 'active' },
  { id: 'lic-004', name: 'Adobe Creative Cloud',     vendor: 'Adobe',      type: 'subscription', cost_per_seat: 4500,  total_seats: 25,  used_seats: 18,  renewal_date: '2026-11-30', category: 'design',        status: 'active' },
  { id: 'lic-005', name: 'JetBrains All Products',   vendor: 'JetBrains',  type: 'subscription', cost_per_seat: 4200,  total_seats: 50,  used_seats: 42,  renewal_date: '2027-03-01', category: 'development',   status: 'active' },
  { id: 'lic-006', name: 'GitHub Enterprise',        vendor: 'GitHub',     type: 'subscription', cost_per_seat: 1750,  total_seats: 80,  used_seats: 71,  renewal_date: '2026-09-30', category: 'development',   status: 'active' },
  { id: 'lic-007', name: 'Figma Organization',       vendor: 'Figma',      type: 'subscription', cost_per_seat: 3750,  total_seats: 30,  used_seats: 24,  renewal_date: '2027-02-28', category: 'design',        status: 'active' },
  { id: 'lic-008', name: '1Password Teams',          vendor: '1Password',  type: 'subscription', cost_per_seat: 600,   total_seats: 200, used_seats: 192, renewal_date: '2026-08-31', category: 'security',      status: 'active' },
  { id: 'lic-009', name: 'Jira & Confluence Cloud',  vendor: 'Atlassian',  type: 'subscription', cost_per_seat: 1400,  total_seats: 150, used_seats: 128, renewal_date: '2027-04-15', category: 'project-mgmt',  status: 'active' },
  { id: 'lic-010', name: 'GlobalProtect VPN',        vendor: 'Palo Alto',  type: 'perpetual',    cost_per_seat: 0,     total_seats: 999, used_seats: 200, renewal_date: null,          category: 'security',      status: 'active' },
  { id: 'lic-011', name: 'Snow License Manager',     vendor: 'Snow',       type: 'subscription', cost_per_seat: 0,     total_seats: 1,   used_seats: 1,   renewal_date: '2026-12-31', category: 'IT-ops',        status: 'active' },
  { id: 'lic-012', name: 'Bloomberg Terminal',       vendor: 'Bloomberg',  type: 'subscription', cost_per_seat: 20000, total_seats: 3,   used_seats: 3,   renewal_date: '2026-12-31', category: 'finance',       status: 'active' },
  { id: 'lic-013', name: 'Workday HCM',              vendor: 'Workday',    type: 'subscription', cost_per_seat: 0,     total_seats: 1,   used_seats: 1,   renewal_date: '2027-01-31', category: 'HR',            status: 'active' },
  { id: 'lic-014', name: 'Concur Expense',           vendor: 'SAP',        type: 'subscription', cost_per_seat: 800,   total_seats: 200, used_seats: 156, renewal_date: '2026-10-31', category: 'finance',       status: 'active' },
];

// ── Asset Request Queue ─────────────────────────────────────
const assetRequests = [
  { id: 'ar-001', requested_by: 'u2', requested_name: 'Ananya Iyer', type: 'monitor', item: 'Dell UltraSharp 27"', reason: 'Need dual-monitor for design work',  status: 'pending_approval',  requested_date: '2026-09-25', approved_by: null, fulfilled_date: null },
  { id: 'ar-002', requested_by: 'u4', requested_name: 'Sneha Patel', type: 'peripheral', item: 'Jabra Evolve2 75 Headset', reason: 'Current headset broken — static noise', status: 'approved', requested_date: '2026-09-20', approved_by: 'mgr-it', fulfilled_date: null },
  { id: 'ar-003', requested_by: 'u5', requested_name: 'Aditya Nair', type: 'software',  item: 'Tableau Desktop',     reason: 'Financial data visualization for quarterly reports', status: 'pending_approval', requested_date: '2026-09-27', approved_by: null, fulfilled_date: null },
];

module.exports = { assets, softwareLicenses, assetRequests };
