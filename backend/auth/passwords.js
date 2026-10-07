// Password hashing, verification, strength enforcement, and history checks
const bcrypt = require('bcryptjs');
const { BCRYPT_ROUNDS } = require('./config');

// Precomputed dummy hash for timing-attack resistance on non-existent accounts
const DUMMY_HASH = bcrypt.hashSync('dummy-timing-defense-password-12345', 4);

function validatePasswordStrength(password) {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password must be a string' };
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return { valid: false, error: 'Password must not exceed 72 bytes' };
  }
  if (password.length < 12) {
    return { valid: false, error: 'Password must be at least 12 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must include at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must include at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must include at least one number' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    return { valid: false, error: 'Password must include at least one special character' };
  }
  return { valid: true };
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  if (!hash) {
    // Perform dummy compare to equalize timing
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}

async function isPasswordInHistory(password, history = []) {
  for (const oldHash of history) {
    const match = await bcrypt.compare(password, oldHash);
    if (match) return true;
  }
  return false;
}

module.exports = {
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  isPasswordInHistory,
};
