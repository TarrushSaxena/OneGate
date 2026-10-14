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
  // "Why not?" cards: rule, detail and the fix for any refusal.
  const whyHtml = (list) => (list || []).map((w) => `<div class="why"><span class="rule">${esc(w.rule)}</span><b>${esc(w.title)}</b><div>${esc(w.detail)}</div><div class="fix">${esc(w.fix)}</div></div>`).join('');
  function showWhy(list, fallback, head) {
    if (!list || !list.length) return toast(fallback || 'Not allowed');
    document.querySelectorAll('.whypop').forEach((x) => x.remove());
    const d = document.createElement('div'); d.className = 'whypop'; d.innerHTML = `<div class="muted">${esc(head || 'Why not?')}</div>${whyHtml(list)}`;
    d.onclick = () => d.remove(); document.body.appendChild(d); setTimeout(() => d.remove(), 9000);
  }
  const refuse = (err, fallback) => showWhy(err.data?.why_not, fallback || `Not allowed: ${err.message}`);
  // Out-of-band codes: shown on a simulated owner's phone, never on the approval card.
  function sms(text, code) {
    $('#phone').hidden = false;
    const list = $('#sms'); if (list.querySelector('.muted:only-child')) list.innerHTML = '';
    const d = document.createElement('div'); d.className = 'sms-msg';
    d.innerHTML = `<div>${esc(text)}</div>${code ? `<b class="code">${esc(code)}</b>` : ''}<span class="muted">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
    list.prepend(d); $('#phone').classList.remove('ping'); void $('#phone').offsetWidth; $('#phone').classList.add('ping');
  }
  function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3500); }

  async function showLogin() {
    $('#login').hidden = false; $('#app').hidden = true; $('#who').innerHTML = ''; $('#roles').hidden = true; $('#apPill').hidden = true; $('#fab').hidden = true; $('#guard').hidden = true; $('#phone').hidden = true; closeDrawer();
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
    $('#who').innerHTML = `${esc(ME.tenant_name)} <button class="ghost" id="logout">Switch business</button>`;
    $('#fab').hidden = false; $('#guard').hidden = false;
    $('#phone').hidden = true; $('#sms').innerHTML = '<div class="muted">Codes for payments, loans and mandates arrive here, not on the approval card.</div>';
    loadRoles();
    $('#logout').onclick = async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {}); showLogin(); };
    $('#chat').innerHTML = ''; $('#trace').innerHTML = ''; WI = null;
    ['#wiDelay', '#wiSales', '#wiSup', '#wiOne'].forEach((id) => { $(id).value = 0; }); $('#wiOut').className = 'wi-out muted'; $('#wiOut').textContent = 'Move a slider to see how low cash would go.'; $('#wiReset').hidden = true;
    say('a', `Hi! I'm the OneGate copilot for ${ME.tenant_name}. I can read your books and draft things on my own. Anything that moves money or contacts customers waits for the owner's approval.`);
    await Promise.all([loadCockpit(), loadOverview(), loadForecast(), loadReceivables(), loadApprovals(), loadAudit(), runFin(), loadBrief(), loadMandates(), loadShare(), loadDiscounts(), loadCompliance()]);
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

  let FC = null; let WI = null;
  async function loadForecast() {
    FC = await api(`/api/sme/${TID}/forecast?horizon=90`);
    const f = FC; const c = f.calibration;
    $('#fcMeta').textContent = `as of ${f.as_of} · backtest MAPE ${f.backtest.mape_pct}% (30d)`;
    if (c) {
      const b30 = c.buckets[1];
      const bias = b30.median_error;
      $('#calNote').innerHTML = `The shaded outline is where the balance actually landed ${c.target_coverage_pct}% of the time when we re-ran this forecast from ${c.origins} past start dates (${b30.n} checks at 16 to 30 days). `
        + (bias < 0 ? `In those runs the base case ran high: at 16 to 30 days the typical miss was ${inr(-bias)} too optimistic. ` : '')
        + `At 30 days the scenario low is ${inr(c.day30.scenario_low)} and the calibrated low is ${inr(c.day30.calibrated_low)}${c.day30.policy_is_more_cautious ? ', so the buffer checks are already the more cautious of the two.' : '. Safety checks still use the scenario low.'}`;
    }
    drawChart();
    $('#alerts').innerHTML = f.alerts.map((a) => `<div class="alert ${a.severity === 'critical' ? 'critical' : ''}">⚠ ${esc(a.message)}</div>`).join('') || '<div class="muted" style="margin-top:8px">No buffer breach expected in the next 90 days.</div>';
  }
  function drawChart() {
    const f = FC; if (!f) return;
    const W = 720, H = 240, P = 28, s = f.series;
    const wi = WI && WI.series;
    const vals = s.flatMap((p) => [p.low, p.high, p.cal_low ?? p.low, p.cal_high ?? p.high]).concat([f.safety_buffer, f.starting_balance, 0], wi ? wi.map((p) => p.low) : []);
    const min = Math.min(...vals), max = Math.max(...vals);
    const x = (i) => P + (i / (s.length - 1)) * (W - 2 * P);
    const y = (v) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
    const poly = (hi, lo) => s.map((p, i) => `${x(i)},${y(p[hi])}`).join(' ') + ' ' + s.map((p, i) => `${x(s.length - 1 - i)},${y(s[s.length - 1 - i][lo])}`).join(' ');
    const base = s.map((p, i) => `${x(i)},${y(p.base)}`).join(' ');
    const ticks = [0, 29, 59, 89].map((i) => `<text x="${x(i)}" y="${H - 8}" fill="#8d9bc4" font-size="10" text-anchor="middle">${s[i].date.slice(5)}</text>`).join('');
    const cal = s[0].cal_low !== undefined ? `<polygon points="${poly('cal_high', 'cal_low')}" fill="rgba(180,140,255,.07)" stroke="rgba(180,140,255,.7)" stroke-dasharray="3 3" stroke-width="1"/>` : '';
    const wiLine = wi ? `<polyline points="${wi.map((p, i) => `${x(i)},${y(p.low)}`).join(' ')}" fill="none" stroke="#ff5d6c" stroke-width="2" stroke-dasharray="6 3"/>` : '';
    $('#chart').innerHTML = `
      <polygon points="${poly('high', 'low')}" fill="rgba(91,140,255,.18)" stroke="rgba(91,140,255,.5)" stroke-width="1"/>${cal}
      <line x1="${P}" x2="${W - P}" y1="${y(f.safety_buffer)}" y2="${y(f.safety_buffer)}" stroke="#f5b041" stroke-dasharray="5 4"/>
      ${min < 0 ? `<line x1="${P}" x2="${W - P}" y1="${y(0)}" y2="${y(0)}" stroke="#ff5d6c" stroke-width=".8"/>` : ''}
      <polyline points="${base}" fill="none" stroke="#5b8cff" stroke-width="2.2"/>${wiLine}
      <text x="${P}" y="16" fill="#8d9bc4" font-size="10">${inr(max)}</text><text x="${P}" y="${H - P - 4}" fill="#8d9bc4" font-size="10">${inr(min)}</text>${ticks}`;
    $('#wiLeg').hidden = $('#wiLegT').hidden = !wi;
  }

  // ---------- What-if stress test ----------
  let wiTimer = null;
  function wiInputs() {
    return { debtor_delay_days: Number($('#wiDelay').value), sales_change_pct: Number($('#wiSales').value), supplier_cost_change_pct: Number($('#wiSup').value), one_off_expense: Number($('#wiOne').value), top_debtors: 3, one_off_in_days: 7 };
  }
  function wiLabels(v) {
    $('#wiDelayV').textContent = `${v.debtor_delay_days} days`;
    $('#wiSalesV').textContent = `${v.sales_change_pct > 0 ? '+' : ''}${v.sales_change_pct}%`;
    $('#wiSupV').textContent = `${v.supplier_cost_change_pct > 0 ? '+' : ''}${v.supplier_cost_change_pct}%`;
    $('#wiOneV').textContent = inr(v.one_off_expense);
  }
  async function runWhatIf() {
    const v = wiInputs(); wiLabels(v);
    const idle = !v.debtor_delay_days && !v.sales_change_pct && !v.supplier_cost_change_pct && !v.one_off_expense;
    $('#wiReset').hidden = idle;
    if (idle) { WI = null; drawChart(); $('#wiOut').className = 'wi-out muted'; $('#wiOut').textContent = 'Move a slider to see how low cash would go.'; return; }
    try {
      WI = await api(`/api/sme/${TID}/whatif`, { method: 'POST', body: v });
      drawChart();
      const a = WI.after; const b = WI.before; const fin = WI.cheapest_financing;
      const breaks = !!a.first_breach;
      $('#wiOut').className = `wi-out ${breaks ? 'bad' : 'good'}`;
      $('#wiOut').innerHTML = `Lowest point in 45 days: <b>${inr(a.lowest.low)}</b> on ${esc(a.lowest.date)} (now ${inr(b.lowest.low)}, ${WI.change_in_low < 0 ? 'down' : 'up'} ${inr(Math.abs(WI.change_in_low))}).`
        + (WI.delayed_customers.length ? ` Delayed: ${esc(WI.delayed_customers.join(', '))}.` : '')
        + (breaks ? ` Cash breaks the ${inr(WI.safety_buffer)} buffer on ${esc(a.first_breach)}. You'd need about <b>${inr(WI.cash_needed_to_hold_buffer)}</b>${fin && !fin.none_eligible ? `; the cheapest eligible option is ${esc(fin.lender)} at ${fin.apr_pct}% APR (about ${inr(fin.est_total_cost)} in cost, ${fin.disbursal_days} days to fund).` : '; no eligible financing covers it.'}` : ` It stays above the ${inr(WI.safety_buffer)} buffer.`)
        + ' <span class="muted">Nothing is queued.</span>';
    } catch (err) { refuse(err); }
  }
  ['#wiDelay', '#wiSales', '#wiSup', '#wiOne'].forEach((id) => { $(id).oninput = () => { wiLabels(wiInputs()); clearTimeout(wiTimer); wiTimer = setTimeout(runWhatIf, 180); }; });
  $('#wiReset').onclick = () => { ['#wiDelay', '#wiSales', '#wiSup', '#wiOne'].forEach((id) => { $(id).value = 0; }); runWhatIf(); };

  async function loadReceivables() {
    const r = await api(`/api/sme/${TID}/receivables`);
    $('#arMeta').textContent = `${r.top_overdue.length} shown · ${inr(r.total_overdue)} overdue`;
    $('#ageing').innerHTML = Object.entries(r.ageing).map(([b, v]) => `<div>${b}<b>${inr(v)}</b></div>`).join('');
    const canDraft = ME.sme_role !== 'viewer';
    $('#arBody').innerHTML = r.top_overdue.map((i) => `<tr><td>${esc(i.invoice)}${i.untrusted_note?.flagged ? ' <span title="Note contained instructions aimed at the AI and was ignored" class="risk h">⚑</span>' : ''}</td><td>${esc(i.customer)}${i.tds ? `<div class="tag2" title="${esc(i.tds.basis)}">TDS s.${esc(i.tds.section)} ${i.tds.rate_pct}% · cash in ${inr(i.tds.net_cash)}</div>` : ''}${i.msme_43bh?.beyond_limit ? `<div class="tag2 b" title="${esc(i.msme_43bh.note)}">43B(h): past ${i.msme_43bh.limit_days} days</div>` : ''}</td><td class="r">${inr(i.amount)}</td><td class="r">${i.days_overdue}</td><td class="r"><span class="risk ${i.risk_score >= 70 ? 'h' : i.risk_score >= 40 ? 'm' : 'l'}">${i.risk_score}</span></td><td class="r nowrap">${canDraft ? `<button class="ghost" data-inv="${esc(i.invoice)}">Remind</button> <button class="linkish" data-dis="${esc(i.invoice)}" title="Mark as disputed: stops chasing until settled">Dispute</button>` : ''}</td></tr>`).join('');
    $('#arDisputed').innerHTML = r.disputed?.length ? `<div class="muted" style="margin-top:8px">On hold (disputed, not chased):</div>${r.disputed.map((d) => `<div class="card bad"><div class="t">${esc(d.invoice)} · ${esc(d.customer)} · ${inr(d.amount)}</div><div class="muted">${esc(d.dispute.reason)} · marked by ${esc(d.dispute.by)}</div>${canDraft ? `<button class="ghost" data-undis="${esc(d.invoice)}">Mark settled</button>` : ''}</div>`).join('')}` : '';
    $('#arDisputed').onclick = async (e) => { const b = e.target.closest('[data-undis]'); if (!b) return; try { await api(`/api/sme/${TID}/disputes`, { method: 'POST', body: { kind: 'invoice', id: b.dataset.undis, disputed: false } }); toast('Dispute settled'); } catch (err) { refuse(err); } loadReceivables(); loadAudit(); loadForecast(); };
    $('#arBody').onclick = async (e) => {
      const d = e.target.closest('[data-dis]');
      if (d) { const reason = prompt('What is disputed? (e.g. damaged goods, short delivery)', 'quality dispute'); if (reason === null) return; try { await api(`/api/sme/${TID}/disputes`, { method: 'POST', body: { kind: 'invoice', id: d.dataset.dis, disputed: true, reason } }); toast('Marked disputed: the agent won’t chase it'); } catch (err) { refuse(err); } loadReceivables(); loadAudit(); loadForecast(); return; }
      const b = e.target.closest('button[data-inv]'); if (!b) return;
      try { await api(`/api/sme/${TID}/actions`, { method: 'POST', body: { type: 'send_reminder', params: { invoice_id: b.dataset.inv }, idempotency_key: `rem-${b.dataset.inv}` } }); toast('Reminder queued for owner approval'); loadApprovals(); loadAudit(); loadOverview(); }
      catch (err) { refuse(err); }
    };
  }

  const challenges = {}; // action id -> step-up challenge
  const kfsTicked = {};   // action id -> owner ticked "I have read the KFS"
  document.addEventListener('change', (e) => { const k = e.target.closest && e.target.closest('[data-kfs]'); if (k) kfsTicked[k.dataset.kfs] = k.checked; });
  const kfsHtml = (k) => `<dl class="share kfsdl"><dt>Lender</dt><dd>${esc(k.regulated_entity)}</dd><dt>Amount</dt><dd>${inr(k.amount)} for ${k.tenure_months} months</dd><dt>Interest rate</dt><dd>${k.interest_rate_pct}%</dd><dt>Processing fee</dt><dd>${inr(k.processing_fee)}</dd><dt>All-in APR</dt><dd><b>${k.apr_all_in_pct}%</b></dd><dt>Instalment</dt><dd>${inr(k.instalment)}</dd><dt>Total repayable</dt><dd>${inr(k.total_repayable)}</dd><dt>You receive</dt><dd>${inr(k.net_disbursed)}, straight to your account</dd><dt>Penal charges</dt><dd>${esc(k.penal_charges)}</dd><dt>Cooling-off</dt><dd>${esc(k.cooling_off_rule)}</dd><dt>Grievances</dt><dd>${esc(k.grievance_officer)}</dd></dl><div class="muted">${esc(k.basis)} KFS ${esc(k.hash.slice(0, 12))}…</div>`;
  async function loadApprovals() {
    const { actions } = await api(`/api/sme/${TID}/actions`);
    const owner = ME.sme_role === 'owner';
    $('#approvals').innerHTML = actions.length ? actions.slice(0, 10).map((a) => {
      const chl = challenges[a.id];
      return `
      <div class="card"><div class="t">${esc(a.summary)}</div>
      <div class="muted">${esc(a.tier)} · proposed by ${esc(a.proposed_by.sme_role)} via ${esc(a.proposed_by.source)} <span class="st ${esc(a.status)}">${esc(a.status.replace(/_/g, ' '))}</span></div>
      ${a.why_warnings?.length ? whyHtml(a.why_warnings) : a.warnings?.length ? `<div class="w">⚠ ${esc(a.warnings.join('; ').replace(/_/g, ' '))}</div>` : ''}
      ${a.kfs ? `<details class="kfs"><summary>Key Facts Statement · all-in APR ${a.kfs.apr_all_in_pct}% · cooling-off ${a.kfs.cooling_off_days} day(s)</summary>${kfsHtml(a.kfs)}</details>${a.status === 'pending_approval' && owner ? `<label class="kfsack"><input type="checkbox" data-kfs="${a.id}" value="${esc(a.kfs.hash)}" ${kfsTicked[a.id] ? 'checked' : ''}> I have read the Key Facts Statement</label>` : ''}` : ''}
      ${a.status === 'executed' && a.receipt?.cooling_off_until && owner ? `<div class="row"><span class="muted">Penalty-free exit until ${esc(a.receipt.cooling_off_until)}</span><button class="ghost" data-coe="${a.id}">Exit loan</button></div>` : ''}
      ${a.cooling_off_exit ? `<div class="muted">Exited in cooling-off: repay ${inr(a.cooling_off_exit.repay_principal)} + ${inr(a.cooling_off_exit.interest_for_days_used)} interest, no penalty.</div>` : ''}
      ${a.preview ? `<details><summary class="muted">Preview email</summary><pre class="muted" style="white-space:pre-wrap">${esc(a.preview.subject)}\n\n${esc(a.preview.body)}</pre></details>` : ''}
      ${a.receipt ? `<div class="muted">Receipt ${esc(a.receipt.reference)}${a.mandate_id ? ` · paid by autopilot under ${esc(a.mandate_id)}` : ''}</div>` : ''}
      ${a.status === 'pending_approval' && owner ? (chl ? `<div class="otp"><div class="muted">Code sent to the owner’s phone. Enter it here.</div><div class="row">${a.type === 'schedule_payment' ? `<input placeholder="Re-type amount" data-c="${a.id}">` : ''}<input placeholder="6-digit code" maxlength="6" data-o="${a.id}"><button data-ap="${a.id}">Confirm</button><button class="ghost" data-rj="${a.id}">Reject</button></div></div>`
        : `<div class="row">${a.type === 'schedule_payment' && !a.needs_step_up ? `<input placeholder="Re-type amount" data-c="${a.id}">` : ''}<button data-${a.needs_step_up ? 'su' : 'ap'}="${a.id}">Approve</button><button class="ghost" data-rj="${a.id}">Reject</button></div>`) : a.status === 'pending_approval' ? `<div class="row"><button disabled title="Separation of duties: only the owner can approve">Approve · owner only</button><span class="muted">${ME.sme_role === 'viewer' ? 'viewers can only look' : 'accountants can propose, not approve'}</span></div>` : ''}
      </div>`;
    }).join('') : '<div class="muted empty">Nothing waiting. Run “Plan my cash gap”, or ask the copilot to pay a bill or send a reminder.</div>';
    $('#laneWaitMeta').textContent = owner ? `${actions.filter((a) => a.status === 'pending_approval').length} to approve` : ME.sme_role === 'viewer' ? 'view only' : 'you propose, the owner approves';
    $('#approvals').onclick = async (e) => {
      const su = e.target.closest('[data-su]'); const ap = e.target.closest('[data-ap]'); const rj = e.target.closest('[data-rj]'); const coe = e.target.closest('[data-coe]');
      if (coe) { try { await api(`/api/sme/${TID}/actions/${coe.dataset.coe}/cooling-off-exit`, { method: 'POST' }); toast('Loan exited in cooling-off, no penalty'); } catch (err) { refuse(err); } return loadApprovals(); }
      try {
        if (su) {
          const c = await api(`/api/sme/${TID}/actions/${su.dataset.su}/stepup`, { method: 'POST' }); challenges[su.dataset.su] = c;
          const a = (await api(`/api/sme/${TID}/actions`)).actions.find((x) => x.id === su.dataset.su);
          sms(`OneGate: code to approve "${a ? a.summary : 'this action'}". Valid 5 min. Never share it.`, c.sandbox_code || '(sent by SMS)');
          return loadApprovals();
        }
        if (ap) {
          const id = ap.dataset.ap; const c = $(`[data-c="${id}"]`); const o = $(`[data-o="${id}"]`); const k = $(`[data-kfs="${id}"]`);
          await api(`/api/sme/${TID}/actions/${id}/approve`, { method: 'POST', body: { kfs_ack: k && k.checked ? k.value : undefined, confirm_amount: c ? Number(c.value) : undefined, otp: challenges[id] ? { challenge_id: challenges[id].challenge_id, code: o ? o.value.trim() : '' } : undefined } });
          delete challenges[id]; toast('Approved and executed in sandbox');
        }
        if (rj) { await api(`/api/sme/${TID}/actions/${rj.dataset.rj}/reject`, { method: 'POST', body: { reason: 'owner_rejected' } }); toast('Rejected'); }
      } catch (err) {
        const m = { confirm_amount_mismatch: 'Amount does not match. Re-type the exact amount.', stepup_code_wrong: 'Wrong code. Try again.', stepup_locked: 'Too many wrong codes. Request a new one.', stepup_code_expired: 'Code expired. Request a new one.' }[err.message];
        if (['stepup_locked', 'stepup_code_expired', 'stepup_code_already_used'].includes(err.message) && ap) delete challenges[ap.dataset.ap];
        if (m) toast(m); else refuse(err, `Blocked: ${err.message}`);
      }
      loadApprovals(); loadAudit(); loadOverview(); loadDiscounts();
    };
  }

  // ---------- Agent: autopilot brief, plan trace ----------
  const TIER = { get_gst_calendar: 'READ', find_early_pay_discounts: 'SUGGEST', propose_early_payment: 'EXECUTE', get_cash_forecast: 'READ', list_overdue_receivables: 'READ', list_open_bills: 'READ', simulate_plan: 'READ', match_financing: 'SUGGEST', draft_reminder: 'SUGGEST', propose_reminder: 'EXECUTE', propose_payment: 'EXECUTE', propose_loan_application: 'EXECUTE' };
  function obsLine(s) {
    const o = s.observation || {};
    if (o.error) return `refused: ${(o.why_not?.length ? o.why_not.join('; ') : o.error.replace(/_/g, ' '))}`;
    if (s.tool === 'get_gst_calendar') { const d = (o.dues || [])[0]; return d ? `GST ${inr(d.net_cash_payable)} due ${d.due} · ${d.status}${d.itc_at_risk ? ` · ${inr(d.itc_at_risk)} credit at risk` : ''}` : 'no GST due in window'; }
    if (s.tool === 'find_early_pay_discounts') return `${(o.offers || []).filter((x) => x.worth_it).length} worth taking · saves ${inr(o.total_savings || 0)}`;
    if (s.tool === 'get_cash_forecast') return `today ${inr(o.balance_today)} · lowest ${inr(o.lowest_point?.low)} on ${o.lowest_point?.date} · buffer ${inr(o.safety_buffer)}`;
    if (s.tool === 'list_overdue_receivables') return `${inr(o.total_overdue)} overdue · top: ${(o.invoices || []).slice(0, 3).map((i) => i.invoice_id).join(', ')}`;
    if (s.tool === 'match_financing') { const r = (o.options || []).find((x) => x.product_id === o.recommendation?.product_id); return r ? `best: ${r.lender} · ${r.apr_pct}% APR · total cost ${inr(r.est_total_cost)}` : 'no eligible product'; }
    if (s.tool === 'simulate_plan') return `low point ${inr(o.lowest_before?.low)} → ${inr(o.lowest_after?.low)}${o.first_breach_after_plan ? ` · still touches buffer ${o.first_breach_after_plan}` : ' · stays above buffer'}`;
    if (o.status === 'pending_approval') return `queued for owner: ${o.summary}${o.duplicate ? ' (already queued)' : ''}`;
    if (o.status && o.status !== 'pending_approval' && o.action_id) return `already ${o.status.replace(/_/g, ' ')}: ${o.summary}`;
    if (o.status === 'denied_by_policy') return `denied: ${(o.why_not?.length ? o.why_not : o.reasons || []).join('; ')}`;
    return JSON.stringify(o).slice(0, 120);
  }
  function renderTrace(steps, planner) {
    $('#traceBox').hidden = !(steps && steps.length);
    $('#traceSum').textContent = `How the agent planned it · ${(steps || []).length} steps, each tool tier-checked`;
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
    $('#brief').innerHTML = r ? `<div class="h">${esc(r.headline)}</div><ul>${r.events.map((e, i) => `<li><span class="ev ${e.kind}">${{ paid: 'Paid', escalated: 'Needs you', plan: 'Plan', reminder: 'Reminder', forecast: 'Forecast', gst: 'GST', discount: 'Discount', skipped: 'Held back' }[e.kind] || 'Note'}</span> ${esc(e.text)}${e.why_not?.length ? ` <button class="linkish" data-why="${i}">Why?</button>` : ''}</li>`).join('')}</ul><div class="muted">${r.pending_approvals} action(s) waiting for the owner.</div>`
      : '<div class="muted">No autopilot run yet. Run it now, or ask it to plan your cash gap.</div>';
    $('#brief').onclick = (e) => { const b = e.target.closest('[data-why]'); if (b) showWhy(r.events[Number(b.dataset.why)].why_not); };
  }
  $('#runPlan').onclick = async () => {
    try { const p = await api(`/api/sme/${TID}/agent/plan`, { method: 'POST', body: {} }); renderTrace(p.steps, p.planner); say('a', p.reply); } catch (err) { toast(err.message); }
    loadApprovals(); loadAudit(); loadOverview();
  };
  $('#runAuto').onclick = async () => {
    try { const r = await api(`/api/sme/${TID}/autopilot/run`, { method: 'POST' }); if (r.skipped) toast('Autopilot is paused'); } catch (err) { toast(err.message); }
    loadBrief(); loadApprovals(); loadAudit(); loadOverview(); loadMandates(); loadDiscounts();
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
      $('#mdOtp').innerHTML = `<div class="otp"><div class="muted">Signing a mandate needs the code sent to the owner’s phone.</div><div class="row"><input id="mdCode" placeholder="6-digit code" maxlength="6"><button id="mdSign">Confirm mandate</button></div></div>`;
      sms(`OneGate: code to sign a mandate for ${mdParams.beneficiary_name}, up to ${inr(mdParams.max_per_payment)} a payment. Valid 5 min.`, mdChallenge.sandbox_code || '(sent by SMS)');
      $('#mdSign').onclick = async () => {
        try { await api(`/api/sme/${TID}/mandates`, { method: 'POST', body: { ...mdParams, otp: { challenge_id: mdChallenge.challenge_id, code: $('#mdCode').value.trim() } } }); toast('Mandate signed'); $('#mdOtp').innerHTML = ''; }
        catch (err) { refuse(err, `Not signed: ${err.message}`); }
        loadMandates(); loadAudit();
      };
    } catch (err) { refuse(err); }
  };

  // ---------- Dynamic discounting + GST ----------
  async function loadDiscounts() {
    const [g, d] = await Promise.all([api(`/api/sme/${TID}/gst`), api(`/api/sme/${TID}/discounts`)]);
    const n = g.next;
    $('#gst').innerHTML = n ? `<div>Next GST (GSTR-3B ${esc(n.period)})<b>${inr(n.net_cash_payable)}</b>due ${esc(n.due)}</div><div>Input tax credit<b>${g.itc_allowed ? inr(n.itc_claimed) : 'not allowed'}</b>${g.itc_allowed ? `output tax ${inr(n.output_tax)}` : `${g.output_rate_pct}% without ITC`}</div><div>Credit at risk<b>${inr(n.itc_at_risk)}</b>${n.itc_at_risk ? esc(n.itc_at_risk_from.join(', ')) + ' not filed GSTR-1' : 'all suppliers filed'}</div><div>Cash on due date<b class="${esc(n.status)}">${esc(n.status)}</b>low ${inr(n.cash_low_after_payment)} after paying</div><div class="adv">${esc(g.advice.join(' '))}</div>` : '<div class="adv">No GST payment in the forecast window.</div>';
    const canAct = ME.sme_role !== 'viewer';
    $('#discBody').innerHTML = d.offers.length ? d.offers.map((o, i) => `<tr><td>${esc(o.supplier)}</td><td>${o.eligible_terms ? `${o.discount_pct}% off if paid by ${esc(o.pay_by)} <span class="muted">· due ${esc(o.due)} · ${o.days_early} days early</span>` : '<span class="muted">none</span>'}</td><td class="r">${o.pay_amount ? inr(o.pay_amount) : ''}</td><td class="r">${o.discount_inr ? inr(o.discount_inr) : ''}</td><td class="r">${o.annualised_return_pct ?? ''}%<div class="muted">vs ${o.hurdle_pct}%</div></td><td>${o.worth_it ? (canAct ? `<button data-pe="${esc(o.bill_id)}">Pay early</button>` : '<span class="ok">worth it</span>') : `<span class="no">held back</span> <button class="linkish" data-dw="${i}">Why not?</button>`}</td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">No open bills with early-payment terms.</td></tr>';
    $('#discWhy').innerHTML = '';
    $('#discBody').onclick = async (e) => {
      const w = e.target.closest('[data-dw]'); if (w) { $('#discWhy').innerHTML = whyHtml(d.offers[Number(w.dataset.dw)].why_not); return; }
      const b = e.target.closest('[data-pe]'); if (!b) return;
      try { const r = await api(`/api/sme/${TID}/discounts/${b.dataset.pe}/propose`, { method: 'POST' }); toast(r.duplicate ? 'Already waiting for approval' : 'Early payment queued for owner approval'); } catch (err) { refuse(err); }
      loadApprovals(); loadAudit(); loadOverview();
    };
  }

  async function loadCompliance() {
    const c = await api(`/api/sme/${TID}/compliance`);
    $('#compliance').innerHTML = c.items.map((x) => `<li><span class="cd">${esc(x.date.slice(5))}</span><div><b>${esc(x.item)}</b>${x.amount ? ` · ${inr(x.amount)}` : ''}${x.status ? ` <span class="st ${x.status === 'covered' ? 'executed' : 'rejected'}">${esc(x.status)}</span>` : ''}<div class="muted">${esc(x.law)}${x.amount_note ? ` · ${esc(x.amount_note)}` : ''}</div><div class="muted late">If late: ${esc(x.if_late)}</div></div></li>`).join('') || '<li class="muted">Nothing due.</li>';
    const u = c.udyam;
    $('#compNote').textContent = `${u && u.registered ? `Udyam: ${u.category}, ${u.activity}${u.activity === 'trading' ? ' (traders are outside the MSME 45-day payment rule)' : ''}. ` : 'Not Udyam-registered. '}${c.disclaimer}`;
  }

  async function loadShare() {
    if (ME.sme_role === 'viewer') { $('#share').innerHTML = '<div class="muted">Viewers can’t see lender data.</div>'; return; }
    const s = await api(`/api/sme/${TID}/privacy/lender-share`);
    $('#share').innerHTML = `<dl class="share">${Object.entries(s.features).map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(String(v))}</dd>`).join('')}</dl><div class="muted">Ledger commitment <code>${esc(s.ledger_commitment_sha256.slice(0, 16))}…</code><br>Never shared: ${esc(s.withheld.join(', ').replace(/_/g, ' '))}.</div>`;
  }

  async function loadAudit() {
    loadCockpit().catch(() => {});
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
    window.__fin = m; $('#kfsBox').innerHTML = '';
    $('#finBody').innerHTML = m.options.map((o, i) => `<tr><td>${esc(o.lender)}${m.recommendation?.product_id === o.product_id ? ' <span class="risk l">best</span>' : ''}${o.kfs ? ` <button class="linkish" data-kfsi="${i}">KFS</button>` : ''}</td><td class="r">${o.apr_pct}%</td><td class="r">${o.kfs ? `${o.kfs.apr_all_in_pct}%` : ''}</td><td class="r">${inr(o.est_monthly_payment)}</td><td class="r">${inr(o.est_total_cost)}</td><td>${o.eligible ? '<span class="ok">eligible</span>' : `<span class="no">${esc(o.blockers[0])}</span>`}</td></tr>`).join('');
  }
  $('#fin').onsubmit = runFin;
  $('#finBody').onclick = (e) => { const b = e.target.closest('[data-kfsi]'); if (!b || !window.__fin) return; const o = window.__fin.options[Number(b.dataset.kfsi)]; $('#kfsBox').innerHTML = `<div class="card"><div class="t">Key Facts Statement · ${esc(o.lender)}</div>${kfsHtml(o.kfs)}</div>`; };

  function say(who, text, extra = {}) {
    const d = document.createElement('div');
    d.className = `msg ${who}${extra.sec ? ' sec' : ''}`;
    d.innerHTML = esc(text) + (extra.note ? `<span class="note">🛡 ${esc(extra.note)}</span>` : '');
    $('#chat').appendChild(d); $('#chat').scrollTop = 1e9;
  }
  async function ask(q) {
    if (!q.trim()) return;
    openDrawer();
    say('u', q);
    try {
      const r = await api(`/api/sme/${TID}/copilot`, { method: 'POST', body: { message: q } });
      say('a', r.reply || '…', { sec: r.blocked || r.intent === 'phishing_warning', note: r.security_notice || (r.fallback_reason ? `LLM answer rejected (${r.fallback_reason.replace(/_/g, ' ')}); deterministic answer shown.` : '') });
      if (r.why_not?.length) { const w = document.createElement('div'); w.innerHTML = whyHtml(r.why_not); $('#chat').appendChild(w); $('#chat').scrollTop = 1e9; }
      if (r.steps?.length) { renderTrace(r.steps, r.planner); $('#briefPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      for (const c of r.cards || []) if (c.type === 'suggestion' && ME.sme_role !== 'viewer') {
        const b = document.createElement('button'); b.className = 'ghost'; b.textContent = c.label; b.style.alignSelf = 'flex-start';
        b.onclick = async () => {
          try {
            if (c.propose_discount) await api(`/api/sme/${TID}/discounts/${c.propose_discount}/propose`, { method: 'POST' });
            else await api(`/api/sme/${TID}/actions`, { method: 'POST', body: c.propose });
            toast('Queued for owner approval'); loadApprovals();
          } catch (err) { refuse(err); }
          b.remove();
        };
        $('#chat').appendChild(b);
      }
    } catch (err) { say('a', `Sorry, that failed (${err.message}).`); }
    loadApprovals(); loadAudit(); loadOverview(); loadBrief(); loadDiscounts();
  }
  $('#ask').onsubmit = (e) => { e.preventDefault(); const q = $('#q').value; $('#q').value = ''; ask(q); };
  document.querySelector('.chips').onclick = (e) => { const b = e.target.closest('button[data-q]'); if (b) ask(b.dataset.q); };

  // ---------- Cockpit: roles, runway, lanes, guardrails ----------
  async function loadRoles() {
    try {
      const { accounts } = await api('/api/auth/demo-accounts');
      const slug = TID.split('_')[1];
      const mine = accounts.filter((a) => a.key.startsWith('sme-') && (a.email.split('@')[0].split('.')[1] || '') === slug);
      const order = { owner: 0, accountant: 1, accounts: 1, viewer: 2 };
      mine.sort((a, b) => (order[a.email.split('.')[0]] ?? 9) - (order[b.email.split('.')[0]] ?? 9));
      if (mine.length < 2) { $('#roles').hidden = true; return; }
      const label = (a) => ({ owner: 'Owner', accounts: 'Accountant', accountant: 'Accountant', viewer: 'Viewer' }[a.email.split('.')[0]] || a.name);
      $('#roles').innerHTML = `<span class="muted">View as</span>${mine.map((a) => `<button class="${label(a).toLowerCase() === ME.sme_role ? 'on' : ''}" data-k="${esc(a.key)}">${esc(label(a))}</button>`).join('')}<span class="role-ag" title="The autopilot acts as its own identity. It can propose and pay under a signed mandate, never approve.">Autopilot agent: proposes, never approves</span>`;
      $('#roles').hidden = false;
      $('#roles').onclick = async (e) => {
        const b = e.target.closest('button[data-k]'); if (!b || b.classList.contains('on')) return;
        await api('/api/auth/demo-login', { method: 'POST', body: { key: b.dataset.k } });
        toast(`Now viewing as ${b.textContent}`); boot();
      };
    } catch { $('#roles').hidden = true; }
  }

  const KIND = { held_back: 'Held back', injection: 'Injection', denied: 'Denied' };
  async function loadCockpit() {
    const c = await api(`/api/sme/${TID}/cockpit`);
    const r = c.runway; const p = r.plan;
    const breach = r.lowest_unmitigated.low < r.safety_buffer;
    const fixed = !p.still_breaches_on;
    const queued = p.reminders || p.borrow_amount;
    $('#heroTitle').textContent = !breach ? `Cash stays above your ${inr(r.safety_buffer)} buffer` : queued ? (fixed ? `Approve ${p.reminders + (p.borrow_amount ? 1 : 0)} actions and the cash gap closes` : 'The plan helps, but cash still dips below the buffer') : `Cash dips below your buffer on ${r.first_breach}`;
    const step = (cls, label, val, sub) => `<div class="rw ${cls}"><div class="l">${label}</div><div class="v">${val}</div><div class="s">${sub}</div></div>`;
    $('#runway').innerHTML = step('', 'Cash today', inr(r.cash_today), `as of ${esc(c.as_of)}`)
      + '<div class="arrow">→</div>'
      + step(breach ? 'bad' : 'good', 'Lowest point if nothing changes', inr(r.lowest_unmitigated.low), `${esc(r.lowest_unmitigated.date)} · buffer ${inr(r.safety_buffer)}`)
      + '<div class="arrow">→</div>'
      + step('plan', 'Plan waiting for you', queued ? [p.reminders ? `${p.reminders} reminder${p.reminders > 1 ? 's' : ''}` : '', p.borrow_amount ? `${inr(p.borrow_amount)} loan` : ''].filter(Boolean).join(' + ') : (breach ? 'Nothing queued yet' : 'Nothing needed'), queued ? 'each needs your approval' : (breach ? 'press “Plan my cash gap”' : 'autopilot keeps watching'))
      + '<div class="arrow">→</div>'
      + step(queued ? (fixed ? 'good' : 'warn') : 'muted', 'Lowest point if you approve', queued ? inr(p.lowest_after.low) : '—', queued ? (fixed ? 'stays above the buffer' : `still below buffer on ${esc(p.still_breaches_on)}`) : '');
    const ap = c.autopilot;
    $('#apPill').hidden = false; $('#apPill').className = `appill ${ap.paused ? 'paused' : 'on'}`;
    $('#apPill').textContent = ap.paused ? 'Autopilot paused' : 'Autopilot on';
    $('#laneMandate').innerHTML = c.lanes.paid_by_mandate.length ? c.lanes.paid_by_mandate.map((a) => `<div class="card good"><div class="t">${esc(a.summary)}</div><div class="muted">${esc(a.mandate_id)} · receipt ${esc(a.receipt || '')}</div></div>`).join('')
      : '<div class="muted empty">Nothing paid on its own yet. The agent can only pay a supplier you signed a mandate for, within its limits.</div>';
    $('#laneBlocked').innerHTML = c.lanes.blocked.length ? c.lanes.blocked.map((b, i) => `<div class="card bad"><div class="t"><span class="kind">${KIND[b.kind] || 'Blocked'}</span> ${esc(b.title)}${b.amount ? ` · ${inr(b.amount)}` : ''}</div>${b.why_not?.[0] ? `<div class="muted">${esc(b.why_not[0].rule)}: ${esc(b.why_not[0].title)}</div><button class="linkish" data-bw="${i}">Why not?</button>` : ''}${b.seq ? `<div class="muted">audit #${b.seq} · ${esc(b.actor_role)}</div>` : ''}</div>`).join('')
      : '<div class="muted empty">Nothing blocked. Try the attack button in the copilot.</div>';
    $('#laneBlocked').onclick = (e) => { const b = e.target.closest('[data-bw]'); if (b) showWhy(c.lanes.blocked[Number(b.dataset.bw)].why_not); };
    const g = c.guardrails;
    $('#guard').innerHTML = `<span class="g-x"><b>${esc(ME.tenant_name)}</b></span>`
      + (g.audit ? `<span class="${g.audit.valid ? 'ok' : 'badc'}">Audit chain ${g.audit.valid ? `valid · ${g.audit.entries} entries · head ${esc(g.audit.head)}…` : `BROKEN at #${g.audit.broken_at_seq}`}</span>` : '<span class="muted">Audit hidden for viewers</span>')
      + `<span class="ok g-x">Numeric firewall armed</span><span class="ok g-x">Injection guard armed</span><span class="muted g-x">Planner: ${g.planner === 'deterministic' ? 'deterministic' : 'LLM + grounding check'}</span>`
      + (g.audit ? '<span class="gbtns"><button class="ghost" id="redteam">Run red-team</button><button class="ghost" id="drill">Run tamper drill</button></span>' : '');
    const d = $('#drill'); if (d) d.onclick = tamperDrill;
    const rt = $('#redteam'); if (rt) rt.onclick = runRedTeam;
  }

  async function tamperDrill() {
    try {
      const r = await api(`/api/sme/${TID}/audit/tamper-drill`, { method: 'POST' });
      if (!r.ran) return toast('Nothing in the audit chain yet');
      const e = r.edit;
      showWhy([{ rule: 'Hash-chained audit trail', title: `Edit caught at entry #${r.tampered_copy.broken_at_seq}`, detail: `We changed ${e.field} on entry #${r.edited_seq} from ${e.from} to ${e.to} in a copy of the chain. Its hash no longer matches (stored ${r.stored_hash_prefix}…, recomputed ${r.recomputed_hash_prefix}…), so verification fails right there.`, fix: `The live chain was not touched and is still ${r.live_chain.valid ? 'valid' : 'BROKEN'} (${r.live_chain.entries} entries).` }], null, 'Tamper drill');
      loadAudit();
    } catch (err) { refuse(err); }
  }

  async function runRedTeam() {
    const btn = $('#redteam'); if (btn) { btn.disabled = true; btn.textContent = 'Attacking…'; }
    try {
      const r = await api(`/api/sme/${TID}/redteam`, { method: 'POST' });
      document.querySelectorAll('.rtmodal').forEach((x) => x.remove());
      const m = document.createElement('div'); m.className = 'rtmodal'; m.setAttribute('role', 'dialog');
      m.innerHTML = `<div class="rt-in"><div class="rt-h"><div><b>Red-team: ${r.blocked} of ${r.attacks} attacks blocked</b><div class="muted">${r.money_moved ? 'Money moved during the run' : 'No money moved'} · audit chain ${r.audit_chain_valid ? 'still valid' : 'BROKEN'} (${r.audit_entries} entries) · ${r.ms} ms · anything queued was rejected again</div></div><button class="ghost" id="rtClose">✕</button></div>
        <div class="rt-list">${r.results.map((x) => `<div class="rt ${x.blocked ? 'ok' : 'fail'}"><span class="rt-s">${x.blocked ? 'BLOCKED' : 'PASSED'}</span><div><div><b>${esc(x.name)}</b> <span class="muted">· ${esc(x.group)}</span></div>${x.payload ? `<code>${esc(x.payload)}</code>` : ''}<div class="muted">${esc(x.caught_by || '')}${x.detail ? ` · ${esc(x.detail)}` : ''}</div></div></div>`).join('')}</div></div>`;
      document.body.appendChild(m);
      $('#rtClose').onclick = () => m.remove(); m.onclick = (e) => { if (e.target === m) m.remove(); };
    } catch (err) { refuse(err); }
    loadAudit(); loadApprovals();
  }

  function openDrawer() { $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); document.body.classList.add('drawer-open'); }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); document.body.classList.remove('drawer-open'); }
  $('#fab').onclick = () => ($('#drawer').classList.contains('open') ? closeDrawer() : openDrawer());
  $('#drawerClose').onclick = closeDrawer;
  $('#phoneClose').onclick = () => { $('#phone').hidden = true; };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); document.querySelectorAll('.rtmodal').forEach((x) => x.remove()); } });

  boot();
})();
