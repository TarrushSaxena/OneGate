// PS18 11 Departments registry
const DEPARTMENTS = [
  { id: 'IT', name: 'IT Support' },
  { id: 'HR', name: 'Human Resources' },
  { id: 'Finance', name: 'Finance & Accounts' },
  { id: 'Billing', name: 'Billing & Invoicing' },
  { id: 'Customer Support', name: 'Customer Support' },
  { id: 'Cybersecurity', name: 'Cybersecurity & InfoSec' },
  { id: 'Data & Analytics', name: 'Data & Analytics' },
  { id: 'Investor Relations', name: 'Investor Relations' },
  { id: 'Legal', name: 'Legal & Compliance' },
  { id: 'Marketing', name: 'Marketing & Brand' },
  { id: 'Quality Assurance', name: 'Quality Assurance & Testing' },
];

const DEPARTMENT_IDS = DEPARTMENTS.map(d => d.id);

function isValidDepartment(dept) {
  if (!dept) return false;
  return DEPARTMENT_IDS.includes(dept);
}

function getDepartmentName(deptId) {
  const d = DEPARTMENTS.find(dep => dep.id === deptId);
  return d ? d.name : deptId;
}

module.exports = {
  DEPARTMENTS,
  DEPARTMENT_IDS,
  isValidDepartment,
  getDepartmentName,
};
