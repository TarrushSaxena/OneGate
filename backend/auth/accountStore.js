// Account store with file/in-memory persistence and reset token management
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { ACCOUNTS_FILE, RESET_TOKEN_EXPIRY_MS } = require('./config');
const { hashPassword, validatePasswordStrength } = require('./passwords');

let memoryAccounts = new Map(); // id -> account
let memoryResetTokens = new Map(); // tokenHash -> { email, expiresAt, used }

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function loadAccountsFromFile() {
  if (ACCOUNTS_FILE === ':memory:') return;
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
      memoryAccounts.clear();
      for (const acct of data) {
        memoryAccounts.set(acct.id, acct);
      }
    }
  } catch (err) {
    console.error('[AccountStore] Error loading accounts file:', err.message);
  }
}

function persistAccountsToFile() {
  if (ACCOUNTS_FILE === ':memory:') return;
  try {
    const dir = path.dirname(ACCOUNTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const list = Array.from(memoryAccounts.values());
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[AccountStore] Error saving accounts file:', err.message);
  }
}

loadAccountsFromFile();

function toPublic(account) {
  if (!account) return null;
  const { password_hash, password_history, ...safe } = account;
  return safe;
}

function findById(id) {
  return memoryAccounts.get(id) || null;
}

function findByEmail(email) {
  const norm = normalizeEmail(email);
  for (const acct of memoryAccounts.values()) {
    if (normalizeEmail(acct.email) === norm) {
      return acct;
    }
  }
  return null;
}

async function createAccount(data) {
  const normEmail = normalizeEmail(data.email);
  if (!normEmail) throw new Error('Email is required');
  if (findByEmail(normEmail)) {
    throw new Error(`Account already exists with email: ${normEmail}`);
  }

  let passHash = data.password_hash;
  if (!passHash && data.password) {
    const strength = validatePasswordStrength(data.password);
    if (!strength.valid) {
      throw new Error(strength.error);
    }
    passHash = await hashPassword(data.password);
  }

  const id = data.id || `acct-${uuidv4().substring(0, 8)}`;
  const now = new Date().toISOString();

  const account = {
    id,
    email: normEmail,
    name: data.name || normEmail.split('@')[0],
    role: data.role || 'employee',
    department: data.department || 'IT',
    tier: data.tier || (data.role === 'support_executive' ? 'L1' : null),
    skill_tags: Array.isArray(data.skill_tags) ? data.skill_tags : [],
    password_hash: passHash,
    password_history: passHash ? [passHash] : [],
    must_change_password: Boolean(data.must_change_password),
    token_version: 1,
    active: data.active !== false,
    created_at: now,
    created_by: data.created_by || 'system',
    last_login_at: null,
    current_load: data.current_load || 0,
    status: data.status || 'online',
    rolling_score: typeof data.rolling_score === 'number' ? data.rolling_score : 4.8,
  };

  memoryAccounts.set(id, account);
  persistAccountsToFile();
  return account;
}

async function updateAccount(id, updates) {
  const acct = findById(id);
  if (!acct) return null;

  if (updates.password) {
    const strength = validatePasswordStrength(updates.password);
    if (!strength.valid) {
      throw new Error(strength.error);
    }
    const newHash = await hashPassword(updates.password);
    acct.password_hash = newHash;
    acct.password_history = [newHash, ...(acct.password_history || [])].slice(0, 10);
    acct.must_change_password = false;
    acct.token_version = (acct.token_version || 1) + 1;
  }

  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'password' && key !== 'id' && key !== 'email') {
      acct[key] = value;
    }
  }

  memoryAccounts.set(id, acct);
  persistAccountsToFile();
  return acct;
}

function listAccounts(filter = {}) {
  let list = Array.from(memoryAccounts.values());
  if (filter.role) {
    list = list.filter(a => a.role === filter.role);
  }
  if (filter.department) {
    list = list.filter(a => a.department === filter.department);
  }
  if (filter.active !== undefined) {
    list = list.filter(a => a.active === filter.active);
  }
  return list;
}

function deleteAccount(id) {
  const res = memoryAccounts.delete(id);
  if (res) persistAccountsToFile();
  return res;
}

function clearAll() {
  memoryAccounts.clear();
  memoryResetTokens.clear();
  persistAccountsToFile();
}

// ─── Password Reset Tokens ────────────────────────────────────
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function createResetToken(email) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = Date.now() + RESET_TOKEN_EXPIRY_MS;

  // Invalidate previous tokens for this email
  const norm = normalizeEmail(email);
  for (const [key, val] of memoryResetTokens.entries()) {
    if (val.email === norm) {
      memoryResetTokens.delete(key);
    }
  }

  memoryResetTokens.set(tokenHash, {
    email: norm,
    expiresAt,
    used: false,
  });

  return rawToken;
}

function verifyResetToken(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const record = memoryResetTokens.get(tokenHash);
  if (!record) return null;
  if (record.used) return null;
  if (Date.now() > record.expiresAt) {
    memoryResetTokens.delete(tokenHash);
    return null;
  }
  return findByEmail(record.email);
}

function consumeResetToken(rawToken) {
  if (!rawToken) return false;
  const tokenHash = hashToken(rawToken);
  const record = memoryResetTokens.get(tokenHash);
  if (!record || record.used) return false;
  record.used = true;
  memoryResetTokens.delete(tokenHash);
  return true;
}

module.exports = {
  findById,
  findByEmail,
  createAccount,
  updateAccount,
  listAccounts,
  deleteAccount,
  clearAll,
  toPublic,
  createResetToken,
  verifyResetToken,
  consumeResetToken,
};
