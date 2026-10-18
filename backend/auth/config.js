// PS18 Authentication & Security Configuration
const path = require('path');
const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Outside production, an unset JWT_SECRET gets a fresh random secret at every start, so no
// published default can be used to forge session tokens (sessions simply reset on restart).
// Set JWT_SECRET to keep sessions across restarts. Production refuses to start without one.
const JWT_SECRET_SOURCE = process.env.JWT_SECRET ? 'env' : 'random_per_process';
const JWT_SECRET = process.env.JWT_SECRET || (isProd
  ? (() => { throw new Error('JWT_SECRET environment variable is strictly required in production (min 32 chars)'); })()
  : crypto.randomBytes(48).toString('base64url'));

if (isProd && JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || (isTest ? 4 : 12);
if (isProd && BCRYPT_ROUNDS < 10) {
  throw new Error('BCRYPT_ROUNDS must be at least 10 in production');
}

// IT-1.5 Policy / IT Security §7.1: Lockout after 5 failed attempts in 15 minutes, 30-minute lockout
const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;       // 15 minutes
const LOCKOUT_DURATION_MS = 30 * 60 * 1000;     // 30 minutes

// Password reset token validity: 30 minutes
const RESET_TOKEN_EXPIRY_MS = 30 * 60 * 1000;

// Session TTL: 8 hours
const TOKEN_TTL_SEC = 8 * 3600;

const SESSION_COOKIE_NAME = 'ps18_session';
const COMPANY_EMAIL_DOMAIN = (process.env.COMPANY_EMAIL_DOMAIN || 'company.com').toLowerCase();

const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE || path.join(__dirname, '../data/runtime/accounts.json');
const DEMO_MODE = !isProd && process.env.DEMO_MODE !== 'false';

module.exports = {
  isProd,
  isTest,
  JWT_SECRET,
  JWT_SECRET_SOURCE,
  BCRYPT_ROUNDS,
  LOCKOUT_MAX_ATTEMPTS,
  LOCKOUT_WINDOW_MS,
  LOCKOUT_DURATION_MS,
  RESET_TOKEN_EXPIRY_MS,
  TOKEN_TTL_SEC,
  SESSION_COOKIE_NAME,
  COMPANY_EMAIL_DOMAIN,
  ACCOUNTS_FILE,
  DEMO_MODE,
};
