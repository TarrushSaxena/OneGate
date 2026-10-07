// Authentication and authorization middlewares
const { verifyToken, parseCookie } = require('./tokens');
const { SESSION_COOKIE_NAME } = require('./config');
const accountStore = require('./accountStore');
const { ROLES } = require('./roles');

async function authenticate(req, res, next) {
  let token = null;

  // 1. Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. Check HttpOnly cookie
  if (!token && req.headers['cookie']) {
    token = parseCookie(req.headers['cookie'], SESSION_COOKIE_NAME);
  }

  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token', message: 'Token is invalid or expired' });
  }

  const account = accountStore.findById(decoded.sub);
  if (!account || !account.active) {
    return res.status(401).json({ error: 'unauthorized', message: 'User account not active or not found' });
  }

  // Verify token version matches (invalidates tokens on password change / revocation)
  if (account.token_version !== decoded.tv) {
    return res.status(401).json({ error: 'token_revoked', message: 'Session has been invalidated. Please log in again.' });
  }

  // Enforce server-side role and department truth
  if (account.role !== decoded.role || account.department !== decoded.dept) {
    return res.status(401).json({ error: 'token_mismatch', message: 'Session claims mismatch server account records' });
  }

  // Check must_change_password gating
  if (account.must_change_password) {
    const allowedPaths = ['/api/auth/me', '/api/auth/change-password', '/api/auth/logout'];
    if (!allowedPaths.includes(req.baseUrl + req.path) && !allowedPaths.includes(req.path)) {
      return res.status(403).json({
        error: 'password_change_required',
        message: 'You must change your temporary password before proceeding.',
      });
    }
  }

  req.user = accountStore.toPublic(account);
  req.account = account;
  next();
}

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Role "${req.user.role}" does not have permission to access this resource`,
      });
    }
    next();
  };
}

function requireSameDepartmentOrMainManager() {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    }
    if (req.user.role === ROLES.MAIN_MANAGER) {
      return next();
    }
    const targetDept = req.params.department || req.params.departmentId || req.query.department || req.body?.department;
    if (targetDept && targetDept !== req.user.department) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Cannot access or modify data for another department',
      });
    }
    next();
  };
}

module.exports = {
  authenticate,
  requireRoles,
  requireSameDepartmentOrMainManager,
};
