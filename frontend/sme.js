// OneGate SME dashboard: plain JS, talks only to /api/sme (tenant-scoped, cookie session).
(() => {
  const $ = (s) => document.querySelector(s);
  const inr = (n) => (n < 0 ? '-' : '') + '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let ME = null; let TID = null;

  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status, data });
    return data;
  }
  function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3500); }

  async function showLogin() {
    $('#login').hidden = false; $('#app').hidden = true; $('#who').innerHTML = '';
    try {
      const { accounts } = await api('/api/auth/demo-accounts');
      const sme = accounts.filter((a) => a.key.startsWith('sme-'));
      $('#demoList').innerHTML = sme.length ? sme.map((a) => `<button data-k="${esc(a.key)}">${esc(a.name)}<small>${esc(a.email)}</small></button>`).join('')
        : '<p class="muted">No SME demo accounts yet. Run <code>npm run provision:demo</code> in backend/.</p>';
      $('#demoList').onclick = async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        await api('/api/auth/demo-login', { method: 'POST', body: { key: b.dataset.k } });
        boot();
      };
    } catch { $('#demoList').innerHTML = '<p class="muted">Demo login is disabled. Sign in through the main OneGate login, then return here.</p>'; }
  }

  async function boot() {
    try { ME = await api('/api/sme/me'); } catch (e) { return showLogin(); }
    TID = ME.tenant_id;
    $('#login').hidden = true; $('#app').hidden = false;
    $('#who').innerHTML = `${esc(ME.tenant_name)} · <b>${esc(ME.sme_role)}</b> <button class="ghost" id="logout">Switch</button>`;
    $('#logout').onclick = async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {}); showLogin(); };
    $('#chat').innerHTML = ''; $('#trace').innerHTML = '';
    say('a', `Hi! I'm the OneGate copilot for ${ME.tenant_name}. I can read your books and draft things on my own. Anything that moves money or contacts customers waits for the owner's approval.`);
    await Promise.all([loadOverview(), loadForecast(), loadReceivables(), loadApprovals(), loadAudit(), runFin(), loadBrief(), loadMandates(), loadShare()]);
  }

  async function loadOverview() {
    const o = await api(`/api/sme/${TID}/overview`);
    const h = o.forecast.horizons;
    const k = [
      ['Cash today', inr(o.profile.current_balance), o.profile.sector, ''],
      ['30-day forecast', inr(h[0].base), `range ${inr(h[0].low)} to ${inr(h[0].high)}`, h[0].base < o.profile.current_balance ? 'warn' : 'good'],
      ['90-day forecast', inr(h[2].base), `lowest ${inr(o.forecast.lowest_point.low)} on ${o.forecast.lowest_point.date}`, h[2].low < 0 ? 'bad' : ''],
      ['Overdue receivables', inr(o.receivables.total_overdue), `of ${inr(o.receivables.total_open)} open`, 'warn'],
      ['Pending approvals', String(o.pending_approvals), ME.sme_role === 'owner' ? 'you can approve' : 'owner approves', o.pending_approvals ? 'warn' : ''],
    ];
    $('#kpis').innerHTML = k.map(([l, v, s, c]) => `<div class="kpi"><div class="l">${l}</div><div class="v ${c}">${v}</div><div class="s">${esc(s)}</div></div>`).join('');
  }

  async function loadForecast() {
    const f = await api(`/api/sme/${TID}/forecast?horizon=90`);
    $('#fcMeta').textContent = `as of ${f.as_of} · backtest MAPE ${f.backtest.mape_pct}% (30d)`;
    const W = 720, H = 240, P = 28, s = f.series;
    const vals = s.flatMap((p) => [p.low, p.high]).concat([f.safety_buffer, f.starting_balance, 0]);
    const min = Math.min(...vals), max = Math.max(...vals);
    const x = (i) => P + (i / (s.length - 1)) * (W - 2 * P);
    const y = (v) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
    const band = s.map((p, i) => `${x(i)},${y(p.high)}`).join(' ') + ' ' + s.map((p, i) => `${x(s.length - 1 - i)},${y(s[s.length - 1 - i].low)}`).join(' ');
    const base = s.map((p, i) => `${x(i)},${y(p.base)}`).join(' ');
    const ticks = [0, 29, 59, 89].map((i) => `<text x="${x(i)}" y="${H - 8}" fill="#8d9bc4" font-size="10" text-anchor="middle">${s[i].date.slice(5)}</text>`).join('');
    $('#chart').innerHTML = `
      <polygon points="${band}" fill="rgba(91,140,255,.18)" stroke="rgba(91,140,255,.5)" stroke-width="1"/>
      <line x1="${P}" x2="${W - P}" y1="${y(f.safety_buffer)}" y2="${y(f.safety_buffer)}" stroke="#f5b041" stroke-dasharray="5 4"/>
      ${min < 0 ? `<line x1="${P}" x2="${W - P}" y1="${y(0)}" y2="${y(0)}" stroke="#ff5d6c" stroke-width=".8"/>` : ''}
      <polyline points="${base}" fill="none" stroke="#5b8cff" stroke-width="2.2"/>
      <text x="${P}" y="16" fill="#8d9bc4" font-size="10">${inr(max)}</text><text x="${P}" y="${H - P - 4}" fill="#8d9bc4" font-size="10">${inr(min)}</text>${ticks}`;
    $('#alerts').innerHTML = f.alerts.map((a) => `<div class="alert ${a.severity === 'critical' ? 'critical' : ''}">⚠ ${esc(a.message)}</div>`).join('') || '<div class="muted" style="margin-top:8px">No buffer breach expected in the next 90 days.</div>';
  }

  async function loadReceivables() {
    const r = await api(`/api/sme/${TID}/receivables`);
    $('#arMeta').textContent = `${r.top_overdue.length} shown · ${inr(r.total_overdue)} overdue`;
    $('#ageing').innerHTML = Object.entries(r.ageing).map(([b, v]) => `<div>${b}<b>${inr(v)}</b></div>`).join('');
    const canDraft = ME.sme_role !== 'viewer';
    $('#arBody').innerHTML = r.top_overdue.map((i) => `<tr><td>${esc(i.invoice)}${i.untrusted_note?.flagged ? ' <span title="Note contained instructions aimed at the AI and was ignored" class="risk h">⚑</span>' : ''}</td><td>${esc(i.customer)}</td><td class="r">${inr(i.amount)}</td><td class="r">${i.days_overdue}</td><td class="r"><span class="risk ${i.risk_score >= 70 ? 'h' : i.risk_score >= 40 ? 'm' : 'l'}">${i.risk_score}</span></td><td class="r">${canDraft ? `<button class="ghost" data-inv="${esc(i.invoice)}">Remind</button>` : ''}</td></tr>`).join('');
    $('#arBody').onclick = async (e) => {
      const b = e.target.closest('button[data-inv]'); if (!b) return;
      try { await api(`/api/sme/${TID}/actions`, { method: 'POST', body: { type: 'send_reminder', params: { invoice_id: b.dataset.inv }, idempotency_key: `rem-${b.dataset.inv}` } }); toast('Reminder queued for owner approval'); loadApprovals(); loadAudit(); loadOverview(); }
      catch (err) { toast(`Not allowed: ${(err.data?.reasons || [err.message]).join(', ')}`); }
    };
  }

  const challenges = {}; // action id -> step-up challenge
  async function loadApprovals() {
    const { actions } = await api(`/api/sme/${TID}/actions`);
    const owner = ME.sme_role === 'owner';
    $('#approvals').innerHTML = actions.length ? actions.slice(0, 10).map((a) => {
      const chl = challenges[a.id];
      return `
      <div class="card"><div class="t">${esc(a.summary)}</div>
      <div class="muted">${esc(a.tier)} · proposed by ${esc(a.proposed_by.sme_role)} via ${esc(a.proposed_by.source)} <span class="st ${esc(a.status)}">${esc(a.status.replace(/_/g, ' '))}</span></div>
      ${a.warnings?.length ? `<div class="w">⚠ ${esc(a.warnings.join('; ').replace(/_/g, ' '))}</div>` : ''}
      ${a.preview ? `<details><summary class="muted">Preview email</summary><pre class="muted" style="white-space:pre-wrap">${esc(a.preview.subject)}\n\n${esc(a.preview.body)}</pre></details>` : ''}
      ${a.receipt ? `<div class="muted">Receipt ${esc(a.receipt.reference)}${a.mandate_id ? ` · paid by autopilot under ${esc(a.mandate_id)}` : ''}</div>` : ''}
      ${a.status === 'pending_approval' && owner ? (chl ? `<div class="otp"><div class="muted">Code sent to the owner's phone · <span class="sms">sandbox SMS: ${esc(chl.sandbox_code || '')}</span></div><div class="row">${a.type === 'schedule_payment' ? `<input placeholder="Re-type amount" data-c="${a.id}">` : ''}<input placeholder="6-digit code" maxlength="6" data-o="${a.id}"><button data-ap="${a.id}">Confirm</button><button class="ghost" data-rj="${a.id}">Reject</button></div></div>`
        : `<div class="row">${a.type === 'schedule_payment' && !a.needs_step_up ? `<input placeholder="Re-type amount" data-c="${a.id}">` : ''}<button data-${a.needs_step_up ? 'su' : 'ap'}="${a.id}">Approve</button><button class="ghost" data-rj="${a.id}">Reject</button></div>`) : ''}
      </div>`;
    }).join('') : '<div class="muted">Nothing waiting. Ask the copilot to plan the cash gap, pay a bill or send a reminder.</div>';
    $('#approvals').onclick = async (e) => {
      const su = e.target.closest('[data-su]'); const ap = e.target.closest('[data-ap]'); const rj = e.target.closest('[data-rj]');
      try {
        if (su) { challenges[su.dataset.su] = await api(`/api/sme/${TID}/actions/${su.dataset.su}/stepup`, { method: 'POST' }); return loadApprovals(); }
        if (ap) {
          const id = ap.dataset.ap; const c = $(`[data-c="${id}"]`); const o = $(`[data-o="${id}"]`);
          await api(`/api/sme/${TID}/actions/${id}/approve`, { method: 'POST', body: { confirm_amount: c ? Number(c.value) : undefined, otp: challenges[id] ? { challenge_id: challenges[id].challenge_id, code: o ? o.value.trim() : '' } : undefined } });
          delete challenges[id]; toast('Approved and executed in sandbox');
        }
        if (rj) { await api(`/api/sme/${TID}/actions/${rj.dataset.rj}/reject`, { method: 'POST', body: { reason: 'owner_rejected' } }); toast('Rejected'); }
      } catch (err) {
        const m = { confirm_amount_mismatch: 'Amount does not match. Re-type the exact amount.', stepup_code_wrong: 'Wrong code. Try again.', stepup_locked: 'Too many wrong codes. Request a new one.', stepup_code_expired: 'Code expired. Request a new one.' }[err.message];
        if (['stepup_locked', 'stepup_code_expired', 'stepup_code_already_used'].includes(err.message) && ap) delete challenges[ap.dataset.ap];
        toast(m || `Blocked: ${err.message}`);
      }
      loadApprovals(); loadAudit(); loadOverview();
    };
  }

  // ---------- Agent: autopilot brief, plan trace ----------
  const TIER = { get_cash_forecast: 'READ', list_overdue_receivables: 'READ', list_open_bills: 'READ', simulate_plan: 'READ', match_financing: 'SUGGEST', draft_reminder: 'SUGGEST', propose_reminder: 'EXECUTE', propose_payment: 'EXECUTE', propose_loan_application: 'EXECUTE' };
  function obsLine(s) {
    const o = s.observation || {};
    if (o.error) return `refused: ${o.error.replace(/_/g, ' ')}`;
    if (s.tool === 'get_cash_forecast') return `today ${inr(o.balance_today)} · lowest ${inr(o.lowest_point?.low)} on ${o.lowest_point?.date} · buffer ${inr(o.safety_buffer)}`;
    if (s.tool === 'list_overdue_receivables') return `${inr(o.total_overdue)} overdue · top: ${(o.invoices || []).slice(0, 3).map((i) => i.invoice_id).join(', ')}`;
    if (s.tool === 'match_financing') { const r = (o.options || []).find((x) => x.product_id === o.recommendation?.product_id); return r ? `best: ${r.lender} · ${r.apr_pct}% APR · total cost ${inr(r.est_total_cost)}` : 'no eligible product'; }
    if (s.tool === 'simulate_plan') return `low point ${inr(o.lowest_before?.low)} → ${inr(o.lowest_after?.low)}${o.first_breach_after_plan ? ` · still touches buffer ${o.first_breach_after_plan}` : ' · stays above buffer'}`;
    if (o.status === 'pending_approval') return `queued for owner: ${o.summary}${o.duplicate ? ' (already queued)' : ''}`;
    if (o.status && o.status !== 'pending_approval' && o.action_id) return `already ${o.status.replace(/_/g, ' ')}: ${o.summary}`;
    if (o.status === 'denied_by_policy') return `denied by policy: ${(o.reasons || []).join(', ')}`;
    return JSON.stringify(o).slice(0, 120);
  }
  function renderTrace(steps, planner) {
    $('#trace').innerHTML = (steps || []).map((s, i) => `<li style="animation-delay:${i * 90}ms"><span class="n">${s.step}</span><code>${esc(s.tool)}</code><span class="tier ${TIER[s.tool] || 'READ'}">${TIER[s.tool] || '?'}</span><span class="o muted">${esc(obsLine(s))}</span></li>`).join('')
      + (steps?.length ? `<li style="grid-template-columns:1fr" class="muted">Planner: ${esc(planner || 'deterministic')} · every EXECUTE step waits for the owner · every step is in the audit chain</li>` : '');
  }
  async function loadBrief() {
    const s = await api(`/api/sme/${TID}/autopilot`);
    const r = s.last_run;
    $('#pauseAuto').textContent = s.paused ? 'Resume autopilot' : 'Pause autopilot';
    $('#pauseAuto').hidden = ME.sme_role !== 'owner';
    $('#runAuto').hidden = $('#runPlan').hidden = ME.sme_role === 'viewer';
    $('#briefMeta').textContent = s.paused ? 'paused by owner' : `runs every ${s.interval_min >= 1440 ? 'day' : `${s.interval_min} min`}${r ? ` · last run ${new Date(r.finished).toLocaleTimeString()}` : ''}`;
    $('#brief').innerHTML = r ? `<div class="h">${esc(r.headline)}</div><ul>${r.events.map((e) => `<li><span class="ev ${e.kind}">${{ paid: 'Paid', escalated: 'Needs you', plan: 'Plan', reminder: 'Reminder', forecast: 'Forecast' }[e.kind] || 'Note'}</span> ${esc(e.text)}</li>`).join('')}</ul><div class="muted">${r.pending_approvals} action(s) waiting for the owner.</div>`
      : '<div class="muted">No autopilot run yet. Run it now, or ask it to plan your cash gap.</div>';
  }
  $('#runPlan').onclick = async () => {
    try { const p = await api(`/api/sme/${TID}/agent/plan`, { method: 'POST', body: {} }); renderTrace(p.steps, p.planner); say('a', p.reply); } catch (err) { toast(err.message); }
    loadApprovals(); loadAudit(); loadOverview();
  };
  $('#runAuto').onclick = async () => {
    try { const r = await api(`/api/sme/${TID}/autopilot/run`, { method: 'POST' }); if (r.skipped) toast('Autopilot is paused'); } catch (err) { toast(err.message); }
    loadBrief(); loadApprovals(); loadAudit(); loadOverview(); loadMandates();
  };
  $('#pauseAuto').onclick = async () => {
    const s = await api(`/api/sme/${TID}/autopilot`);
    await api(`/api/sme/${TID}/autopilot/pause`, { method: 'POST', body: { paused: !s.paused } }); loadBrief(); loadAudit();
  };

  // ---------- Mandates ----------
  let mdChallenge = null; let mdParams = null;
  async function loadMandates() {
    const ov = await api(`/api/sme/${TID}/overview`);
    const names = [...new Set(ov.payables.map((b) => b.supplier))];
    const { mandates } = await api(`/api/sme/${TID}/mandates`);
    $('#mdForm').hidden = ME.sme_role !== 'owner';
    if ($('#mdBen').dataset.t !== TID) { $('#mdBen').innerHTML = names.map((n) => `<option>${esc(n)}</option>`).join(''); $('#mdBen').dataset.t = TID; $('#mdOtp').innerHTML = ''; }
    $('#mdBody').innerHTML = mandates.length ? mandates.map((m) => `<tr><td>${esc(m.beneficiary_name)} <span class="muted">${esc(m.account_masked)}</span></td><td class="r">${inr(m.max_per_payment)}</td><td class="r">${inr(m.monthly_cap)}</td><td>${esc(m.valid_until.slice(0, 10))}</td><td><span class="st ${m.status === 'active' ? 'executed' : 'rejected'}">${esc(m.status)}</span>${m.payments.length ? ` <span class="muted">${m.payments.length} paid</span>` : ''}</td><td class="r">${m.status === 'active' && ME.sme_role === 'owner' ? `<button class="ghost" data-rv="${m.id}">Revoke</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">No mandates. The agent cannot pay anyone on its own.</td></tr>';
    $('#mdBody').onclick = async (e) => { const b = e.target.closest('[data-rv]'); if (!b) return; await api(`/api/sme/${TID}/mandates/${b.dataset.rv}/revoke`, { method: 'POST' }); toast('Mandate revoked'); loadMandates(); loadAudit(); };
    window.__benByName = Object.fromEntries((ov.beneficiaries || []).map((b) => [b.name, b.id]));
  }
  $('#mdForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#mdBen').value;
    mdParams = { beneficiary_name: name, beneficiary_id: (window.__benByName || {})[name], max_per_payment: Number($('#mdPer').value), monthly_cap: Number($('#mdCap').value), valid_days: Number($('#mdDays').value), purpose: 'recurring supplier bills' };
    try {
      mdChallenge = (await api(`/api/sme/${TID}/mandates/challenge`, { method: 'POST', body: mdParams })).challenge;
      $('#mdOtp').innerHTML = `<div class="otp"><div class="muted">Signing a mandate needs a code · <span class="sms">sandbox SMS: ${esc(mdChallenge.sandbox_code || '')}</span></div><div class="row"><input id="mdCode" placeholder="6-digit code" maxlength="6"><button id="mdSign">Confirm mandate</button></div></div>`;
      $('#mdSign').onclick = async () => {
        try { await api(`/api/sme/${TID}/mandates`, { method: 'POST', body: { ...mdParams, otp: { challenge_id: mdChallenge.challenge_id, code: $('#mdCode').value.trim() } } }); toast('Mandate signed'); $('#mdOtp').innerHTML = ''; }
        catch (err) { toast(`Not signed: ${(err.data?.reasons || [err.message]).join(', ')}`); }
        loadMandates(); loadAudit();
      };
    } catch (err) { toast(`Not allowed: ${(err.data?.reasons || [err.message]).join(', ').replace(/_/g, ' ')}`); }
  };

  async function loadShare() {
    if (ME.sme_role === 'viewer') { $('#share').innerHTML = '<div class="muted">Viewers can’t see lender data.</div>'; return; }
    const s = await api(`/api/sme/${TID}/privacy/lender-share`);
    $('#share').innerHTML = `<dl class="share">${Object.entries(s.features).map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(String(v))}</dd>`).join('')}</dl><div class="muted">Ledger commitment <code>${esc(s.ledger_commitment_sha256.slice(0, 16))}…</code><br>Never shared: ${esc(s.withheld.join(', ').replace(/_/g, ' '))}.</div>`;
  }

  async function loadAudit() {
    if (ME.sme_role === 'viewer') { $('#audit').innerHTML = '<li class="muted">Viewers can’t see the audit trail.</li>'; $('#auditOk').textContent = ''; return; }
    const { entries, verification } = await api(`/api/sme/${TID}/audit`);
    $('#auditOk').className = `pill ${verification.valid ? 'good' : 'bad'}`;
    $('#auditOk').textContent = verification.valid ? `chain valid · ${verification.entries}` : `TAMPERED at #${verification.broken_at_seq}`;
    $('#audit').innerHTML = entries.slice().reverse().slice(0, 40).map((e) => `<li><b>#${e.seq}</b> ${esc(e.action)} <span class="${/deny|reject/.test(e.decision) ? 'd-deny' : 'd-allow'}">${esc(e.decision || '')}</span><br><code>${e.ts.slice(11, 19)} · ${esc(e.actor_role)} · ${e.hash.slice(0, 12)}…</code></li>`).join('');
  }

  async function runFin(e) {
    e && e.preventDefault();
    if (ME.sme_role === 'viewer') { $('#finBody').innerHTML = '<tr><td colspan="5" class="muted">Viewers can’t run financing matches.</td></tr>'; return; }
    const m = await api(`/api/sme/${TID}/financing/match`, { method: 'POST', body: { amount: Number($('#finAmt').value), urgency_days: Number($('#finDays').value) } });
    $('#finBody').innerHTML = m.options.map((o) => `<tr><td>${esc(o.lender)}${m.recommendation?.product_id === o.product_id ? ' <span class="risk l">best</span>' : ''}</td><td class="r">${o.apr_pct}%</td><td class="r">${inr(o.est_monthly_payment)}</td><td class="r">${inr(o.est_total_cost)}</td><td>${o.eligible ? '<span class="ok">eligible</span>' : `<span class="no">${esc(o.blockers[0])}</span>`}</td></tr>`).join('');
  }
  $('#fin').onsubmit = runFin;

  function say(who, text, extra = {}) {
    const d = document.createElement('div');
    d.className = `msg ${who}${extra.sec ? ' sec' : ''}`;
    d.innerHTML = esc(text) + (extra.note ? `<span class="note">🛡 ${esc(extra.note)}</span>` : '');
    $('#chat').appendChild(d); $('#chat').scrollTop = 1e9;
  }
  async function ask(q) {
    if (!q.trim()) return;
    say('u', q);
    try {
      const r = await api(`/api/sme/${TID}/copilot`, { method: 'POST', body: { message: q } });
      say('a', r.reply || '…', { sec: r.blocked || r.intent === 'phishing_warning', note: r.security_notice || (r.fallback_reason ? `LLM answer rejected (${r.fallback_reason.replace(/_/g, ' ')}); deterministic answer shown.` : '') });
      if (r.steps?.length) { renderTrace(r.steps, r.planner); $('#briefPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      for (const c of r.cards || []) if (c.type === 'suggestion' && ME.sme_role !== 'viewer') {
        const b = document.createElement('button'); b.className = 'ghost'; b.textContent = c.label; b.style.alignSelf = 'flex-start';
        b.onclick = async () => { try { await api(`/api/sme/${TID}/actions`, { method: 'POST', body: c.propose }); toast('Queued for owner approval'); loadApprovals(); } catch (err) { toast(err.message); } b.remove(); };
        $('#chat').appendChild(b);
      }
    } catch (err) { say('a', `Sorry, that failed (${err.message}).`); }
    loadApprovals(); loadAudit(); loadOverview(); loadBrief();
  }
  $('#ask').onsubmit = (e) => { e.preventDefault(); const q = $('#q').value; $('#q').value = ''; ask(q); };
  document.querySelector('.chips').onclick = (e) => { const b = e.target.closest('button[data-q]'); if (b) ask(b.dataset.q); };

  boot();
})();
