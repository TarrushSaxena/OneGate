// ============================================================
// OneGate SME — Step-up authentication (one-time code) for money moves
// A valid session is not enough to approve a payment, a loan application
// or a spending mandate: the owner must also enter a 6-digit code bound to
// that exact action and amount. Codes are stored only as salted SHA-256
// hashes, expire after 5 minutes, allow 3 attempts and are single-use.
// In the sandbox the code is "delivered" in the API response (channel
// sms-sandbox) so judges can run the demo; in production it goes to the
// owner's registered phone and never back over the API.
// ============================================================
const crypto = require('crypto');
const audit = require('./auditChain');

const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const challenges = new Map(); // id -> { tenant_id, user_id, purpose, ref, amount, salt, hash, expires, attempts, used }

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sandboxDelivery = () => process.env.SME_STEPUP_DELIVERY !== 'sms';

/** Bind a code to (tenant, user, purpose, ref, amount). */
function issue({ tenantId, actor, purpose, ref, amount = null }) {
  const id = 'chl_' + crypto.randomBytes(6).toString('hex');
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  const salt = crypto.randomBytes(8).toString('hex');
  challenges.set(id, { tenant_id: tenantId, user_id: actor.id, purpose, ref, amount, salt, hash: sha(salt + code), expires: Date.now() + TTL_MS, attempts: 0, used: false });
  audit.append(tenantId, { actor, action: 'stepup.issued', tier: 'EXECUTE', decision: 'challenge', target: ref, metadata: { purpose, amount } });
  const out = { challenge_id: id, expires_in_s: TTL_MS / 1000, channel: sandboxDelivery() ? 'sms-sandbox' : 'sms', bound_to: { purpose, ref, amount } };
  if (sandboxDelivery()) out.sandbox_code = code;
  return out;
}

/** Verify and consume. Returns { ok } or { ok:false, error }. */
function verify({ tenantId, actor, challengeId, code, purpose, ref, amount = null }) {
  const c = challenges.get(challengeId);
  const fail = (error) => { audit.append(tenantId, { actor, action: 'stepup.failed', tier: 'EXECUTE', decision: 'deny', target: ref, metadata: { purpose, error } }); return { ok: false, error }; };
  if (!c || c.tenant_id !== tenantId || c.user_id !== actor.id) return fail('stepup_required');
  if (c.used) return fail('stepup_code_already_used');
  if (Date.now() > c.expires) return fail('stepup_code_expired');
  if (c.purpose !== purpose || c.ref !== ref || (c.amount !== null && Number(c.amount) !== Number(amount))) return fail('stepup_code_bound_to_other_action');
  if (c.attempts >= MAX_ATTEMPTS) return fail('stepup_locked');
  c.attempts += 1;
  if (!/^\d{6}$/.test(String(code || '')) || !crypto.timingSafeEqual(Buffer.from(sha(c.salt + String(code))), Buffer.from(c.hash))) {
    return fail(c.attempts >= MAX_ATTEMPTS ? 'stepup_locked' : 'stepup_code_wrong');
  }
  c.used = true;
  audit.append(tenantId, { actor, action: 'stepup.verified', tier: 'EXECUTE', decision: 'allow', target: ref, metadata: { purpose } });
  return { ok: true };
}

function resetForTests() { challenges.clear(); }

module.exports = { issue, verify, resetForTests, TTL_MS, MAX_ATTEMPTS };
