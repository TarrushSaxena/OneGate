// ============================================================
// PS18 EXPRESS + SOCKET.IO SERVER v2
// Real LLM backend — zenmux API + custom ML pipeline
// ============================================================

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const { v4: uuidv4 } = require('uuid');
const path     = require('path');

// ─── Data ─────────────────────────────────────────────────────
const fakeData = require('./data/fake-data');
const { kbArticles } = require('./data/knowledge-base');

// ─── ML & Services ────────────────────────────────────────────
const { initializeKBEngine } = require('./ml/embeddings');
const { engine: kbEngine }   = require('./ml/embeddings');
const classifier             = require('./ml/classifier');
const { analyzeMessage }     = require('./ml/sentiment');
const { orchestrate, generateWarmHandoffSummary, generateAgentSuggestedReply, TEMPLATES, redactPII } = require('./services/orchestrator');
const { assignTicket, escalateTicket } = require('./services/assignment');
const { computePriority, getSLAHours, computeETA, formatETAMessage, levelLabel } = require('./services/priority');
const { buildHandoffPayload, safeLevel } = require('./services/handoff');
const { isBusinessHours, buildOffHoursCard, getQueueStatus, buildBusyQueueCard } = require('./services/queueService');
const { checkHealth }        = require('./services/mlBridge');

// ─── App Setup ────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── In-Memory State ──────────────────────────────────────────
// Outside of the automated test harness the runtime starts EMPTY and is hydrated
// from real registered accounts only (no fabricated staff, tickets, or logs).
const USE_FIXTURES = process.env.NODE_ENV === 'test' || process.env.USE_FIXTURE_DATA === '1';
const state = {
  users:           USE_FIXTURES ? [...fakeData.users] : [],
  employees:       USE_FIXTURES ? [...fakeData.employees] : [],
  managers:        USE_FIXTURES ? [...fakeData.managers] : [],
  tickets:         USE_FIXTURES ? [...fakeData.tickets] : [],
  routingLogs:     USE_FIXTURES ? [...fakeData.routingLogs] : [],
  conversations:   {},     // userId → [messages]
  onlineEmployees: new Set(),
  outages:         [],     // active outage banners
};
app.set('state', state);

function hydrateRuntimeFromAccounts() {
  const store = require('./auth/accountStore');
  for (const a of store.listAccounts()) {
    if (a.active === false) continue;
    if (a.role === 'support_executive' && !state.employees.some(e => e.id === a.id)) {
      state.employees.push({
        id: a.id, name: a.name, email: a.email, department: a.department,
        tier: a.tier || 'L1', skill_tags: a.skill_tags || [],
        status: a.status || 'offline', current_load: a.current_load || 0,
        rolling_score: typeof a.rolling_score === 'number' ? a.rolling_score : 90,
        tenure: 1.0, certifications: [], avatar: '🧑‍💻', tickets_resolved: 0,
      });
    } else if (a.role === 'department_manager' && !state.managers.some(m => m.id === a.id)) {
      state.managers.push({ id: a.id, name: a.name, department: a.department, email: a.email, avatar: '👨‍💼', employee_ids: [] });
    } else if (a.role === 'employee' && !state.users.some(u => u.id === a.id)) {
      state.users.push({ id: a.id, name: a.name, email: a.email, role: 'user', department: a.department, avatar: '👤' });
    }
  }
}
if (!USE_FIXTURES) hydrateRuntimeFromAccounts();
app.set('io', io);

// ─── Initialize ML ─────────────────────────────────────────────
// Use extended KB from knowledge-base.js (merged with fake-data KB)
const allKBArticles = [...kbArticles, ...(fakeData.kbArticles || [])];
initializeKBEngine(allKBArticles);
console.log('[ML] Primary: DistilBERT Sequence Classifier (13 classes) + Multi-Intent (threshold 0.60)');
console.log('[ML] Fallback: Naive Bayes Multinomial Classifier (Laplace smoothing)');
console.log('[ML] TF-IDF KB engine ready (' + allKBArticles.length + ' articles)');
console.log('[ML] Sentiment/NLP pipeline ready');
console.log('[LLM] zenmux API wired — model: z-ai/glm-4.7-flash-free');
checkHealth().then(h => {
  if (h) console.log(`[ML] DistilBERT microservice connected (device: ${h.device}, status: ${h.status})`);
  else console.log('[ML] DistilBERT microservice not detected at 127.0.0.1:8000 (Naive Bayes fallback active)');
}).catch(() => {});

// ─── SLA Timer ────────────────────────────────────────────────
const slaTimer = setInterval(() => {
  // The legacy timer must not mutate the persistent pilot aggregate outside a transaction.
  return;
  const now = Date.now();
  state.tickets.forEach(ticket => {
    if (ticket.status === 'resolved' || ticket.status === 'escalated' || !ticket.sla_deadline) return;
    if (now > ticket.sla_deadline) {
      const esc = escalateTicket(ticket, state.employees, 'SLA breach');
      ticket.status = 'escalated';
      ticket.reassignment_count = (ticket.reassignment_count || 0) + 1;
      if (esc.assignment?.assigned) {
        const newEmp = state.employees.find(e => e.id === esc.assignment.assignedTo);
        const oldEmp = state.employees.find(e => e.id === ticket.assigned_to);
        if (newEmp) newEmp.current_load = Math.min(newEmp.current_load + 1, 10);
        if (oldEmp && oldEmp.current_load > 0) oldEmp.current_load--;
        ticket.assigned_to = esc.assignment.assignedTo;
      }
      ticket.required_tier = esc.newTier;

      const newLevelLbl = safeLevel(esc.newTier);
      const eta = computeETA(0, countOnlineAgents(ticket.department), ticket.priority);
      const etaStr = formatETAMessage(eta.etaLowMin, eta.etaHighMin);

      io.to(`user:${ticket.user_id}`).emit('ticket:status', {
        ticketId: ticket.id, status: 'escalated',
        eta: eta, etaStr,
        reason: 'SLA breach — moved to ' + newLevelLbl,
      });
      io.to(`user:${ticket.user_id}`).emit('message', {
        role: 'system',
        content: `⬆️ Moved up to ${newLevelLbl}. This needs deeper access. Your notes went with it. New estimate: ${etaStr}.`,
        timestamp: new Date().toISOString(),
      });
      io.emit('ticket:escalated', { ticketId: ticket.id, reason: 'SLA breach', newTier: esc.newTier });
      console.log(`[SLA] Ticket ${ticket.id} auto-escalated`);
    }
  });

  // Check outages: group similar issues
  checkForOutages();
  io.emit('dashboard:update', buildDashboardData());
}, 5000);
if (slaTimer.unref) slaTimer.unref();

// ─── Helpers ──────────────────────────────────────────────────
function countOnlineAgents(dept) {
  return state.employees.filter(e => e.department === dept && e.status === 'online').length;
}

function countAheadInQueue(dept, priority) {
  const order = ['critical','high','medium','low'];
  const pi = order.indexOf(priority);
  return state.tickets.filter(t =>
    t.department === dept &&
    t.status !== 'resolved' &&
    order.indexOf(t.priority) <= pi
  ).length;
}

function buildDashboardData() {
  return ['IT','HR','Finance','Facilities'].map(dept => {
    const deptTickets  = state.tickets.filter(t => t.department === dept);
    const deptEmps     = state.employees.filter(e => e.department === dept);
    const open         = deptTickets.filter(t => t.status !== 'resolved');
    const resolved     = deptTickets.filter(t => t.status === 'resolved');
    const csatItems    = resolved.filter(t => t.csat);
    const avgCSAT      = csatItems.length ? csatItems.reduce((s,t) => s+t.csat,0) / csatItems.length : 4.2;
    const now          = Date.now();
    const breachRisk   = open.filter(t => t.sla_deadline && (t.sla_deadline - now) < 1800000).length;
    const accuracy     = state.routingLogs.length
      ? state.routingLogs.filter(l => !l.corrected_department).length / state.routingLogs.length
      : 0.91;

    return {
      department: dept,
      open: open.length,
      resolved: resolved.length,
      avgCSAT: parseFloat(avgCSAT.toFixed(1)),
      breachRisk,
      totalEmployees: deptEmps.length,
      onlineEmployees: deptEmps.filter(e => e.status === 'online').length,
      avgLoad: parseFloat((deptEmps.reduce((s,e)=>s+e.current_load,0) / (deptEmps.length||1)).toFixed(1)),
      routingAccuracy: parseFloat((accuracy * 100).toFixed(1)),
    };
  });
}

function checkForOutages() {
  // Detect if >3 tickets in same dept with same tag in last 15 min
  const now = Date.now();
  const recent = state.tickets.filter(t => (now - (t.created_at||0)) < 900000);
  const deptCount = {};
  recent.forEach(t => { deptCount[t.department] = (deptCount[t.department]||0)+1; });
  Object.entries(deptCount).forEach(([dept, count]) => {
    if (count >= 3 && !state.outages.find(o => o.dept === dept && !o.resolved)) {
      const outage = { id: uuidv4(), dept, count, created_at: now, resolved: false };
      state.outages.push(outage);
      io.emit('outage:announced', {
        department: dept,
        message: `${dept} is seeing a surge of similar issues. We're actively investigating. Updates here.`,
        ticketCount: count,
      });
    }
  });
}

function updateQueuePositions(dept) {
  const deptTickets = state.tickets.filter(t => t.department === dept && t.status !== 'resolved');
  deptTickets.forEach((t, idx) => {
    const newPos = idx + 1;
    if (t.queue_position !== newPos) {
      t.queue_position = newPos;
      io.to(`user:${t.user_id}`).emit('queue:position_changed', {
        ticketId: t.id,
        queuePosition: newPos,
        message: `Queue update: You're now ${newPos}${newPos === 1 ? 'st' : newPos === 2 ? 'nd' : newPos === 3 ? 'rd' : 'th'} in line.`,
      });
    }
  });
}

// ─── AUTH & ADMIN ROUTES ──────────────────────────────────────
const authRoutes = require('./auth/routes');
const adminRoutes = require('./routes/admin');
const managerRoutes = require('./routes/manager');
const corporateRoutes = require('./routes/corporate');
const { authenticate, requireRoles } = require('./auth/middleware');
const { ROLES } = require('./auth/roles');
const accountStore = require('./auth/accountStore');
const auditService = require('./services/audit');

app.use('/api/auth', authRoutes);
app.use('/api', authenticate);
app.get('/api/policies', (req,res) => res.json({articles:allKBArticles.map(({id,department,title,source_citation})=>({id,department,title,source_citation})),pdf:'/api/policies/handbook.pdf'}));
app.get('/api/policies/handbook.pdf', (req,res) => {res.setHeader('Content-Disposition','inline; filename="onegate-company-policies.pdf"');res.sendFile(path.join(__dirname,'data/policy-pdfs/company-policies.pdf'));});
const pilot = require('./routes/pilot').installPilot(app, io, state);
app.use('/api/admin', adminRoutes);
// OneGate SME Finance Copilot (FinTechathon 2026, Topic E). Tenant-scoped, sandbox-only.
app.use('/api/sme', require('./sme/routes'));
// Legacy manager/corporate routes use fixture or in-memory records. The pilot
// dashboard and workplace router above replace them with scoped durable records.
// Retired memory-backed endpoints must not bypass pilot ownership or storage.
app.use('/api', (req, res) => res.status(404).json({ error: 'endpoint_retired', message: 'Use the persistent pilot API.' }));

// ─── ROLE-BASED PAGE ROUTING GUARDS (/app/*) ─────────────────
app.get('/app/chat', authenticate, requireRoles(ROLES.EMPLOYEE), (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/app/inbox', authenticate, requireRoles(ROLES.SUPPORT_EXECUTIVE), (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/app/department', authenticate, requireRoles(ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/app/org', authenticate, requireRoles(ROLES.MAIN_MANAGER), (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── Chat: Main Message ────────────────────────────────────────
app.post('/api/chat/message', async (req, res) => {
  const { userId, message, conversationId } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Empty message' });

  const convKey = conversationId || userId;
  if (!state.conversations[convKey]) state.conversations[convKey] = [];
  const history = state.conversations[convKey];

  const userMsg = {
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
    id: uuidv4(),
  };
  history.push(userMsg);

  // Emit typing indicator to any employee watching this user
  io.emit('ai:typing:start', { userId });

  try {
    const result = await orchestrate(message, history, userId);

    // Log routing
    state.routingLogs.push({
      id: uuidv4(),
      message_id: userMsg.id,
      predicted_department: result.department,
      confidence: result.confidence,
      corrected_department: null,
      timestamp: Date.now(),
    });

    let ticket = null;
    let assignee = null;

    // ── Handle AI Self-Fix Attempt (USP-1) ────────────────────────
    if (result.action === 'ai_attempted') {
      const fix = result.fix || {};
      const newTicket = {
        id:                     't' + uuidv4().slice(0, 8),
        user_id:                userId,
        department:             result.department,
        tags:                   result.tags || ['self_fix'],
        priority:               result.priority || 'normal',
        priority_reason:        result.priority_reason || 'Known self-service resolution path',
        required_tier:          'L1',
        required_tier_snapshot: 'L1',
        resolution_type:        'ai_attempted',
        status:                 'ai_attempted',
        assigned_to:            null,
        transcript:             [...history],
        reassignment_count:     0,
        escalation_history:     [],
        sla_deadline:           null,
        created_at:             Date.now(),
        resolved_at:            null,
        first_reply_at:         null,
        csat:                   null,
        eta_low_min:            null,
        eta_high_min:           null,
        warm_summary:           null,
        agent_suggested_reply:  null,
        ai_attempt: {
          id:                   'attempt_' + uuidv4().slice(0, 8),
          ticket_id:            null,
          fix_title:            fix.title || 'Self-service fix',
          fix_text:             fix.fix_text || result.response,
          source_clause_id:     fix.source_clause_id || 'KB-SELF-FIX',
          source_citation:      fix.source_citation || 'Enterprise Handbook',
          outcome:              'pending',
          attempted_at:         Date.now(),
          follow_up_due_at:     Date.now() + (fix.follow_up_window_hours || 24) * 3600000,
        },
      };
      newTicket.ai_attempt.ticket_id = newTicket.id;
      state.tickets.push(newTicket);
      ticket = newTicket;

      io.to(`user:${userId}`).emit('ticket:created', {
        ticket: { id: newTicket.id, status: newTicket.status, department: newTicket.department, resolution_type: 'ai_attempted' },
      });
      io.emit('dashboard:update', buildDashboardData());
    }

    // ── Handle Human Ticket Creation (USP-1 & USP-3) ──────────────
    if (result.action === 'ticket') {
      const ahead = countAheadInQueue(result.department, result.priority);
      const online = countOnlineAgents(result.department);
      const eta   = computeETA(ahead, online, result.priority);

      const newTicket = {
        id:                     't' + uuidv4().slice(0, 8),
        user_id:                userId,
        department:             result.department,
        tags:                   result.tags || [],
        priority:               result.priority,
        priority_reason:        result.priority_reason,
        required_tier:          result.priority === 'critical' || result.priority === 'high' ? 'L2' : 'L1',
        required_tier_snapshot: result.priority === 'critical' || result.priority === 'high' ? 'L2' : 'L1',
        resolution_type:        'human_required',
        status:                 'open',
        assigned_to:            null,
        transcript:             [...history],
        reassignment_count:     0,
        escalation_history:     [],
        sla_deadline:           Date.now() + getSLAHours(result.priority) * 3600000,
        created_at:             Date.now(),
        resolved_at:            null,
        first_reply_at:         null,
        csat:                   null,
        eta_low_min:            eta.etaLowMin,
        eta_high_min:           eta.etaHighMin,
        warm_summary:           null,
        agent_suggested_reply:  null,
      };

      // Assign with explainability
      const assignment = assignTicket(newTicket, state.employees);
      if (assignment.assigned) {
        newTicket.assigned_to = assignment.assignedTo;
        newTicket.status = 'acknowledged';
        newTicket.assignment = {
          agent_id: assignment.assignedTo,
          agent_name: assignment.assigneeName,
          score: assignment.score,
          reason: assignment.reason,
          safe_summary: assignment.safe_summary,
          matched_factors: assignment.matched_factors,
          required_tier_snapshot: assignment.required_tier_snapshot,
          created_at: assignment.assigned_at,
        };
        assignee = state.employees.find(e => e.id === assignment.assignedTo);
        if (assignee) assignee.current_load++;

        auditService.logAuditEvent({
          actor_id: 'system',
          actor_name: 'Routing Engine',
          actor_type: 'system',
          action: 'ticket_assigned',
          target_type: 'ticket',
          target_id: newTicket.id,
          department: newTicket.department,
          details: `Assigned ticket #${newTicket.id} to ${assignment.assigneeName} (${assignment.required_tier_snapshot}). Score: ${assignment.score}/100`,
          metadata: {
            agent_id: assignment.assignedTo,
            score: assignment.score,
            reason: assignment.reason,
            matched_factors: assignment.matched_factors,
            required_tier_snapshot: assignment.required_tier_snapshot,
          },
        });
      }

      state.tickets.push(newTicket);
      ticket = newTicket;

      // Build handoff payload
      const handoff = buildHandoffPayload(newTicket, assignee, eta.etaLowMin, eta.etaHighMin);
      const levelLbl = handoff.level_label;
      const etaStr   = formatETAMessage(eta.etaLowMin, eta.etaHighMin);

      // Check operating hours (State 9)
      const bizHours = isBusinessHours(new Date(), result.department);
      if (bizHours.isOffline) {
        handoff.is_off_hours = true;
        handoff.online_at = bizHours.onlineAt;
        const topKb = kbEngine.search(message, result.department, 1)?.topResult;
        const offHoursCard = buildOffHoursCard(result.department, bizHours.onlineAt, topKb);
        handoff.off_hours_card = offHoursCard;
        result.response = offHoursCard.message;
      } else {
        // Normal in-hours ticket copy
        result.response = TEMPLATES.ticket_created(
          result.department,
          newTicket.id,
          result.priority,
          handoff.assigned_first_name,
          levelLbl,
          eta.etaLowMin,
          eta.etaHighMin,
        );
      }

      // Check queue status (State 10: No One Free)
      const qStatus = getQueueStatus(result.department, result.priority, newTicket.required_tier, state.employees, state.tickets);
      if (qStatus.isBusy && qStatus.queuePosition > 1) {
        handoff.queue_position = qStatus.queuePosition;
        newTicket.queue_position = qStatus.queuePosition;
        const busyCard = buildBusyQueueCard(qStatus.queuePosition, eta.etaLowMin, eta.etaHighMin);
        handoff.busy_queue_card = busyCard;
      }

      // Generate warm handoff summary (async, don't await response)
      generateWarmHandoffSummary(history, result.department).then(summary => {
        newTicket.warm_summary = summary;
        // Also generate agent suggested reply
        const kb = kbEngine.search(message, result.department, 1);
        if (kb) {
          generateAgentSuggestedReply(newTicket, kb).then(suggestReply => {
            newTicket.agent_suggested_reply = suggestReply;
          }).catch(() => {});
        }
      }).catch(() => {});

      // Notify employee
      if (assignment.assigned) {
        io.to(`employee:${assignment.assignedTo}`).emit('ticket:new', { ticket: newTicket, handoff });
      }

      // Notify user
      io.to(`user:${userId}`).emit('ticket:created', { ticket: { id:newTicket.id, status:newTicket.status, department:newTicket.department, resolution_type: 'human_required' }, handoff });
      io.emit('dashboard:update', buildDashboardData());
    }

    io.emit('ai:typing:stop', { userId });

    const resolution_type = result.resolution_type || (result.action === 'answer' ? 'answer' : (result.action === 'ai_attempted' ? 'ai_attempted' : 'human_required'));
    const resolution_label = result.resolution_label || (resolution_type === 'answer' ? 'Answered directly' : (resolution_type === 'ai_attempted' ? 'Tried a fix' : 'Connecting you with a person'));
    const resolution_color = result.resolution_color || (resolution_type === 'answer' ? 'blue' : (resolution_type === 'ai_attempted' ? 'amber' : 'purple'));
    const resolution_icon = result.resolution_icon || (resolution_type === 'answer' ? 'info' : (resolution_type === 'ai_attempted' ? 'wrench' : 'headset'));

    const assistantMsg = {
      role:      'assistant',
      content:   result.response,
      timestamp: new Date().toISOString(),
      id:        uuidv4(),
      resolution_type,
      resolution_label,
      resolution_color,
      resolution_icon,
      ticket_id: ticket?.id || null,
      ticket_status: ticket?.status || null,
      ai_attempt: ticket?.ai_attempt || null,
      metadata: {
        resolution_type,
        resolution_label,
        resolution_color,
        resolution_icon,
        department:            result.department,
        raw_department:        result.raw_department || result.department,
        confidence:            parseFloat((result.confidence * 100).toFixed(1)),
        department_confidence: parseFloat((result.confidence * 100).toFixed(1)),
        model:                 result.model || 'DistilBERT',
        fallbackUsed:          !!result.fallbackUsed,
        intent_type:           result.intent_type || 'SINGLE',
        intent_confidence:     result.intent_confidence !== undefined ? result.intent_confidence : result.confidence,
        multi_probability:     result.multi_probability !== undefined ? result.multi_probability : 0,
        single_probability:    result.single_probability !== undefined ? result.single_probability : 1,
        multi_threshold:       result.multi_threshold || 0.60,
        type:                  result.type,
        kbArticle:             result.kbArticle || null,
        priority:              result.priority,
        priority_reason:       result.priority_reason,
        usedLLM:               !!result.usedLLM,
        latency:               result.latency,
        nlp: {
          sentiment: result.nlp?.sentiment?.label,
          priority:  result.nlp?.priority,
          intents:   result.nlp?.intents,
        },
      },
    };
    history.push(assistantMsg);

    res.json({
      message: assistantMsg,
      resolution_type,
      resolution_label,
      ticket: ticket ? {
        id: ticket.id,
        status: ticket.status,
        resolution_type: ticket.resolution_type,
        department: ticket.department,
        priority: ticket.priority,
        priority_reason: ticket.priority_reason,
        sla_deadline: ticket.sla_deadline,
        eta_low_min: ticket.eta_low_min,
        eta_high_min: ticket.eta_high_min,
        assigned_name: assignee ? assignee.name : null,
        assigned_tier: assignee ? assignee.tier : null,
        assigned_to: ticket.assigned_to || null,
        assignment: ticket.assignment || null,
        ai_attempt: ticket.ai_attempt || null,
        ai_attempt_id: ticket.ai_attempt?.id || null,
        follow_up_due_at: ticket.ai_attempt?.follow_up_due_at || null,
        warm_summary: ticket.warm_summary || null,
        created_at: ticket.created_at,
      } : null,
      routing: {
        resolution_type,
        resolution_label,
        resolution_color,
        department:            result.department,
        raw_department:        result.raw_department || result.department,
        confidence:            parseFloat((result.confidence * 100).toFixed(1)),
        department_confidence: parseFloat((result.confidence * 100).toFixed(1)),
        model:                 result.model || 'DistilBERT',
        fallbackUsed:          !!result.fallbackUsed,
        fallbackReason:        result.fallbackReason || null,
        intent_type:           result.intent_type || 'SINGLE',
        intent_confidence:     result.intent_confidence !== undefined ? result.intent_confidence : result.confidence,
        multi_probability:     result.multi_probability !== undefined ? result.multi_probability : 0,
        single_probability:    result.single_probability !== undefined ? result.single_probability : 1,
        multi_threshold:       result.multi_threshold || 0.60,
        action:                result.action,
        latency:               result.latency,
        usedLLM:               !!result.usedLLM,
      },
    });

  } catch (err) {
    io.emit('ai:typing:stop', { userId });
    console.error('[Orchestrator error]', err);
    res.status(500).json({ error: 'Internal error', detail: err.message });
  }
});

// Get conversation history
app.get('/api/chat/conversation/:userId', (req, res) => {
  res.json({ messages: state.conversations[req.params.userId] || [] });
});

// ─── Tickets ──────────────────────────────────────────────────
app.get('/api/tickets', (req, res) => {
  let { department, status, userId } = req.query;

  // Extract auth token/cookie if provided to enforce role scoping
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }
  if (!token && req.headers['cookie']) {
    const { parseCookie } = require('./auth/tokens');
    const { SESSION_COOKIE_NAME } = require('./auth/config');
    token = parseCookie(req.headers['cookie'], SESSION_COOKIE_NAME);
  }

  if (token) {
    try {
      const { verifyToken } = require('./auth/tokens');
      const decoded = verifyToken(token);
      if (decoded.role === ROLES.DEPARTMENT_MANAGER || decoded.role === ROLES.SUPPORT_EXECUTIVE) {
        department = decoded.dept; // Hard-scope to user department
      }
    } catch (_) {}
  }

  let filtered = state.tickets;
  if (department) filtered = filtered.filter(t => t.department === department);
  if (status)     filtered = filtered.filter(t => t.status === status);
  if (userId)     filtered = filtered.filter(t => t.user_id === userId);
  res.json(filtered.sort((a,b) => (a.sla_deadline||0) - (b.sla_deadline||0)));
});

app.get('/api/tickets/:id', (req, res) => {
  const ticket = state.tickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Not found' });
  const assignee = state.employees.find(e => e.id === ticket.assigned_to);

  // Determine caller role if authentication token is present
  let callerRole = null;
  const authHeader = req.headers['authorization'];
  let rawToken = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.substring(7).trim();
  }
  if (!rawToken && req.headers['cookie']) {
    const { parseCookie } = require('./auth/tokens');
    const { SESSION_COOKIE_NAME } = require('./auth/config');
    rawToken = parseCookie(req.headers['cookie'], SESSION_COOKIE_NAME);
  }

  if (rawToken) {
    try {
      const { verifyToken } = require('./auth/tokens');
      const decoded = verifyToken(rawToken);
      callerRole = decoded.role;
    } catch (_) {}
  }

  let assignmentPayload = ticket.assignment || null;
  if (assignmentPayload && callerRole === ROLES.EMPLOYEE) {
    // Redact internal raw score and matched factor tags for employees; provide safe summary
    assignmentPayload = {
      agent_id: assignmentPayload.agent_id,
      agent_name: assignmentPayload.agent_name,
      safe_summary: assignmentPayload.safe_summary,
      reason: assignmentPayload.safe_summary,
      required_tier_snapshot: assignmentPayload.required_tier_snapshot,
      created_at: assignmentPayload.created_at,
    };
  }

  res.json({
    ...ticket,
    ticket,
    assignment: assignmentPayload,
    assignee: assignee ? { name: assignee.name, avatar: assignee.avatar, tier: assignee.tier, level_label: safeLevel(assignee.tier) } : null,
  });
});

// ─── AI Self-Fix Attempt Confirm (USP-1: Worked -> Auto-Resolve) ────────
app.post('/api/tickets/:id/ai-attempt/confirm', (req, res) => {
  const ticket = state.tickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (ticket.status === 'resolved') {
    return res.json({ success: true, ticket_id: ticket.id, status: 'resolved', outcome: ticket.ai_attempt?.outcome || 'confirmed_working', ticket });
  }

  ticket.status = 'resolved';
  ticket.resolved_at = Date.now();
  ticket.resolution_summary = 'Resolved after recommended self-service fix. No specialist was needed.';

  if (ticket.ai_attempt) {
    ticket.ai_attempt.outcome = 'confirmed_working';
    ticket.ai_attempt.confirmed_at = Date.now();
  }

  const systemMsg = {
    role: 'system',
    content: 'Issue marked as resolved. Resolved after the recommended fix. No specialist was needed.',
    timestamp: new Date().toISOString(),
    id: uuidv4(),
    ticketId: ticket.id,
  };

  if (!state.conversations[ticket.user_id]) state.conversations[ticket.user_id] = [];
  state.conversations[ticket.user_id].push(systemMsg);
  ticket.transcript = ticket.transcript || [];
  ticket.transcript.push(systemMsg);

  io.to(`user:${ticket.user_id}`).emit('message', systemMsg);
  io.to(`user:${ticket.user_id}`).emit('ticket:status', { ticketId: ticket.id, status: 'resolved' });
  io.emit('dashboard:update', buildDashboardData());

  return res.json({ success: true, ticket_id: ticket.id, status: 'resolved', outcome: 'confirmed_working', ticket });
});

// ─── AI Self-Fix Attempt Escalate (USP-1: Still Broken -> Connect Human) ─
app.post('/api/tickets/:id/ai-attempt/escalate', (req, res) => {
  const ticket = state.tickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  // Idempotent: if already converted/assigned, return existing assignment
  if (ticket.status === 'assigned' || ticket.status === 'acknowledged' || ticket.status === 'in_progress') {
    return res.json({ success: true, ticket_id: ticket.id, status: ticket.status, outcome: 'still_broken', assignment: ticket.assignment, ticket });
  }

  ticket.status = 'human_required';
  ticket.resolution_type = 'human_required';
  ticket.human_required_at = Date.now();

  if (ticket.ai_attempt) {
    ticket.ai_attempt.outcome = 'still_broken';
  }

  ticket.sla_deadline = Date.now() + getSLAHours(ticket.priority || 'normal') * 3600000;

  // Invoke assignment exactly once
  const assignment = assignTicket(ticket, state.employees);
  let assignee = null;
  if (assignment.assigned) {
    ticket.assigned_to = assignment.assignedTo;
    ticket.status = 'assigned';
    ticket.assignment = {
      agent_id: assignment.assignedTo,
      agent_name: assignment.assigneeName,
      score: assignment.score,
      reason: assignment.reason,
      safe_summary: assignment.safe_summary,
      matched_factors: assignment.matched_factors,
      required_tier_snapshot: assignment.required_tier_snapshot,
      created_at: assignment.assigned_at,
    };
    assignee = state.employees.find(e => e.id === assignment.assignedTo);
    if (assignee) assignee.current_load++;

    auditService.logAuditEvent({
      actor: req.user,
      action: 'ticket_escalated_from_ai_attempt',
      target_type: 'ticket',
      target_id: ticket.id,
      department: ticket.department,
      details: `Ticket escalated from AI attempt to human support. Assigned to ${assignment.assigneeName} (${assignment.required_tier_snapshot}). Score: ${assignment.score}/100`,
      metadata: {
        agent_id: assignment.assignedTo,
        score: assignment.score,
        fix_attempted: ticket.ai_attempt?.fix_title,
      },
    });
  }

  // Warm handoff summary with explicit "Do not repeat"
  const attemptedFixName = ticket.ai_attempt?.fix_title || 'recommended self-service steps';
  ticket.warm_summary = `AI handoff summary:\n• Issue: Requester experienced persistent incident.\n• AI action: Recommended and attempted self-service fix (${attemptedFixName}).\n• Employee outcome: Fix was tried and employee reported still broken.\n• Do not repeat: Employee has already tried the reset steps.`;

  const confirmMsg = {
    role: 'assistant',
    content: 'Thanks — I’ll connect you with a specialist now. I’ve included the steps already tried so you won’t need to repeat them.',
    timestamp: new Date().toISOString(),
    id: uuidv4(),
    resolution_type: 'human_required',
    resolution_label: 'Connecting you with a person',
    resolution_color: 'purple',
    ticket_id: ticket.id,
  };

  if (!state.conversations[ticket.user_id]) state.conversations[ticket.user_id] = [];
  state.conversations[ticket.user_id].push(confirmMsg);
  ticket.transcript = ticket.transcript || [];
  ticket.transcript.push(confirmMsg);

  if (assignment.assigned) {
    const ahead = countAheadInQueue(ticket.department, ticket.priority);
    const online = countOnlineAgents(ticket.department);
    const eta = computeETA(ahead, online, ticket.priority);
    const handoff = buildHandoffPayload(ticket, assignee, eta.etaLowMin, eta.etaHighMin);
    io.to(`employee:${assignment.assignedTo}`).emit('ticket:new', { ticket, handoff });
  }

  io.to(`user:${ticket.user_id}`).emit('message', confirmMsg);
  io.to(`user:${ticket.user_id}`).emit('ticket:status', { ticketId: ticket.id, status: ticket.status });
  io.emit('dashboard:update', buildDashboardData());

  return res.json({ success: true, ticket_id: ticket.id, status: ticket.status, outcome: 'still_broken', assignment: ticket.assignment, ticket });
});

// Update ticket status / send employee reply
app.patch('/api/tickets/:id/status', authenticate, requireRoles(ROLES.SUPPORT_EXECUTIVE, ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const { status, message: empMessage, employeeId, reason } = req.body;
  const ticket = state.tickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Not found' });

  const oldStatus = ticket.status;
  ticket.status = status;

  if (status === 'resolved') {
    ticket.resolved_at = Date.now();
    const emp = state.employees.find(e => e.id === ticket.assigned_to);
    if (emp && emp.current_load > 0) emp.current_load--;
    if (emp) {
      const bonus = ticket.sla_deadline > Date.now() ? 5 : -3;
      emp.rolling_score = Math.min(100, (emp.rolling_score||50) + bonus * 0.1);
      emp.tickets_resolved = (emp.tickets_resolved || 0) + 1;
    }
    // Predict CSAT
    const { predictCSAT } = require('./ml/sentiment');
    ticket.csat = predictCSAT(ticket.transcript || [], ticket.resolved_at - (ticket.created_at||0));
    updateQueuePositions(ticket.department);
  }

  if (status === 'escalated' && oldStatus !== 'escalated') {
    ticket.reassignment_count = (ticket.reassignment_count||0) + 1;
    ticket.escalation_history = ticket.escalation_history || [];
    ticket.escalation_history.push({
      from_status: oldStatus, reason: reason || 'Manual escalation',
      timestamp: Date.now(), by_employee: employeeId,
    });
    const esc = escalateTicket(ticket, state.employees, reason || 'Manual escalation');
    if (esc.assignment?.assigned) {
      const newEmp = state.employees.find(e => e.id === esc.assignment.assignedTo);
      const oldEmp = state.employees.find(e => e.id === ticket.assigned_to);
      if (newEmp) newEmp.current_load = Math.min(newEmp.current_load+1, 10);
      if (oldEmp && oldEmp.current_load > 0) oldEmp.current_load--;
      ticket.assigned_to = esc.assignment.assignedTo;
    }
    ticket.required_tier = esc.newTier;
    const newLevelLbl = safeLevel(esc.newTier);
    const eta = computeETA(0, countOnlineAgents(ticket.department), ticket.priority);
    const etaStr = formatETAMessage(eta.etaLowMin, eta.etaHighMin);
    io.to(`user:${ticket.user_id}`).emit('message', {
      role: 'system',
      content: `⬆️ Moved up to ${newLevelLbl}. ${reason || 'Needs deeper access'}. Your notes went with it. New estimate: ${etaStr}.`,
      timestamp: new Date().toISOString(),
    });
  }

  // Add employee reply
  if (empMessage) {
    if (!state.conversations[ticket.user_id]) state.conversations[ticket.user_id] = [];
    const empObj = state.employees.find(e => e.id === employeeId) || accountStore.findById(employeeId) || req.user;
    const msg = {
      role:          'employee',
      content:       empMessage,
      employeeName:  empObj?.name || req.user?.name || 'Support Agent',
      employeeAvatar:empObj?.avatar || '👤',
      employeeLevel: empObj?.tier ? safeLevel(empObj.tier) : (req.user?.tier ? safeLevel(req.user.tier) : 'Level 1 support'),
      timestamp:     new Date().toISOString(),
      id:            uuidv4(),
      ticketId:      ticket.id,
    };
    state.conversations[ticket.user_id].push(msg);
    ticket.transcript.push(msg);
    if (!ticket.first_reply_at) ticket.first_reply_at = Date.now();
    io.to(`user:${ticket.user_id}`).emit('message', msg);
  }

  io.to(`user:${ticket.user_id}`).emit('ticket:status', {
    ticketId: ticket.id, status, oldStatus,
    reason: reason || null,
  });
  io.emit('dashboard:update', buildDashboardData());
  res.json({ success: true, ticket });
});

// Reopen ticket
app.post('/api/tickets/:id/reopen', (req, res) => {
  const ticket = state.tickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Not found' });

  ticket.status = 'open';
  ticket.resolved_at = null;

  // Bump priority one step
  const order = ['low','medium','high','critical'];
  const idx = order.indexOf(ticket.priority);
  if (idx < order.length - 1) ticket.priority = order[idx + 1];
  ticket.priority_reason = 'Reopened — moved to front of queue';

  // Extend SLA
  ticket.sla_deadline = Date.now() + getSLAHours(ticket.priority) * 3600000;

  io.to(`user:${ticket.user_id}`).emit('ticket:status', { ticketId:ticket.id, status:'open', reason:'Reopened. This goes to the front of the line.' });
  io.to(`user:${ticket.user_id}`).emit('message', {
    role: 'system',
    content: `Reopened. This goes to the front of the line. Priority bumped to **${ticket.priority}**.`,
    timestamp: new Date().toISOString(),
  });
  io.emit('dashboard:update', buildDashboardData());
  res.json({ success:true, ticket });
});

// Reply to ticket from agent
app.post('/api/tickets/:id/reply', authenticate, requireRoles(ROLES.SUPPORT_EXECUTIVE, ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const { message: empMessage, employeeId } = req.body;
  const ticket = state.tickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Not found' });

  const empObj = state.employees.find(e => e.id === employeeId) || accountStore.findById(employeeId) || req.user;
  const msg = {
    role:          'employee',
    content:       empMessage,
    employeeName:  empObj?.name || req.user?.name || 'Support Agent',
    employeeAvatar:empObj?.avatar || '🧑‍💻',
    employeeLevel: empObj?.tier ? safeLevel(empObj.tier) : (req.user?.tier ? safeLevel(req.user.tier) : 'Level 2 specialist'),
    timestamp:     new Date().toISOString(),
    id:            uuidv4(),
    ticketId:      ticket.id,
  };

  if (!state.conversations[ticket.user_id]) state.conversations[ticket.user_id] = [];
  state.conversations[ticket.user_id].push(msg);
  ticket.transcript = ticket.transcript || [];
  ticket.transcript.push(msg);
  if (!ticket.first_reply_at) ticket.first_reply_at = Date.now();

  io.to(`user:${ticket.user_id}`).emit('message', msg);
  res.json({ success: true, message: msg });
});

// Resolve ticket
app.post('/api/tickets/:id/resolve', authenticate, requireRoles(ROLES.SUPPORT_EXECUTIVE, ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const { resolutionSummary } = req.body;
  const ticket = state.tickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Not found' });

  ticket.status = 'resolved';
  ticket.resolved_at = Date.now();
  ticket.resolution_summary = resolutionSummary || 'Issue addressed and resolved by specialist.';

  const emp = state.employees.find(e => e.id === ticket.assigned_to);
  if (emp && emp.current_load > 0) emp.current_load--;
  if (emp) {
    const bonus = ticket.sla_deadline > Date.now() ? 5 : -3;
    emp.rolling_score = Math.min(100, (emp.rolling_score || 50) + bonus * 0.1);
    emp.tickets_resolved = (emp.tickets_resolved || 0) + 1;
  }

  const { predictCSAT } = require('./ml/sentiment');
  ticket.csat = predictCSAT(ticket.transcript || [], ticket.resolved_at - (ticket.created_at || 0));
  updateQueuePositions(ticket.department);

  io.to(`user:${ticket.user_id}`).emit('ticket:status', {
    ticketId: ticket.id,
    status: 'resolved',
    resolutionSummary: ticket.resolution_summary,
  });

  io.to(`user:${ticket.user_id}`).emit('message', {
    role: 'system',
    isResolution: true,
    ticketId: ticket.id,
    content: `Marked resolved. ${ticket.resolution_summary}`,
    timestamp: new Date().toISOString(),
  });

  io.emit('dashboard:update', buildDashboardData());
  res.json({ success: true, ticket });
});

// Escalate ticket
app.post('/api/tickets/:id/escalate', authenticate, requireRoles(ROLES.SUPPORT_EXECUTIVE, ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const { reason, employeeId } = req.body;
  const ticket = state.tickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Not found' });

  const oldStatus = ticket.status;
  ticket.status = 'escalated';
  ticket.reassignment_count = (ticket.reassignment_count || 0) + 1;
  ticket.escalation_history = ticket.escalation_history || [];
  ticket.escalation_history.push({
    from_status: oldStatus,
    reason: reason || 'Manual escalation',
    timestamp: Date.now(),
    by_employee: employeeId,
  });

  const esc = escalateTicket(ticket, state.employees, reason || 'Manual escalation');
  if (esc.assignment?.assigned) {
    const newEmp = state.employees.find(e => e.id === esc.assignment.assignedTo);
    const oldEmp = state.employees.find(e => e.id === ticket.assigned_to);
    if (newEmp) newEmp.current_load = Math.min(newEmp.current_load + 1, 10);
    if (oldEmp && oldEmp.current_load > 0) oldEmp.current_load--;
    ticket.assigned_to = esc.assignment.assignedTo;
  }

  auditService.logAuditEvent({
    actor: req.user,
    action: 'ticket_escalated',
    target_type: 'ticket',
    target_id: ticket.id,
    department: ticket.department,
    details: `Ticket #${ticket.id} escalated to tier ${esc.newTier}. Reason: ${reason || 'Manual escalation'}`,
    metadata: {
      from_status: oldStatus,
      new_tier: esc.newTier,
      assigned_to: ticket.assigned_to,
      reassignment_count: ticket.reassignment_count,
    },
  });

  ticket.required_tier = esc.newTier;
  const newLevelLbl = safeLevel(esc.newTier);
  const eta = computeETA(0, countOnlineAgents(ticket.department), ticket.priority);
  const etaStr = formatETAMessage(eta.etaLowMin, eta.etaHighMin);

  io.to(`user:${ticket.user_id}`).emit('ticket:status', {
    ticketId: ticket.id,
    status: 'escalated',
    required_tier: esc.newTier,
    level_label: newLevelLbl,
  });

  io.to(`user:${ticket.user_id}`).emit('message', {
    role: 'system',
    content: `Moved up to ${newLevelLbl}. ${reason || 'Needs deeper access'}. Your notes went with it. New estimate: ${etaStr}.`,
    timestamp: new Date().toISOString(),
  });

  io.emit('dashboard:update', buildDashboardData());
  res.json({ success: true, ticket, escalation: esc });
});

// Correct routing
app.post('/api/routing/correct', authenticate, requireRoles(ROLES.SUPPORT_EXECUTIVE, ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER), (req, res) => {
  const { id, correct_department } = req.body;
  const log = state.routingLogs.find(l => l.id === id);
  if (log) log.corrected_department = correct_department;
  res.json({ success: true, log });
});

// ─── Employee ──────────────────────────────────────────────────
app.get('/api/employees/:id/performance', authenticate, (req, res) => {
  const empId = req.params.id;
  if (req.user.id !== empId && req.user.role === ROLES.EMPLOYEE) {
    return res.status(403).json({ error: 'forbidden', message: 'You can only view your own performance profile' });
  }

  const emp = state.employees.find(e => e.id === empId) || accountStore.findById(empId);
  if (!emp) return res.status(404).json({ error: 'Not found' });

  return res.json({
    employee_id: emp.id,
    name: emp.name,
    department: emp.department,
    current_tier: emp.tier || 'L1',
    rolling_score: emp.rolling_score !== undefined ? emp.rolling_score : 75,
    consecutive_high_cycles: emp.consecutive_high_cycles || 0,
    consecutive_low_cycles: emp.consecutive_low_cycles || 0,
    tier_cycle_history: emp.tier_cycle_history || [],
  });
});

app.get('/api/employees/:id/inbox', (req, res) => {
  const empTickets = state.tickets
    .filter(t => t.assigned_to === req.params.id && t.status !== 'resolved')
    .sort((a,b) => (a.sla_deadline||Infinity) - (b.sla_deadline||Infinity));
  // Attach warm summary and suggested reply
  const enriched = empTickets.map(t => ({
    ...t,
    warm_summary: t.warm_summary || null,
    agent_suggested_reply: t.agent_suggested_reply || null,
  }));
  res.json(enriched);
});

app.patch('/api/employees/:id/availability', (req, res) => {
  const { status } = req.body;
  const emp = state.employees.find(e => e.id === req.params.id);
  if (!emp) return res.status(404).json({ error: 'Not found' });
  emp.status = status;
  io.emit('employee:availability', { employeeId: req.params.id, status });
  res.json({ success:true });
});

// ─── KB Search ─────────────────────────────────────────────────
app.get('/api/kb/search', (req, res) => {
  const { q, department } = req.query;
  const results = kbEngine.search(q, department || null, 5);
  res.json(results || { results:[], retrievalConfidence:'none' });
});

// ─── Enterprise Data Imports ──────────────────────────────────
const { directoryProfiles, buildOrgTree, searchDirectory } = require('./data/directory-data');
const { meetingRooms, roomBookings, hotDesks, deskBookings, findAvailableRooms, findAvailableDesks } = require('./data/rooms-data');
const { assets, softwareLicenses, assetRequests } = require('./data/assets-data');
const { leaveBalances, leaveRequests, companyHolidays, companyEvents, accrualRules, getLeaveBalance, getUpcomingHolidays, getUpcomingEvents } = require('./data/leave-data');
const { announcements, serviceCatalog, onboardingTemplates, activeOnboarding, pulseSurveys, systemStatus, incidentHistory, approvalQueue } = require('./data/enterprise-data');

// ═══════════════════════════════════════════════════════════════
// ENTERPRISE FEATURE ROUTES
// ═══════════════════════════════════════════════════════════════

// ─── Company Directory ────────────────────────────────────────
app.get('/api/directory/search', (req, res) => {
  const { q, department, location } = req.query;
  const results = searchDirectory(q, { department, location });
  res.json({ results, total: results.length });
});

app.get('/api/directory/org-chart', (req, res) => {
  res.json(buildOrgTree());
});

app.get('/api/directory/:id', (req, res) => {
  const profile = directoryProfiles.find(p => p.id === req.params.id);
  if (!profile) return res.status(404).json({ error: 'Employee not found' });
  // Find direct reports
  const directReports = directoryProfiles.filter(p => p.manager_id === profile.id);
  // Find manager
  const manager = profile.manager_id ? directoryProfiles.find(p => p.id === profile.manager_id) : null;
  res.json({ ...profile, directReports, manager });
});

app.get('/api/directory/department/:dept', (req, res) => {
  const members = directoryProfiles.filter(p => p.department === req.params.dept);
  res.json({ department: req.params.dept, members, count: members.length });
});

// ─── Meeting Room Booking ─────────────────────────────────────
app.get('/api/rooms', (req, res) => {
  res.json(meetingRooms);
});

app.get('/api/rooms/available', (req, res) => {
  const { date, startTime, endTime, capacity } = req.query;
  if (!date || !startTime || !endTime) return res.status(400).json({ error: 'date, startTime, and endTime required' });
  const available = findAvailableRooms(date, startTime, endTime, parseInt(capacity) || 1);
  res.json({ date, startTime, endTime, available, count: available.length });
});

app.post('/api/rooms/book', (req, res) => {
  const { roomId, userId, userName, date, startTime, endTime, title } = req.body;
  if (!roomId || !date || !startTime || !endTime) return res.status(400).json({ error: 'Missing required fields' });

  // Check availability
  const available = findAvailableRooms(date, startTime, endTime);
  if (!available.find(r => r.id === roomId)) return res.status(409).json({ error: 'Room not available for that time slot' });

  const booking = {
    id: 'rb-' + uuidv4().slice(0, 6),
    room_id: roomId,
    booked_by: userId,
    booked_by_name: userName || userId,
    date, start_time: startTime, end_time: endTime,
    title: title || 'Meeting',
    status: 'confirmed',
    checked_in: false,
  };
  roomBookings.push(booking);
  const room = meetingRooms.find(r => r.id === roomId);
  io.emit('room:booked', { booking, room });
  res.json({ success: true, booking, room });
});

app.delete('/api/rooms/book/:id', (req, res) => {
  const idx = roomBookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Booking not found' });
  roomBookings[idx].status = 'cancelled';
  io.emit('room:cancelled', { bookingId: req.params.id });
  res.json({ success: true });
});

app.get('/api/rooms/bookings', (req, res) => {
  const { date, userId, roomId } = req.query;
  let filtered = roomBookings.filter(b => b.status !== 'cancelled');
  if (date) filtered = filtered.filter(b => b.date === date);
  if (userId) filtered = filtered.filter(b => b.booked_by === userId);
  if (roomId) filtered = filtered.filter(b => b.room_id === roomId);
  res.json(filtered);
});

// ─── Desk Booking ─────────────────────────────────────────────
app.get('/api/desks', (req, res) => {
  res.json(hotDesks);
});

app.get('/api/desks/available', (req, res) => {
  const { date, floor, zone } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });
  const available = findAvailableDesks(date, floor ? parseInt(floor) : null, zone || null);
  res.json({ date, available, count: available.length });
});

app.post('/api/desks/book', (req, res) => {
  const { deskId, userId, userName, date } = req.body;
  if (!deskId || !date) return res.status(400).json({ error: 'deskId and date required' });

  const alreadyBooked = deskBookings.find(b => b.desk_id === deskId && b.date === date);
  if (alreadyBooked) return res.status(409).json({ error: 'Desk already booked for that date' });

  const booking = {
    id: 'db-' + uuidv4().slice(0, 6),
    desk_id: deskId,
    booked_by: userId,
    booked_by_name: userName || userId,
    date,
    checked_in: false,
    check_in_time: null,
  };
  deskBookings.push(booking);
  const desk = hotDesks.find(d => d.id === deskId);
  res.json({ success: true, booking, desk });
});

app.post('/api/desks/checkin', (req, res) => {
  const { bookingId } = req.body;
  const booking = deskBookings.find(b => b.id === bookingId);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  booking.checked_in = true;
  booking.check_in_time = new Date().toTimeString().slice(0, 5);
  res.json({ success: true, booking });
});

// ─── IT Asset Management ──────────────────────────────────────
app.get('/api/assets', (req, res) => {
  const { userId, category, status } = req.query;
  let filtered = assets;
  if (userId) filtered = filtered.filter(a => a.assigned_to === userId);
  if (category) filtered = filtered.filter(a => a.category === category);
  if (status) filtered = filtered.filter(a => a.status === status);
  res.json(filtered);
});

app.get('/api/assets/inventory', (req, res) => {
  const summary = {
    total: assets.length,
    active: assets.filter(a => a.status === 'active').length,
    available: assets.filter(a => a.status === 'available').length,
    repair: assets.filter(a => a.status === 'repair').length,
    totalValue: assets.reduce((s, a) => s + (a.value || 0), 0),
    byCategory: {},
  };
  assets.forEach(a => {
    summary.byCategory[a.category] = (summary.byCategory[a.category] || 0) + 1;
  });
  res.json(summary);
});

app.get('/api/assets/licenses', (req, res) => {
  res.json(softwareLicenses);
});

app.post('/api/assets/request', (req, res) => {
  const { userId, userName, type, item, reason } = req.body;
  const request = {
    id: 'ar-' + uuidv4().slice(0, 6),
    requested_by: userId, requested_name: userName,
    type, item, reason,
    status: 'pending_approval',
    requested_date: new Date().toISOString().slice(0, 10),
    approved_by: null, fulfilled_date: null,
  };
  assetRequests.push(request);
  res.json({ success: true, request });
});

app.get('/api/assets/requests', (req, res) => {
  const { userId, status } = req.query;
  let filtered = assetRequests;
  if (userId) filtered = filtered.filter(r => r.requested_by === userId);
  if (status) filtered = filtered.filter(r => r.status === status);
  res.json(filtered);
});

// ─── Leave / PTO Tracker ──────────────────────────────────────
app.get('/api/leave/balance/:userId', (req, res) => {
  const balance = getLeaveBalance(req.params.userId);
  if (!balance) return res.status(404).json({ error: 'User not found' });
  res.json({
    ...balance,
    pto_available: balance.pto_total - balance.pto_used - balance.pto_pending,
    sick_available: balance.sick_total - balance.sick_used,
  });
});

app.get('/api/leave/requests', (req, res) => {
  const { userId, status } = req.query;
  let filtered = leaveRequests;
  if (userId) filtered = filtered.filter(r => r.user_id === userId);
  if (status) filtered = filtered.filter(r => r.status === status);
  res.json(filtered);
});

app.post('/api/leave/request', (req, res) => {
  const { userId, userName, type, startDate, endDate, days, reason } = req.body;
  if (!userId || !type || !startDate || !endDate) return res.status(400).json({ error: 'Missing required fields' });

  const balance = getLeaveBalance(userId);
  if (balance && type === 'pto') {
    const available = balance.pto_total - balance.pto_used - balance.pto_pending;
    if (days > available) return res.status(400).json({ error: `Insufficient PTO balance. Available: ${available} days` });
    balance.pto_pending += days;
  }

  const request = {
    id: 'lr-' + uuidv4().slice(0, 6),
    user_id: userId, name: userName,
    type, start_date: startDate, end_date: endDate, days,
    reason: reason || '', status: 'pending',
    requested_date: new Date().toISOString().slice(0, 10),
    approved_by: null,
  };
  leaveRequests.push(request);
  // Create approval entry
  approvalQueue.push({
    id: 'apv-' + uuidv4().slice(0, 6),
    type: 'leave', requester_id: userId, requester_name: userName,
    item: `${days} day${days > 1 ? 's' : ''} ${type.toUpperCase()} (${startDate} to ${endDate})`,
    approver_id: null, approver_name: 'Manager',
    status: 'pending', submitted_at: new Date().toISOString(), decided_at: null, notes: reason,
  });
  res.json({ success: true, request });
});

app.get('/api/leave/team-calendar', (req, res) => {
  const { month, department } = req.query;
  let filtered = leaveRequests.filter(r => r.status === 'approved');
  if (month) filtered = filtered.filter(r => r.start_date.startsWith(month));
  res.json(filtered);
});

app.get('/api/leave/accrual-rules', (req, res) => {
  res.json(accrualRules);
});

// ─── Company Calendar & Holidays ──────────────────────────────
app.get('/api/calendar/holidays', (req, res) => {
  const { upcoming } = req.query;
  if (upcoming) return res.json(getUpcomingHolidays(parseInt(upcoming)));
  res.json(companyHolidays);
});

app.get('/api/calendar/events', (req, res) => {
  const { upcoming, department } = req.query;
  if (upcoming) return res.json(getUpcomingEvents(parseInt(upcoming), department));
  let filtered = companyEvents;
  if (department) filtered = filtered.filter(e => e.department === 'All' || e.department === department);
  res.json(filtered);
});

app.get('/api/calendar', (req, res) => {
  const { month } = req.query;
  const holidays = month
    ? companyHolidays.filter(h => h.date.startsWith(month))
    : getUpcomingHolidays(10);
  const events = month
    ? companyEvents.filter(e => e.date.startsWith(month))
    : getUpcomingEvents(10);
  const leaves = leaveRequests.filter(r => r.status === 'approved' && (!month || r.start_date.startsWith(month)));
  res.json({ holidays, events, leaves });
});

// ─── Announcements ────────────────────────────────────────────
app.get('/api/announcements', (req, res) => {
  const { department, priority } = req.query;
  let filtered = announcements.sort((a, b) => {
    // Pinned first, then by date
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  if (department) filtered = filtered.filter(a => a.department === department || a.department === 'All');
  if (priority) filtered = filtered.filter(a => a.priority === priority);
  res.json(filtered);
});

app.post('/api/announcements', (req, res) => {
  const { title, body, department, priority, pinned, createdBy } = req.body;
  const ann = {
    id: 'ann-' + uuidv4().slice(0, 6),
    title, body, department: department || 'All',
    priority: priority || 'medium', pinned: pinned || false,
    created_by: createdBy, created_at: new Date().toISOString(),
    expires_at: null, read_by: [],
  };
  announcements.push(ann);
  io.emit('announcement:new', ann);
  res.json({ success: true, announcement: ann });
});

app.patch('/api/announcements/:id/read', (req, res) => {
  const { userId } = req.body;
  const ann = announcements.find(a => a.id === req.params.id);
  if (!ann) return res.status(404).json({ error: 'Not found' });
  if (!ann.read_by.includes(userId)) ann.read_by.push(userId);
  res.json({ success: true });
});

app.get('/api/announcements/unread-count', (req, res) => {
  const { userId } = req.query;
  const count = announcements.filter(a => !a.read_by.includes(userId)).length;
  res.json({ count });
});

// ─── Service Catalog ──────────────────────────────────────────
app.get('/api/catalog', (req, res) => {
  const { category } = req.query;
  let filtered = serviceCatalog;
  if (category) filtered = filtered.filter(c => c.category === category);
  res.json(filtered);
});

app.post('/api/catalog/request', (req, res) => {
  const { catalogItemId, userId, userName, notes } = req.body;
  const item = serviceCatalog.find(c => c.id === catalogItemId);
  if (!item) return res.status(404).json({ error: 'Catalog item not found' });

  const request = {
    id: 'apv-' + uuidv4().slice(0, 6),
    type: 'service_catalog',
    requester_id: userId, requester_name: userName,
    item: item.name,
    approver_id: null, approver_name: item.approval_required ? 'Manager' : 'Auto-approved',
    status: item.approval_required ? 'pending' : 'approved',
    submitted_at: new Date().toISOString(),
    decided_at: item.approval_required ? null : new Date().toISOString(),
    notes: notes || '',
    sla_days: item.sla_days,
  };
  approvalQueue.push(request);
  res.json({ success: true, request, requires_approval: item.approval_required });
});

// ─── Approvals ────────────────────────────────────────────────
app.get('/api/approvals', (req, res) => {
  const { approverId, requesterId, status, type } = req.query;
  let filtered = approvalQueue;
  if (approverId) filtered = filtered.filter(a => a.approver_id === approverId);
  if (requesterId) filtered = filtered.filter(a => a.requester_id === requesterId);
  if (status) filtered = filtered.filter(a => a.status === status);
  if (type) filtered = filtered.filter(a => a.type === type);
  res.json(filtered);
});

app.patch('/api/approvals/:id', (req, res) => {
  const { action, decidedBy, notes } = req.body; // action: 'approve' | 'reject'
  const approval = approvalQueue.find(a => a.id === req.params.id);
  if (!approval) return res.status(404).json({ error: 'Approval not found' });

  approval.status = action === 'approve' ? 'approved' : 'rejected';
  approval.decided_at = new Date().toISOString();
  if (notes) approval.notes = notes;

  // If leave approval, update balance
  if (approval.type === 'leave' && action === 'approve') {
    const lr = leaveRequests.find(r => r.user_id === approval.requester_id && r.status === 'pending');
    if (lr) {
      lr.status = 'approved';
      lr.approved_by = decidedBy;
      const bal = getLeaveBalance(lr.user_id);
      if (bal && lr.type === 'pto') {
        bal.pto_pending = Math.max(0, bal.pto_pending - lr.days);
        bal.pto_used += lr.days;
      }
    }
  }

  io.emit('approval:updated', { approval });
  res.json({ success: true, approval });
});

app.get('/api/approvals/pending-count', (req, res) => {
  const { approverId } = req.query;
  let pending = approvalQueue.filter(a => a.status === 'pending');
  if (approverId) pending = pending.filter(a => a.approver_id === approverId);
  res.json({ count: pending.length });
});

// ─── Onboarding ───────────────────────────────────────────────
app.get('/api/onboarding/:userId', (req, res) => {
  const record = activeOnboarding.find(o => o.user_id === req.params.userId);
  if (!record) return res.status(404).json({ error: 'No onboarding record found' });
  const total = record.tasks.length;
  const completed = record.tasks.filter(t => t.completed).length;
  res.json({ ...record, progress: Math.round((completed / total) * 100), total, completed });
});

app.patch('/api/onboarding/:userId/task/:taskId', (req, res) => {
  const record = activeOnboarding.find(o => o.user_id === req.params.userId);
  if (!record) return res.status(404).json({ error: 'No onboarding record' });
  const task = record.tasks.find(t => t.id === req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  task.completed = true;
  task.completed_date = new Date().toISOString().slice(0, 10);
  const total = record.tasks.length;
  const completed = record.tasks.filter(t => t.completed).length;
  if (completed === total) record.status = 'completed';
  res.json({ success: true, progress: Math.round((completed / total) * 100) });
});

app.get('/api/onboarding/template', (req, res) => {
  res.json(onboardingTemplates);
});

// ─── Pulse Surveys ────────────────────────────────────────────
app.get('/api/surveys', (req, res) => {
  const { status } = req.query;
  let filtered = pulseSurveys;
  if (status) filtered = filtered.filter(s => s.status === status);
  res.json(filtered.map(s => ({
    id: s.id, title: s.title, status: s.status,
    start_date: s.start_date, end_date: s.end_date,
    question_count: s.questions.length,
    response_count: s.responses.length,
    anonymous: s.anonymous,
  })));
});

app.get('/api/surveys/:id', (req, res) => {
  const survey = pulseSurveys.find(s => s.id === req.params.id);
  if (!survey) return res.status(404).json({ error: 'Survey not found' });
  // Calculate aggregates for scale questions
  const aggregates = {};
  survey.questions.forEach(q => {
    if (q.type === 'scale' || q.type === 'nps') {
      const answers = survey.responses.map(r => r.answers[q.id]).filter(a => typeof a === 'number');
      aggregates[q.id] = {
        avg: answers.length ? parseFloat((answers.reduce((s, v) => s + v, 0) / answers.length).toFixed(1)) : null,
        count: answers.length,
        distribution: {},
      };
      answers.forEach(a => { aggregates[q.id].distribution[a] = (aggregates[q.id].distribution[a] || 0) + 1; });
    }
  });
  res.json({ ...survey, aggregates });
});

app.post('/api/surveys/:id/respond', (req, res) => {
  const { userId, answers } = req.body;
  const survey = pulseSurveys.find(s => s.id === req.params.id);
  if (!survey) return res.status(404).json({ error: 'Survey not found' });
  if (survey.status !== 'active') return res.status(400).json({ error: 'Survey is not active' });
  // Check if already responded
  if (survey.responses.find(r => r.user_id === userId)) {
    return res.status(409).json({ error: 'Already submitted a response' });
  }
  survey.responses.push({ user_id: userId, answers, submitted_at: new Date().toISOString() });
  res.json({ success: true });
});

// ─── System Status ────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  const operational = systemStatus.filter(s => s.status === 'operational').length;
  const degraded = systemStatus.filter(s => s.status === 'degraded').length;
  const outage = systemStatus.filter(s => s.status === 'outage').length;
  const overallStatus = outage > 0 ? 'major_outage' : degraded > 0 ? 'partial_degradation' : 'all_operational';
  res.json({
    overall: overallStatus,
    services: systemStatus,
    summary: { operational, degraded, outage, total: systemStatus.length },
    recentIncidents: incidentHistory.slice(-5),
  });
});

app.get('/api/status/incidents', (req, res) => {
  res.json(incidentHistory);
});

app.post('/api/status/incident', (req, res) => {
  const { service, severity, title } = req.body;
  const incident = {
    id: 'inc-' + uuidv4().slice(0, 6),
    service, severity, title,
    start_time: new Date().toISOString(),
    end_time: null, duration_min: null,
    root_cause: null, status: 'investigating',
    updates: [`${new Date().toLocaleTimeString()} — Investigating reports of issues`],
  };
  incidentHistory.push(incident);
  // Update service status
  const svc = systemStatus.find(s => s.service === service);
  if (svc) {
    svc.status = severity === 'major' ? 'outage' : 'degraded';
    svc.incident = title;
  }
  io.emit('status:incident', incident);
  res.json({ success: true, incident });
});

// ─── ML Stats (DistilBERT Primary + Naive Bayes Fallback + Multi-Intent) ────
app.get('/api/ml/stats', async (req, res) => {
  const totalVocab = Object.values(classifier.wordCounts).reduce((sum, wc) => sum + Object.keys(wc).length, 0);
  const mlHealth = await checkHealth().catch(() => null);

  res.json({
    architecture: {
      pipeline: 'DistilBERT Primary -> Naive Bayes Fallback -> TF-IDF KB -> Grounded LLM',
      primaryClassifier: 'DistilBERT Sequence Classifier (13 classes)',
      fallbackClassifier: 'Naive Bayes Multinomial Classifier (10 classes)',
      multiIntentClassifier: 'DistilBERT Binary Classifier (SINGLE / MULTI)',
      multiIntentThreshold: 0.60,
      ragEngine: 'TF-IDF + Cosine Similarity',
      llmProvider: 'zenmux.ai (dots-studio/dots3-note-prev)',
      microserviceStatus: mlHealth ? 'connected' : 'offline (fallback active)',
    },
    primaryClassifier: {
      name: 'DistilBERT Sequence Classifier',
      modelType: 'distilbert-base-uncased',
      classes: 13,
      domainClasses: [
        'Billing', 'Customer Support', 'Cybersecurity', 'Data & Analytics',
        'Finance', 'HR', 'IT Support', 'Investor Relations', 'Legal',
        'Marketing', 'Out of Scope', 'Quality Assurance', 'Unknown'
      ],
      canonicalMapping: {
        'IT Support': 'IT',
        'Cybersecurity': 'IT',
        'HR': 'HR',
        'Finance': 'Finance',
        'Billing': 'Finance',
      },
      supportedNodeDepartments: ['IT', 'HR', 'Finance', 'Facilities'],
      offlineEvaluationAccuracy: '91.8% test accuracy (offline evaluation)',
      inferenceDevice: mlHealth?.device || 'cpu',
      serviceEndpoint: 'http://127.0.0.1:8000/predict',
      status: mlHealth ? 'online' : 'offline',
    },
    fallbackClassifier: {
      type: 'Naive Bayes (Multinomial)',
      classes: classifier.classes,
      departmentCount: classifier.classes.length,
      trainingExamples: classifier.totalDocs,
      vocabSize: totalVocab,
      smoothing: 'Laplace k=1',
      features: 'Bag-of-Words + Softmax + Shannon Entropy',
      onlineLearning: true,
      activeAsFallback: true,
    },
    multiIntent: {
      type: 'DistilBERT Binary Classifier',
      classes: ['SINGLE', 'MULTI'],
      threshold: 0.60,
      strategy: 'Guaranteed human handoff on MULTI (prevents partial answering)',
    },
    classifier: {
      // Maintained for backward-compatibility with frontend components
      type: 'DistilBERT (Primary) + Naive Bayes (Fallback)',
      classes: classifier.classes,
      departmentCount: classifier.classes.length,
      trainingExamples: classifier.totalDocs,
      vocabSize: totalVocab,
      smoothing: 'Laplace k=1',
      features: 'Contextual Transformer Embeddings + Softmax, with Laplace Naive Bayes fallback',
      onlineLearning: true,
    },
    kbEngine: {
      type: 'TF-IDF + Cosine Similarity',
      indexedDocuments: kbEngine.documents.length,
      vocabularySize: Object.keys(kbEngine.idf).length,
      threshold: 0.05,
    },
    llm: {
      provider: 'zenmux.ai',
      model: 'dots-studio/dots3-note-prev',
      fallbacks: ['z-ai/glm-4.7-flash-free', 'z-ai/glm-4.6v-flash-free'],
      role: 'Grounded answer generation via RAG — only used when KB retrieval confidence >= medium',
    },
    nlp: { type: 'Lexicon Sentiment + Rule-based Intent + Regex NER', features: ['sentiment', 'urgency', 'intent', 'entities', 'priority', 'CSAT prediction'] },
    assignment: { type: 'Weighted Multi-factor Scoring', factors: ['skill_match', 'availability', 'load_balance', 'success_rate', 'response_time'] },
    enterprise: {
      directory: { employees: directoryProfiles.length, departments: [...new Set(directoryProfiles.map(p => p.department))].length },
      rooms: { meetingRooms: meetingRooms.length, hotDesks: hotDesks.length },
      assets: { hardware: assets.length, softwareLicenses: softwareLicenses.length },
      catalog: { items: serviceCatalog.length },
      surveys: { active: pulseSurveys.filter(s => s.status === 'active').length },
      announcements: { total: announcements.length },
      systemServices: { monitored: systemStatus.length },
    },
    routingAccuracy: parseFloat((
      state.routingLogs.filter(l=>!l.corrected_department).length /
      Math.max(state.routingLogs.length, 1) * 100
    ).toFixed(1)) + '%',
  });
});

// Routing correction (online learning)
app.post('/api/routing/correct', (req, res) => {
  const { messageId, correctDepartment } = req.body;
  const log = state.routingLogs.find(l => l.message_id === messageId);
  if (log) {
    log.corrected_department = correctDepartment;
    // Online retraining
    const msg = state.conversations[req.body.userId]?.find(m => m.id === messageId);
    if (msg) classifier.learnCorrection(msg.content, correctDepartment);
  }
  res.json({ success:true });
});

// ─── Feedback / CSAT ─────────────────────────────────────────
app.post('/api/feedback', (req, res) => {
  const { ticketId, csatScore, comment, isFixed } = req.body;
  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket) return res.status(404).json({ error: 'Not found' });
  ticket.csat = csatScore;
  ticket.feedback_comment = comment;
  if (isFixed === false) {
    // Reopen via the reopen endpoint logic
    ticket.status = 'open';
    ticket.priority = ticket.priority === 'low' ? 'medium' : ticket.priority;
    io.to(`user:${ticket.user_id}`).emit('message', {
      role: 'system',
      content: `Reopened. This goes to the front of the line.`,
      timestamp: new Date().toISOString(),
    });
  }
  io.emit('dashboard:update', buildDashboardData());
  res.json({ success:true });
});

// ─── Socket.IO ────────────────────────────────────────────────
io.use((socket, next) => {
  const { verifyToken, parseCookie } = require('./auth/tokens');
  const { SESSION_COOKIE_NAME } = require('./auth/config');
  try {
    const token = socket.handshake.auth?.token || parseCookie(socket.handshake.headers.cookie, SESSION_COOKIE_NAME);
    const claims = verifyToken(token);
    const account = accountStore.findById(claims.sub);
    if (!account?.active || account.must_change_password || account.token_version !== claims.tv || account.role !== claims.role || account.department !== claims.dept) throw new Error('Invalid session');
    socket.data.user = accountStore.toPublic(account);
    next();
  } catch (_) { next(new Error('Authentication required')); }
});
io.on('connection', socket => {
  const actor = socket.data.user;
  socket.join(`user:${actor.id}`);
  if (actor.role === 'support_executive') { socket.join(`employee:${actor.id}`); socket.join(`department:${actor.department}`); }
  if (actor.role === 'department_manager') {socket.join(`department:${actor.department}`);socket.join(`manager:dept:${actor.department}`);socket.join(`manager:${actor.id}`);}
  if (['support_executive','department_manager'].includes(actor.role) && ['Facilities','Cybersecurity'].includes(actor.department)) socket.join('security:alerts');
  if (actor.role === 'main_manager') socket.join('director');
  // Rooms are session-derived. Client-supplied identity and room joins are ignored.
  socket.on('employee:typing', ({ ticketId } = {}) => {
    const ticket = state.tickets.find(t => t.id === ticketId);
    if (!ticket || actor.role !== 'support_executive' || ticket.assigned_to !== actor.id) return;
    io.to(`user:${ticket.user_id}`).emit('typing:start', { ticketId, name:actor.name });
  });
  socket.on('employee:typing-stop',({ticketId}={})=>{
    const ticket=state.tickets.find(t=>t.id===ticketId);
    if(ticket&&actor.role==='support_executive'&&ticket.assigned_to===actor.id)io.to(`user:${ticket.user_id}`).emit('typing:stop',{ticketId});
  });
  if(actor.role==='support_executive')io.to(`department:${actor.department}`).to('director').emit('dashboard:invalidate',{eventId:uuidv4()});
  if(actor.role==='support_executive')for(const ticket of state.tickets.filter(t=>t.assigned_to===actor.id))io.to(`user:${ticket.user_id}`).emit('presence:changed',{ticketId:ticket.id});
  socket.on('disconnect',()=>{
    if(actor.role!=='support_executive')return;
    for(const ticket of state.tickets.filter(t=>t.assigned_to===actor.id))io.to(`user:${ticket.user_id}`).emit('presence:changed',{ticketId:ticket.id});
  });
});
/* Retired insecure socket protocol.
io.on('connection', socket => {
  console.log(`[WS] Connected: ${socket.id}`);

  socket.on('join:user', ({ userId }) => {
    socket.join(`user:${userId}`);
    console.log(`[WS] User ${userId} joined`);
  });

  socket.on('join:employee', ({ employeeId }) => {
    socket.join(`employee:${employeeId}`);
    state.onlineEmployees.add(employeeId);
    const emp = state.employees.find(e => e.id === employeeId);
    if (emp) emp.status = 'online';
    io.emit('employee:availability', { employeeId, status: 'online' });
    console.log(`[WS] Employee ${employeeId} joined inbox`);
  });

  socket.on('join:manager', ({ managerId }) => {
    socket.join(`manager:${managerId}`);
    socket.emit('dashboard:update', buildDashboardData());
    console.log(`[WS] Manager ${managerId} joined dashboard`);
  });

  socket.on('employee:typing', ({ ticketId, userId }) => {
    io.to(`user:${userId}`).emit('typing:start', { source: 'employee' });
    setTimeout(() => io.to(`user:${userId}`).emit('typing:stop'), 3000);
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Disconnected: ${socket.id}`);
  });

  socket.emit('dashboard:update', buildDashboardData());
});

*/
// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  pilot.ready.then(() => server.listen(PORT, () => {
    console.log(`\n🚀 PS18 Server running at http://localhost:${PORT}`);
    console.log(`📊 Open: http://localhost:${PORT}/index.html\n`);
    console.log('🧠 ML Stack:');
    console.log(`   ✅ Naive Bayes classifier — ${classifier.classes.length} departments (${classifier.totalDocs} training samples)`);
    console.log('   ✅ TF-IDF + Cosine Similarity KB (' + allKBArticles.length + ' articles)');
    console.log('   ✅ Lexicon NLP + Rule-based Intent Detection');
    console.log('   ✅ Priority Service (Critical/High/Normal/Low + reasons)');
    console.log('   ✅ ETA computation (queue-aware + SLA clamping)');
    console.log('   ✅ Weighted multi-factor assignment engine');
    console.log('   ✅ SLA timer with auto-escalation (5s tick)');
    console.log('   ✅ Socket.IO real-time events');
    console.log('   ✅ zenmux LLM — dots-studio/dots3-note-prev');
    console.log('\n🏢 Enterprise Features:');
    console.log(`   ✅ Company Directory — ${directoryProfiles.length} profiles`);
    console.log(`   ✅ Meeting Rooms — ${meetingRooms.length} rooms`);
    console.log(`   ✅ Hot Desks — ${hotDesks.length} desks across ${[...new Set(hotDesks.map(d => d.floor))].length} floors`);
    console.log(`   ✅ IT Asset Management — ${assets.length} hardware + ${softwareLicenses.length} licenses`);
    console.log(`   ✅ Leave/PTO Tracker — ${leaveBalances.length} employees`);
    console.log(`   ✅ Announcements — ${announcements.length} active`);
    console.log(`   ✅ Service Catalog — ${serviceCatalog.length} items`);
    console.log(`   ✅ Approval Workflows — multi-step chains`);
    console.log(`   ✅ Onboarding — Day 1/Week 1/30/60/90 checklists`);
    console.log(`   ✅ Pulse Surveys — ${pulseSurveys.length} surveys`);
    console.log(`   ✅ System Status — ${systemStatus.length} monitored services`);
    console.log(`   ✅ Company Calendar — ${companyHolidays.length} holidays + ${companyEvents.length} events\n`);
  })).catch(error => { console.error('Startup refused:', error.message); process.exitCode = 1; clearInterval(slaTimer); });
}

module.exports = { app, io, server, state, ready: pilot.ready };
