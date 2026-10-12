// Presentation-only identities. Passwords stay server-side and demo login is
// disabled automatically in production.

const DEMO_ACCOUNTS = [
  { key:'director', name:'Executive Director', email:'director.exec@company.com', role:'main_manager', department:'All', tier:'L3' },
  { key:'global-manager', name:'Global Operations Manager', email:'main.manager@company.com', role:'main_manager', department:'All', tier:'L3' },
  { key:'it-personal-lead', name:'Tarrush Saxena', email:'tarrushsaxena@gmail.com', role:'department_manager', department:'IT', tier:'L3' },
  { key:'it-manager', name:'IT Operations Head', email:'it.manager@company.com', role:'department_manager', department:'IT', tier:'L3' },
  { key:'hr-manager', name:'HR Director', email:'hr.manager@company.com', role:'department_manager', department:'HR', tier:'L3' },
  { key:'finance-manager', name:'Finance Controller', email:'finance.manager@company.com', role:'department_manager', department:'Finance', tier:'L3' },
  { key:'billing-manager', name:'Billing Operations Lead', email:'billing.manager@company.com', role:'department_manager', department:'Billing', tier:'L3' },
  { key:'customer-support-manager', name:'Customer Support Manager', email:'customersupport.manager@company.com', role:'department_manager', department:'Customer Support', tier:'L3' },
  { key:'cybersecurity-manager', name:'Chief InfoSec Officer', email:'cybersecurity.manager@company.com', role:'department_manager', department:'Cybersecurity', tier:'L3' },
  { key:'data-analytics-manager', name:'Data Analytics Lead', email:'dataanalytics.manager@company.com', role:'department_manager', department:'Data & Analytics', tier:'L3' },
  { key:'investor-relations-manager', name:'IR Director', email:'investorrelations.manager@company.com', role:'department_manager', department:'Investor Relations', tier:'L3' },
  { key:'legal-manager', name:'General Counsel', email:'legal.manager@company.com', role:'department_manager', department:'Legal', tier:'L3' },
  { key:'marketing-manager', name:'Marketing VP', email:'marketing.manager@company.com', role:'department_manager', department:'Marketing', tier:'L3' },
  { key:'quality-assurance-manager', name:'QA Director', email:'qualityassurance.manager@company.com', role:'department_manager', department:'Quality Assurance', tier:'L3' },
  { key:'it-specialist', name:'IT Support Specialist', email:'it.support@company.com', role:'support_executive', department:'IT', tier:'L3', skill_tags:['IT','support','escalations'] },
  { key:'it-priya', name:'Priya Sharma', email:'priya.sharma@company.com', role:'support_executive', department:'IT', tier:'L3', skill_tags:['IT','network','escalations'] },
  { key:'it-rahul', name:'Rahul Verma', email:'rahul.verma@company.com', role:'support_executive', department:'IT', tier:'L1', skill_tags:['IT','frontline'] },
  { key:'hr-specialist', name:'Ananya Roy', email:'hr.support@company.com', role:'support_executive', department:'HR', tier:'L2', skill_tags:['HR','leave','policy'] },
  { key:'finance-specialist', name:'Vikram Mehta', email:'finance.support@company.com', role:'support_executive', department:'Finance', tier:'L2', skill_tags:['Finance','expense','reimbursement'] },
  { key:'billing-specialist', name:'Neha Gupta', email:'billing.support@company.com', role:'support_executive', department:'Billing', tier:'L2', skill_tags:['Billing','invoice'] },
  { key:'customer-support-specialist', name:'Arjun Das', email:'customersupport.support@company.com', role:'support_executive', department:'Customer Support', tier:'L2', skill_tags:['Customer Support','case management'] },
  { key:'cybersecurity-specialist', name:'Kabir Rao', email:'cybersecurity.support@company.com', role:'support_executive', department:'Cybersecurity', tier:'L3', skill_tags:['Cybersecurity','incident response'] },
  { key:'data-analytics-specialist', name:'Sneha Patel', email:'dataanalytics.support@company.com', role:'support_executive', department:'Data & Analytics', tier:'L2', skill_tags:['Data & Analytics','reporting'] },
  { key:'investor-relations-specialist', name:'Rohan Singhania', email:'investorrelations.support@company.com', role:'support_executive', department:'Investor Relations', tier:'L2', skill_tags:['Investor Relations','stakeholder support'] },
  { key:'legal-specialist', name:'Meera Nambiar', email:'legal.support@company.com', role:'support_executive', department:'Legal', tier:'L3', skill_tags:['Legal','compliance'] },
  { key:'marketing-specialist', name:'Aditya Sen', email:'marketing.support@company.com', role:'support_executive', department:'Marketing', tier:'L2', skill_tags:['Marketing','brand'] },
  { key:'quality-assurance-specialist', name:'Tanvi Joshi', email:'qualityassurance.support@company.com', role:'support_executive', department:'Quality Assurance', tier:'L2', skill_tags:['Quality Assurance','testing'] },
  { key:'employee', name:'Demo Employee', email:'employee@company.com', role:'employee', department:'IT', tier:'L1' },
  // OneGate SME Finance Copilot demo users (tenant membership in backend/sme/tenancy.js)
  { key:'sme-owner-ananya', name:'SME Owner · Ananya Textiles', email:'owner.ananya@company.com', role:'employee', department:'Finance', tier:'L1' },
  { key:'sme-accountant-ananya', name:'SME Accountant · Ananya Textiles', email:'accounts.ananya@company.com', role:'employee', department:'Finance', tier:'L1' },
  { key:'sme-owner-chai', name:'SME Owner · Chai Point Cafe', email:'owner.chai@company.com', role:'employee', department:'Finance', tier:'L1' },
  { key:'sme-owner-pixelforge', name:'SME Owner · PixelForge Studio', email:'owner.pixelforge@company.com', role:'employee', department:'Finance', tier:'L1' },
  { key:'sme-viewer-pixelforge', name:'SME Viewer · PixelForge Studio', email:'viewer.pixelforge@company.com', role:'employee', department:'Finance', tier:'L1' },
];

const ROLE_LABELS = {
  employee: 'Employee',
  support_executive: 'Specialist',
  department_manager: 'Department manager',
  main_manager: 'Organization manager',
};

function publicDemoAccount(definition, account) {
  return {
    key: definition.key,
    accountId: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    roleLabel: ROLE_LABELS[account.role] || account.role,
    department: account.department,
    tier: account.tier || null,
  };
}

module.exports = { DEMO_ACCOUNTS, ROLE_LABELS, publicDemoAccount };
