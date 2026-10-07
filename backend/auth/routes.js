// Authentication router handling login, logout, password resets, and sessions
const express = require('express');
const router = express.Router();
const accountStore = require('./accountStore');
const { verifyPassword, validatePasswordStrength, isPasswordInHistory } = require('./passwords');
const lockout = require('./lockout');
const { signToken } = require('./tokens');
const { SESSION_COOKIE_NAME, isProd, DEMO_MODE } = require('./config');
const { getRoleRedirect } = require('./roles');
const { authenticate } = require('./middleware');
const mailer = require('./mailer');
const { DEMO_ACCOUNTS, publicDemoAccount } = require('../data/demo-accounts');

// ─── Presentation demo access ────────────────────────────────
// No password is sent to the browser. These routes do not exist in production.
router.get('/demo-accounts', (req, res) => {
  if (!DEMO_MODE) return res.status(404).json({ error: 'not_found' });
  const accounts = DEMO_ACCOUNTS.map(definition => {
    const account = accountStore.findByEmail(definition.email);
    return account?.active ? publicDemoAccount(definition, account) : null;
  }).filter(Boolean);
  return res.json({ demoMode: true, accounts });
});

router.post('/demo-login', async (req, res) => {
  if (!DEMO_MODE) return res.status(404).json({ error: 'not_found' });
  const definition = DEMO_ACCOUNTS.find(item => item.key === req.body?.key);
  const account = definition ? accountStore.findByEmail(definition.email) : null;
  if (!account || !account.active) {
    return res.status(404).json({ error: 'demo_account_unavailable', message: 'This demo account is unavailable' });
  }

  lockout.recordSuccess(account.email);
  await accountStore.updateAccount(account.id, { last_login_at: new Date().toISOString() });
  const token = signToken(account);
  const redirect = getRoleRedirect(account.role);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 8 * 3600 * 1000,
  });
  return res.status(200).json({
    user: accountStore.toPublic(account),
    token,
    redirect,
    must_change_password: false,
    demo: true,
  });
});

// ─── Login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'missing_fields', message: 'Email and password are required' });
  }

  // Check IT-1.5 Account Lockout
  const lockStatus = lockout.isLocked(email);
  if (lockStatus.locked) {
    const minutesLeft = Math.ceil(lockStatus.remainingMs / 60000);
    return res.status(423).json({
      error: 'account_locked',
      message: `Account is locked due to 5 failed attempts (IT-1.5 policy). Try again in ${minutesLeft} minutes.`,
      lockedUntil: lockStatus.lockedUntil,
    });
  }

  const account = accountStore.findByEmail(email);

  // Timing-safe password verification (verifies dummy hash if account not found)
  const passwordValid = await verifyPassword(password, account ? account.password_hash : null);

  if (!account || !account.active || !passwordValid) {
    lockout.recordFailure(email);
    return res.status(401).json({
      error: 'invalid_credentials',
      message: 'Invalid email or password',
    });
  }

  // Login successful -> clear lockout counter
  lockout.recordSuccess(email);

  await accountStore.updateAccount(account.id, {
    last_login_at: new Date().toISOString(),
  });

  const token = signToken(account);
  const redirect = getRoleRedirect(account.role);

  // Set HttpOnly secure session cookie
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 8 * 3600 * 1000,
  });

  return res.status(200).json({
    user: accountStore.toPublic(account),
    token,
    redirect,
    must_change_password: account.must_change_password,
  });
});

// ─── Sign Up / Register ─────────────────────────────────────────
router.post('/signup', async (req, res) => {
  return res.status(403).json({ error: 'provisioning_required', message: 'Ask your company administrator to provision your account.' });
  const { email, password, name, department, role, tier } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'missing_fields', message: 'Name, email, and password are required' });
  }

  if (!email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'invalid_email', message: 'Please provide a valid email address' });
  }

  const existing = accountStore.findByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'email_exists', message: 'An account with this email already exists' });
  }

  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    return res.status(400).json({
      error: 'weak_password',
      message: `Password does not meet enterprise requirements: ${strength.error}`,
      reasons: [strength.error],
    });
  }

  const assignedRole = role || 'employee';
  const assignedDept = assignedRole === 'main_manager' ? 'All' : (department || 'IT');

  const newAccount = await accountStore.createAccount({
    email,
    name,
    role: assignedRole,
    department: assignedDept,
    tier: tier || (assignedRole === 'support_executive' ? 'L1' : undefined),
    password,
    active: true,
    must_change_password: false,
  });

  // Sync to runtime state if server is active
  const runtimeState = req.app && typeof req.app.get === 'function' ? req.app.get('state') : null;
  if (runtimeState) {
    if (newAccount.role === 'support_executive') {
      runtimeState.employees.push({
        id: newAccount.id,
        name: newAccount.name,
        email: newAccount.email,
        department: newAccount.department,
        tier: newAccount.tier || 'L1',
        skill_tags: newAccount.skill_tags || [],
        status: 'online',
        current_load: 0,
        rolling_score: 90.0,
        tenure: 1.0,
        certifications: [],
        avatar: '🧑‍💻',
        tickets_resolved: 0,
      });
      if (runtimeState.onlineEmployees) {
        runtimeState.onlineEmployees.add(newAccount.id);
      }
    } else if (newAccount.role === 'department_manager') {
      runtimeState.managers.push({
        id: newAccount.id,
        name: newAccount.name,
        department: newAccount.department,
        email: newAccount.email,
        avatar: '👨‍💼',
        employee_ids: [],
      });
    } else if (newAccount.role === 'employee') {
      runtimeState.users.push({
        id: newAccount.id,
        name: newAccount.name,
        email: newAccount.email,
        role: 'user',
        department: newAccount.department,
        avatar: '👤',
      });
    }
  }

  const token = signToken(newAccount);
  const redirect = getRoleRedirect(newAccount.role);

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 8 * 3600 * 1000,
  });

  return res.status(201).json({
    user: accountStore.toPublic(newAccount),
    token,
    redirect,
    message: 'Account created successfully',
  });
});

// ─── Logout ───────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME);
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// ─── Current User ─────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  res.json({
    user: req.user,
    redirect: getRoleRedirect(req.user.role),
  });
});

// ─── Change Password (First-login or settings) ────────────────
router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'missing_fields', message: 'Current and new password are required' });
  }

  const account = req.account;
  const isCurrentValid = await verifyPassword(currentPassword, account.password_hash);
  if (!isCurrentValid) {
    return res.status(401).json({ error: 'invalid_current_password', message: 'Current password is incorrect' });
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    return res.status(400).json({ error: 'weak_password', message: strength.error });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'same_password', message: 'New password cannot be identical to current password' });
  }

  const inHistory = await isPasswordInHistory(newPassword, account.password_history);
  if (inHistory) {
    return res.status(400).json({ error: 'password_in_history', message: 'Cannot reuse any of your last 10 passwords' });
  }

  const updatedAccount = await accountStore.updateAccount(account.id, {
    password: newPassword,
    must_change_password: false,
  });

  const newToken = signToken(updatedAccount);
  res.cookie(SESSION_COOKIE_NAME, newToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 8 * 3600 * 1000,
  });

  return res.status(200).json({
    success: true,
    message: 'Password changed successfully',
    token: newToken,
  });
});

// ─── Forgot Password (Request Link) ───────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'missing_email', message: 'Email is required' });
  }

  const account = accountStore.findByEmail(email);
  if (account && account.active) {
    const rawToken = accountStore.createResetToken(account.email);
    await mailer.sendPasswordResetLink({
      to: account.email,
      resetToken: rawToken,
    });
  }

  // Generic 202 response to prevent email enumeration
  return res.status(202).json({
    message: 'If an account exists with that email, a password reset link has been sent.',
  });
});

// ─── Reset Password (Confirm with Token) ──────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'missing_fields', message: 'Token and new password are required' });
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    return res.status(400).json({ error: 'weak_password', message: strength.error });
  }

  const account = accountStore.verifyResetToken(token);
  if (!account) {
    return res.status(400).json({
      error: 'invalid_or_expired_token',
      message: 'Password reset token is invalid or has expired',
    });
  }

  const inHistory = await isPasswordInHistory(newPassword, account.password_history);
  if (inHistory) {
    return res.status(400).json({
      error: 'password_in_history',
      message: 'Cannot reuse any of your last 10 passwords',
    });
  }

  // Consume token so it cannot be used again
  accountStore.consumeResetToken(token);

  await accountStore.updateAccount(account.id, {
    password: newPassword,
    must_change_password: false,
  });

  return res.status(200).json({
    success: true,
    message: 'Password has been reset successfully. You may now log in with your new password.',
  });
});

module.exports = router;
