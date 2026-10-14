// ============================================================
// OneGate SME — Autopilot: the agent works without being asked
// On a schedule (daily by default) or on demand, for each SME:
//   1. re-forecast cash and read new alerts
//   2. pay bills that fall inside an owner-signed spending mandate
//      (everything else is escalated as an approval card)
//   3. if a cash gap is coming, run the multi-step gap planner, which
//      queues reminders and a financing application for approval
//   4. otherwise queue reminders for badly overdue, high-risk invoices
//   5. write a morning brief the owner reads in the dashboard
// The autopilot acts as its own identity (sme_role "agent"): it can never
// approve, never touch DENY actions, and the owner can pause it instantly.
// ============================================================
const { getTenant, getTenants } = require('./data/sandbox');
const { forecast } = require('./forecast');
const { receivables } = require('./receivables');
const actions = require('./actions');
const audit = require('./auditChain');
const mandates = require('./mandates');
const agent = require('./agent');

const AGENT_ACTOR = Object.freeze({ id: 'agent:autopilot', sme_role: 'agent', name: 'OneGate Autopilot' });
const state = new Map(); // tenantId -> { paused, runs: [] }
const st = (t) => { if (!state.has(t)) state.set(t, { paused: false, runs: [] }); return state.get(t); };
const fmt = (n) => `${n < 0 ? '-' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;

function setPaused(tenantId, actor, paused) {
  if (actor.sme_role !== 'owner') return { error: 'owner_only', status: 403 };
  st(tenantId).paused = !!paused;
  audit.append(tenantId, { actor, action: paused ? 'autopilot.paused' : 'autopilot.resumed', tier: 'SUGGEST', decision: 'allow' });
  return { paused: !!paused };
}

function status(tenantId) {
  const s = st(tenantId);
  return { paused: s.paused, last_run: s.runs[0] || null, runs: s.runs.slice(0, 10), mandates: mandates.list(tenantId), interval_min: intervalMin() };
}

function runFor(tenantId, { trigger = 'manual', by = null } = {}) {
  const s = st(tenantId);
  const tenant = getTenant(tenantId);
  if (s.paused) {
    audit.append(tenantId, { actor: AGENT_ACTOR, action: 'autopilot.skipped_paused', tier: 'SUGGEST', decision: 'deny' });
    return { skipped: 'paused' };
  }
  const started = new Date().toISOString();
  audit.append(tenantId, { actor: AGENT_ACTOR, action: 'autopilot.run_started', tier: 'SUGGEST', decision: 'allow', metadata: { trigger, requested_by: by ? by.id : null } });
  const events = [];

  // 1. Forecast
  const f = forecast(tenant, { horizon: 45 });
  events.push({ kind: 'forecast', text: `Cash today ${fmt(f.starting_balance)}; 30-day base ${fmt(f.horizons[0].base)}.` + (f.alerts.length ? ` Alert: ${f.alerts[0].message}` : ' No buffer breach in 45 days.') });

  // 2. Mandate payments
  for (const bill of tenant.payables.filter((b) => b.status === 'open')) {
    const r = mandates.tryPayBill({ tenantId, agentActor: AGENT_ACTOR, bill });
    if (r.outcome === 'paid') events.push({ kind: 'paid', text: `Paid ${fmt(bill.amount)} to ${bill.supplier} under mandate ${r.mandate_id} (receipt ${r.action.receipt.reference}).`, action_id: r.action.id });
    if (r.outcome === 'escalate') {
      const ben = tenant.beneficiaries.find((b) => b.name === bill.supplier);
      const p = ben && actions.propose({ tenantId, actor: AGENT_ACTOR, type: 'schedule_payment', params: { amount: bill.amount, beneficiary_id: ben.id, bill_id: bill.id, date: bill.due }, source: 'autopilot', idempotencyKey: `autopilot:pay:${bill.id}` });
      events.push({ kind: 'escalated', text: `Did not auto-pay ${bill.supplier} ${fmt(bill.amount)}: ${r.reasons.join(', ').replace(/_/g, ' ')}. Sent to you for approval.`, action_id: p?.action?.id });
    }
  }

  // 3/4. Gap plan or routine collections
  let plan = null;
  if (f.alerts.some((a) => a.type === 'buffer_breach' || a.type === 'negative_balance')) {
    plan = agent.planCashGap({ tenantId, actorOverride: true, actor: AGENT_ACTOR, horizonDays: 45 });
    events.push({ kind: 'plan', text: plan.reply });
  } else {
    const r = receivables(tenant);
    const due = r.top_overdue.filter((x) => x.days_overdue > 30 && x.risk_score >= 60).slice(0, 2);
    for (const x of due) {
      const p = actions.propose({ tenantId, actor: AGENT_ACTOR, type: 'send_reminder', params: { invoice_id: x.invoice }, source: 'autopilot', idempotencyKey: `agent:send_reminder:${x.invoice}:${tenant.profile.as_of}` });
      if (!p.denied) events.push({ kind: 'reminder', text: `Drafted a ${p.action.preview?.tone || ''} reminder for ${x.invoice} (${x.customer}, ${x.days_overdue} days late). Waiting for your approval.`, action_id: p.action.id });
    }
  }

  const pendingCount = actions.list(tenantId).filter((a) => a.status === 'pending_approval').length;
  const brief = {
    id: `run_${Date.now().toString(36)}`, trigger, started, finished: new Date().toISOString(),
    headline: plan && plan.gap ? `Cash gap of ${fmt(plan.gap)} ahead. I've built a plan.` : events.some((e) => e.kind === 'paid') ? 'Bills paid within your mandate. Cash is on track.' : 'Cash is on track.',
    events, pending_approvals: pendingCount, plan_steps: plan ? plan.steps.map((s) => s.tool) : [],
  };
  s.runs.unshift(brief); s.runs.length = Math.min(s.runs.length, 20);
  audit.append(tenantId, { actor: AGENT_ACTOR, action: 'autopilot.run_finished', tier: 'SUGGEST', decision: 'allow', metadata: { events: events.map((e) => e.kind), pending_approvals: pendingCount } });
  return { brief };
}

// ---------------- Scheduler ----------------
let timer = null;
function intervalMin() { const v = process.env.SME_AUTOPILOT_INTERVAL_MIN; return v === undefined ? 1440 : Number(v); }
function runAll(trigger = 'schedule') { return Object.keys(getTenants()).map((id) => ({ tenant_id: id, ...runFor(id, { trigger }) })); }
function start() {
  const m = intervalMin();
  if (timer || !(m > 0) || process.env.NODE_ENV === 'test') return false;
  timer = setInterval(() => { try { runAll('schedule'); } catch (e) { console.error('[SME autopilot]', e.message); } }, m * 60 * 1000);
  timer.unref?.();
  // First brief shortly after boot so the dashboard is never empty.
  setTimeout(() => { try { runAll('boot'); } catch (e) { console.error('[SME autopilot]', e.message); } }, 1500).unref?.();
  return true;
}
function stop() { if (timer) clearInterval(timer); timer = null; }
function resetForTests() { state.clear(); }

module.exports = { AGENT_ACTOR, runFor, runAll, status, setPaused, start, stop, resetForTests };
