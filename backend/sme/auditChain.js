// ============================================================
// OneGate SME — Hash-chained, tenant-scoped audit trail
// Every entry stores sha256(prev_hash + canonical entry). Any edit
// or deletion breaks verification. Mirrors to the core audit service.
// ============================================================
const crypto = require('crypto');
const core = require('../services/audit');

const chains = new Map(); // tenant_id -> entries[]
const GENESIS = '0'.repeat(64);

function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function append(tenantId, { actor, action, tier, decision, target, metadata = {} }) {
  const chain = chains.get(tenantId) || [];
  const prev = chain.length ? chain[chain.length - 1].hash : GENESIS;
  const body = {
    seq: chain.length + 1,
    ts: new Date().toISOString(),
    tenant_id: tenantId,
    actor_id: actor ? String(actor.id) : 'system',
    actor_role: actor ? String(actor.sme_role || actor.role || 'unknown') : 'system',
    action: String(action),
    tier: tier || null,
    decision: decision || null,
    target: target || null,
    metadata: JSON.parse(JSON.stringify(metadata)),
    prev_hash: prev,
  };
  const entry = Object.freeze({ ...body, hash: sha(prev + canonical(body)) });
  chain.push(entry);
  chains.set(tenantId, chain);
  try {
    core.logAuditEvent({ actor, action: `sme.${action}`, target_type: 'sme_tenant', target_id: tenantId, department: 'Finance', metadata: { tier, decision, target } });
  } catch (_) { /* core audit is best-effort mirror */ }
  return entry;
}

function list(tenantId, limit = 200) {
  return (chains.get(tenantId) || []).slice(-limit);
}

function verifyEntries(chain) {
  let prev = GENESIS;
  for (const e of chain) {
    const { hash, ...body } = e;
    if (body.prev_hash !== prev || sha(prev + canonical(body)) !== hash) {
      return { valid: false, broken_at_seq: e.seq, entries: chain.length };
    }
    prev = hash;
  }
  return { valid: true, entries: chain.length, head: prev };
}
function verify(tenantId) { return verifyEntries(chains.get(tenantId) || []); }

// Tamper drill: edit one amount in a COPY of the chain and re-verify it.
// The live chain is never modified, so the drill itself is safe to run on stage.
function tamperDrill(tenantId) {
  const chain = chains.get(tenantId) || [];
  if (!chain.length) return { ran: false, reason: 'empty_chain' };
  const idx = Math.max(0, chain.findIndex((e) => e.metadata && Number(e.metadata.amount) > 0));
  const target = chain[idx];
  const before = target.metadata && Number(target.metadata.amount) > 0 ? Number(target.metadata.amount) : null;
  const copy = chain.map((e) => ({ ...e, metadata: JSON.parse(JSON.stringify(e.metadata)) }));
  if (before !== null) copy[idx].metadata.amount = before + 1; else copy[idx].action = `${copy[idx].action}.edited`;
  const tampered = verifyEntries(copy);
  return {
    ran: true,
    edited_seq: target.seq,
    edit: before !== null ? { field: 'metadata.amount', from: before, to: before + 1 } : { field: 'action', from: target.action, to: copy[idx].action },
    tampered_copy: tampered,
    recomputed_hash_prefix: sha(target.prev_hash + canonical((({ hash, ...b }) => b)(copy[idx]))).slice(0, 16),
    stored_hash_prefix: target.hash.slice(0, 16),
    live_chain: verify(tenantId),
  };
}

function _tamperForTests(tenantId, seq, patch) {
  const chain = chains.get(tenantId);
  chain[seq - 1] = { ...chain[seq - 1], ...patch };
}
function resetForTests() { chains.clear(); }

module.exports = { append, list, verify, tamperDrill, resetForTests, _tamperForTests };
