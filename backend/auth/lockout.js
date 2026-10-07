// Account lockout tracker enforcing IT-1.5 policy
// 5 failed attempts within 15 minutes triggers a 30-minute lockout.
const { LOCKOUT_MAX_ATTEMPTS, LOCKOUT_WINDOW_MS, LOCKOUT_DURATION_MS } = require('./config');

const attempts = new Map(); // normalizedEmail -> { count: number, firstAttemptAt: number, lockedUntil: number | null }

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isLocked(email) {
  const norm = normalizeEmail(email);
  const record = attempts.get(norm);
  if (!record) return { locked: false, remainingMs: 0 };

  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    return {
      locked: true,
      remainingMs: record.lockedUntil - now,
      lockedUntil: record.lockedUntil,
    };
  }

  // If lockout expired or window expired without locking, clean up or reset
  if (record.lockedUntil && now >= record.lockedUntil) {
    attempts.delete(norm);
    return { locked: false, remainingMs: 0 };
  }

  if (record.firstAttemptAt && (now - record.firstAttemptAt) > LOCKOUT_WINDOW_MS) {
    attempts.delete(norm);
    return { locked: false, remainingMs: 0 };
  }

  return { locked: false, remainingMs: 0 };
}

function recordFailure(email) {
  const norm = normalizeEmail(email);
  const now = Date.now();
  let record = attempts.get(norm);

  if (!record || (now - record.firstAttemptAt) > LOCKOUT_WINDOW_MS) {
    record = { count: 1, firstAttemptAt: now, lockedUntil: null };
  } else {
    record.count += 1;
  }

  if (record.count >= LOCKOUT_MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  attempts.set(norm, record);
  return record;
}

function recordSuccess(email) {
  const norm = normalizeEmail(email);
  attempts.delete(norm);
}

function reset(email) {
  if (email) {
    attempts.delete(normalizeEmail(email));
  } else {
    attempts.clear();
  }
}

module.exports = {
  isLocked,
  recordFailure,
  recordSuccess,
  reset,
};
