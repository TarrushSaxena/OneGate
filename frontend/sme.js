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
    $('#chat').innerHTML = '';
    say('a', `Hi! I'm the OneGate copilot for ${ME.tenant_name}. I can read your books and draft things on my own. Anything that moves money or contacts customers waits for the owner's approval.`);
    await Promise.all([loadOverview(), loadForecast(), loadReceivables(), loadApprovals(), loadAudit(), runFin()]);
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

  async function loadApprovals() {
    const { actions } = await api(`/api/sme/${TID}/actions`);
    const owner = ME.sme_role === 'owner';
    $('#approvals').innerHTML = actions.length ? actions.slice(0, 8).map((a) => `
      <div class="card"><div class="t">${esc(a.summary)}</div>
      <div class="muted">${esc(a.tier)} · proposed by ${esc(a.proposed_by.sme_role)} via ${esc(a.proposed_by.source)} <span class="st ${esc(a.status)}">${esc(a.status.replace(/_/g, ' '))}</span></div>
      ${a.warnings?.length ? `<div class="w">⚠ ${esc(a.warnings.join('; ').replace(/_/g, ' '))}</div>` : ''}
      ${a.preview ? `<details><summary class="muted">Preview email</summary><pre class="muted" style="white-space:pre-wrap">${esc(a.preview.subject)}\n\n${esc(a.preview.body)}</pre></details>` : ''}
      ${a.receipt ? `<div class="muted">Receipt ${esc(a.receipt.reference)}</div>` : ''}
      ${a.status === 'pending_approval' && owner ? `<div class="row">${a.type === 'schedule_payment' ? `<input placeholder="Re-type amount" data-c="${a.id}">` : ''}<button data-ap="${a.id}">Approve</button><button class="ghost" data-rj="${a.id}">Reject</button></div>` : ''}
      </div>`).join('') : '<div class="muted">Nothing waiting. Ask the copilot to pay a bill or send a reminder.</div>';
    $('#approvals').onclick = async (e) => {
      const ap = e.target.closest('[data-ap]'); const rj = e.target.closest('[data-rj]');
      try {
        if (ap) { const c = $(`[data-c="${ap.dataset.ap}"]`); await api(`/api/sme/${TID}/actions/${ap.dataset.ap}/approve`, { method: 'POST', body: { confirm_amount: c ? Number(c.value) : undefined } }); toast('Approved and executed in sandbox'); }
        if (rj) { await api(`/api/sme/${TID}/actions/${rj.dataset.rj}/reject`, { method: 'POST', body: { reason: 'owner_rejected' } }); toast('Rejected'); }
      } catch (err) { toast(err.message === 'confirm_amount_mismatch' ? 'Amount does not match. Re-type the exact amount.' : `Blocked: ${err.message}`); }
      loadApprovals(); loadAudit(); loadOverview();
    };
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
      say('a', r.reply || '…', { sec: r.blocked || r.intent === 'phishing_warning', note: r.security_notice });
      for (const c of r.cards || []) if (c.type === 'suggestion' && ME.sme_role !== 'viewer') {
        const b = document.createElement('button'); b.className = 'ghost'; b.textContent = c.label; b.style.alignSelf = 'flex-start';
        b.onclick = async () => { try { await api(`/api/sme/${TID}/actions`, { method: 'POST', body: c.propose }); toast('Queued for owner approval'); loadApprovals(); } catch (err) { toast(err.message); } b.remove(); };
        $('#chat').appendChild(b);
      }
    } catch (err) { say('a', `Sorry, that failed (${err.message}).`); }
    loadApprovals(); loadAudit(); loadOverview();
  }
  $('#ask').onsubmit = (e) => { e.preventDefault(); const q = $('#q').value; $('#q').value = ''; ask(q); };
  document.querySelector('.chips').onclick = (e) => { const b = e.target.closest('button[data-q]'); if (b) ask(b.dataset.q); };

  boot();
})();
