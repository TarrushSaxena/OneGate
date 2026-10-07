// Admin router for account provisioning and roster management
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const accountStore = require('../auth/accountStore');
const { ROLES, isManager } = require('../auth/roles');
const { isValidDepartment } = require('../auth/departments');
const { authenticate, requireRoles } = require('../auth/middleware');
const mailer = require('../auth/mailer');
const auditService = require('../services/audit');
const tierEngine = require('../services/tierEngine');
const routingExport = require('../services/routingExport');

router.use(authenticate);
router.use(requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER));

function generateTemporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const specials = '!@#$%&*';

  let pass = '';
  pass += chars[crypto.randomInt(chars.length)];
  pass += chars[crypto.randomInt(chars.length)];
  pass += lower[crypto.randomInt(lower.length)];
  pass += lower[crypto.randomInt(lower.length)];
  pass += digits[crypto.randomInt(digits.length)];
  pass += digits[crypto.randomInt(digits.length)];
  pass += specials[crypto.randomInt(specials.length)];
  pass += specials[crypto.randomInt(specials.length)];

  // Fill up to 14 characters
  const all = chars + lower + digits + specials;
  while (pass.length < 14) {
    pass += all[crypto.randomInt(all.length)];
  }
  return pass;
}

// ─── List Accounts ────────────────────────────────────────────
router.get('/accounts', (req, res) => {
  const { role, department } = req.query;
  const isMain = req.user.role === ROLES.MAIN_MANAGER;

  let targetDept = department;
  if (!isMain) {
    // Hard-scoped to manager's own department
    targetDept = req.user.department;
  }

  const accounts = accountStore.listAccounts({
    role,
    department: targetDept,
  });

  return res.json({
    accounts: accounts.map(a => accountStore.toPublic(a)),
  });
});

// ─── Provision Account ────────────────────────────────────────
router.post('/accounts', async (req, res) => {
  const { email, name, role, department, tier, skill_tags } = req.body || {};
  const isMain = req.user.role === ROLES.MAIN_MANAGER;

  if (!email || !name || !role) {
    return res.status(400).json({ error: 'missing_fields', message: 'Email, name, and role are required' });
  }

  // Role permissions check
  if (!isMain) {
    // Department manager cannot create main_manager or other department_manager
    if (role === ROLES.MAIN_MANAGER || role === ROLES.DEPARTMENT_MANAGER) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Department Managers cannot provision other Manager accounts',
      });
    }
  } else {
    // Main manager cannot create another main_manager through API (bootstrap only)
    if (role === ROLES.MAIN_MANAGER) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Main Manager accounts cannot be provisioned via API (bootstrap/seed only)',
      });
    }
  }

  // Department assignment check
  let assignedDept = department;
  if (!isMain) {
    // Dept manager can ONLY provision for their own department
    assignedDept = req.user.department;
  } else {
    if (!assignedDept || !isValidDepartment(assignedDept)) {
      return res.status(400).json({ error: 'invalid_department', message: `Invalid department: ${assignedDept}` });
    }
  }

  // Support executive tier check
  let assignedTier = null;
  if (role === ROLES.SUPPORT_EXECUTIVE) {
    assignedTier = tier || 'L1';
    if (!['L1', 'L2', 'L3'].includes(assignedTier)) {
      return res.status(400).json({ error: 'invalid_tier', message: 'Support Executive tier must be L1, L2, or L3' });
    }
  }

  const tempPassword = generateTemporaryPassword();

  try {
    const newAccount = await accountStore.createAccount({
      email,
      name,
      role,
      department: assignedDept,
      tier: assignedTier,
      skill_tags: Array.isArray(skill_tags) ? skill_tags : [],
      password: tempPassword,
      must_change_password: true,
      created_by: req.user.id,
      active: true,
    });

    // Send temporary password securely via mailer (NEVER returned in API response)
    await mailer.sendTemporaryPassword({
      to: newAccount.email,
      name: newAccount.name,
      tempPassword,
    });

    return res.status(201).json({
      success: true,
      account: accountStore.toPublic(newAccount),
      message: 'Account provisioned successfully. Temporary credentials delivered to user email.',
    });
  } catch (err) {
    return res.status(400).json({
      error: 'provision_failed',
      message: err.message,
    });
  }
});

// ─── Query Outbox Delivery Receipts ───────────────────────────
router.get('/outbox', (req, res) => {
  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  const messages = mailer.getOutbox();
  return res.json({
    total: messages.length,
    messages: messages.slice(-20).reverse(),
  });
});

// ─── Query Audit Logs (USP-6) ─────────────────────────────────
router.get('/audit', (req, res) => {
  const isMain = req.user.role === ROLES.MAIN_MANAGER;
  const { action, target_type, target_id, actor_id, date_from, date_to, limit, offset, department } = req.query;

  let targetDept = department;
  if (!isMain) {
    // Scoped strictly to Department Manager's department
    targetDept = req.user.department;
  }

  const result = auditService.queryAuditLogs({
    action,
    target_type,
    target_id,
    actor_id,
    department: targetDept,
    date_from,
    date_to,
    limit,
    offset,
  });

  return res.json(result);
});

// ─── Export Routing Training Dataset (USP-5) ──────────────────
router.get('/routing/export', (req, res) => {
  const state = req.app.get('state') || { routingLogs: [], conversations: {} };
  const exportPayload = routingExport.exportRoutingTrainingData(state.routingLogs || [], state.conversations || {});
  return res.json(exportPayload);
});

// ─── Routing & Operations Analytics (USP-5 & Dashboard) ───────
router.get('/analytics/routing', (req, res) => {
  const state = req.app.get('state') || { tickets: [], routingLogs: [] };
  const analytics = routingExport.computeRoutingAnalytics(state.tickets || [], state.routingLogs || []);
  return res.json(analytics);
});

// ─── Multi-Cycle Tier Recalculation (USP-4) ───────────────────
router.post('/tiers/evaluate', (req, res) => {
  const state = req.app.get('state') || { employees: [] };
  const evaluations = tierEngine.runTierRecalculationCycle(state.employees || [], {
    actor_id: req.user?.id || 'admin',
    actor_name: req.user?.name || 'Administrator',
  });
  return res.json({
    success: true,
    total_evaluated: evaluations.length,
    promotions: evaluations.filter(e => e.action === 'promoted').length,
    demotions: evaluations.filter(e => e.action === 'demoted').length,
    evaluations,
  });
});

module.exports = router;
