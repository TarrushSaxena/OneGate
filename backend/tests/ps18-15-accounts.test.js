const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('PS18-15: Employee account cannot hit any manager-only or support-executive-only endpoint', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');

  const employee = await accountStore.createAccount({
    email: 'test.emp.restricted@company.com',
    name: 'Restricted Employee',
    role: 'employee',
    department: 'Marketing',
    password: 'EmployeePass#2026',
    active: true,
  });

  const empToken = tokens.signToken(employee);

  const restrictedEndpoints = [
    { method: 'GET', path: '/api/manager/department' },
    { method: 'GET', path: '/api/admin/accounts' },
    { method: 'POST', path: '/api/admin/accounts', body: { email: 'x@company.com', name: 'X', role: 'employee' } },
    { method: 'GET', path: '/api/dashboard/all' },
    { method: 'GET', path: '/api/departments/IT/dashboard' },
    { method: 'PATCH', path: '/api/tickets/t-sample-01/status', body: { status: 'resolved' } },
    { method: 'POST', path: '/api/tickets/t-sample-01/reply', body: { message: 'hello' } },
    { method: 'POST', path: '/api/tickets/t-sample-01/resolve', body: { resolution: 'done' } },
    { method: 'POST', path: '/api/tickets/t-sample-01/escalate', body: { reason: 'help' } },
    { method: 'POST', path: '/api/routing/correct', body: { id: 'l1', correct_department: 'HR' } },
  ];

  for (const ep of restrictedEndpoints) {
    const res = await fetchApi(ep.path, {
      method: ep.method,
      token: empToken,
      body: ep.body,
    });
    assert.strictEqual(
      res.status,
      403,
      `Employee calling ${ep.method} ${ep.path} must receive 403 Forbidden, got ${res.status}`
    );
  }
});

test('PS18-15: Role provisioning hierarchy and temporary password issuance', async () => {
  const accountStore = require('../auth/accountStore');
  const tokens = require('../auth/tokens');
  const mailer = require('../auth/mailer');

  // Main manager account
  const mainMgr = await accountStore.createAccount({
    email: 'main.dir@company.com',
    name: 'Main Director',
    role: 'main_manager',
    department: 'IT',
    password: 'MainDirector#2026',
    active: true,
  });
  const mainToken = tokens.signToken(mainMgr);

  // 1. Main Manager provisions a Department Manager for Finance
  mailer.clearOutbox();
  const provDeptMgr = await fetchApi('/api/admin/accounts', {
    method: 'POST',
    token: mainToken,
    body: {
      email: 'finance.lead@company.com',
      name: 'Finance Lead',
      role: 'department_manager',
      department: 'Finance',
    },
  });
  assert.strictEqual(provDeptMgr.status, 201, 'Main manager provisions department manager');
  assert.strictEqual(provDeptMgr.data.account.role, 'department_manager');
  assert.strictEqual(provDeptMgr.data.account.department, 'Finance');
  assert.ok(provDeptMgr.data.account.must_change_password, 'New account requires password change');
  assert.strictEqual(provDeptMgr.data.account.password, undefined, 'Plaintext password not in response');

  // Verify temporary password email
  const outbox1 = mailer.getOutbox();
  const sentMail = outbox1.find(m => m.to === 'finance.lead@company.com');
  assert.ok(sentMail, 'Temporary password sent to new manager email');
  assert.ok(sentMail.tempPassword, 'Temporary password generated in mail');

  // Manager completes first-login password change requirement
  await accountStore.updateAccount(provDeptMgr.data.account.id, {
    must_change_password: false,
  });

  // 2. Department Manager provisions a Support Executive for Finance
  const deptMgrAccount = accountStore.findByEmail('finance.lead@company.com');
  const deptMgrToken = tokens.signToken(deptMgrAccount);

  const provSupport = await fetchApi('/api/admin/accounts', {
    method: 'POST',
    token: deptMgrToken,
    body: {
      email: 'finance.agent1@company.com',
      name: 'Finance Agent 1',
      role: 'support_executive',
      tier: 'L2',
      skill_tags: ['Billing', 'Invoicing'],
    },
  });
  assert.strictEqual(provSupport.status, 201, 'Department manager provisions support executive');
  assert.strictEqual(provSupport.data.account.department, 'Finance', 'Auto-assigned to manager department');
  assert.strictEqual(provSupport.data.account.tier, 'L2');

  // 3. Department Manager CANNOT provision an account for another department or create another manager
  const crossDeptProv = await fetchApi('/api/admin/accounts', {
    method: 'POST',
    token: deptMgrToken,
    body: {
      email: 'it.agent@company.com',
      name: 'IT Agent',
      role: 'department_manager',
      department: 'IT',
    },
  });
  assert.strictEqual(crossDeptProv.status, 403, 'Dept manager cannot provision manager role');
});

test('PS18-15: Grep repo confirms zero hardcoded demo names/emails or switcher components outside docs', () => {
  const rootDir = path.resolve(__dirname, '../..');

  // Strings split to prevent self-matching
  const forbiddenPatterns = [
    'Aa' + 'rav Sharma',
    'Ra' + 'vi Teja',
    'Dr. Ra' + 'jeshwar Sen',
    'Mal' + 'ini Swaminathan',
    'Col. San' + 'jeev Bakshi',
    'Switch' + ' Identity',
    'Switch' + ' Persona',
    'Switch' + ' View',
    'switch' + 'ToAgentView',
    'switch' + 'ToManagerView',
    'switch' + 'ToEmployeeView',
  ];

  const violations = [];

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      // Skip documentation, tests, git, node_modules, and binary/runtime dirs
      if (
        ent.name.startsWith('.') ||
        ent.name === 'node_modules' ||
        ent.name === 'docs' ||
        ent.name === 'PLANS' ||
        ent.name === 'runtime' ||
        ent.name === '__pycache__' ||
        ent.name === 'department_model' ||
        ent.name === 'multi_intent_model' ||
        ent.name.endsWith('.md') ||
        ent.name.endsWith('.pdf') ||
        ent.name.endsWith('.png') ||
        ent.name.endsWith('.jpg') ||
        ent.name.endsWith('.bin') ||
        ent.name.endsWith('.safetensors') ||
        ent.name.endsWith('.pt') ||
        ent.name.endsWith('.pth') ||
        ent.name.endsWith('.onnx') ||
        relPath.startsWith('backend/tests')
      ) {
        continue;
      }

      if (ent.isDirectory()) {
        scanDir(fullPath);
      } else if (ent.isFile()) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const pat of forbiddenPatterns) {
          if (content.includes(pat)) {
            violations.push({ file: relPath, pattern: pat });
          }
        }
      }
    }
  }

  scanDir(rootDir);

  assert.strictEqual(
    violations.length,
    0,
    `Found hardcoded demo identities or switcher patterns in codebase: ${JSON.stringify(violations, null, 2)}`
  );
});
