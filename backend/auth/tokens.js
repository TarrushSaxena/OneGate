// JWT token signing and verification with pinned algorithm
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { JWT_SECRET, TOKEN_TTL_SEC } = require('./config');

function signToken(account) {
  const payload = {
    sub: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    dept: account.department,
    tv: account.token_version || 1,
    jti: uuidv4(),
  };

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL_SEC,
  });
}

function verifyToken(token) {
  if (!token) throw new Error('Missing token');
  return jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
  });
}

function parseCookie(cookieString, name) {
  if (!cookieString) return null;
  const parts = cookieString.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.substring(0, idx).trim();
    const v = part.substring(idx + 1).trim();
    if (k === name) {
      try {
        return decodeURIComponent(v);
      } catch (_) {
        return v;
      }
    }
  }
  return null;
}

module.exports = {
  signToken,
  verifyToken,
  parseCookie,
};
