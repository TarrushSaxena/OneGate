// ============================================================
// PS18 LLM ORCHESTRATOR v3
// Route (DistilBERT Primary, Naive Bayes Fallback) → Retrieve (TF-IDF)
// → Confidence Gate & Multi-Intent Check → Generate (real LLM) → Cite
// ============================================================

const { inspectUserContent, PROMPT_INJECTION_RE } = require('./contentSafety');
const { isEmergency, EMERGENCY_REPLY } = require('./emergency');
const classifier   = require('../ml/classifier');
const { engine: kbEngine } = require('../ml/embeddings');
const { analyzeMessage, isGreetingOrGeneralInquiry } = require('../ml/sentiment');
const { callLLM }          = require('./llm');
const { POLICY_CONTEXT }   = require('../data/knowledge-base');
const { computePriority, formatETAMessage } = require('./priority');
const { predictML }        = require('./mlBridge');
const { findKnownFix }     = require('./knownFixes');

// ─── Confidence & Intent Constants (Configurable via ENV) ─────
const ML_HIGH_CONFIDENCE   = parseFloat(process.env.ML_HIGH_CONFIDENCE || '0.70');
const ML_MEDIUM_CONFIDENCE = parseFloat(process.env.ML_MEDIUM_CONFIDENCE || '0.45');
const MULTI_INTENT_THRESHOLD = 0.60;

// Supported canonical departments in OneGate
const SUPPORTED_DEPARTMENTS = new Set(['IT', 'HR', 'Finance', 'Facilities']);

// ─── Cross-Department Keyword Detector ────────────────────────
// Rule-based fallback to catch multi-topic messages even when
// the DistilBERT multi-intent model scores below threshold.
const DEPT_KEYWORD_MAP = {
  IT: /\b(laptop|computer|pc|vpn|wifi|wi-fi|internet|printer|monitor|screen|password|login|software|hardware|email|outlook|teams|network|mouse|keyboard|headset|docking|charger|driver|install|crash|freeze|slow|lag|update|patch|reboot|restart|usb|webcam|camera|mic|audio|video|display|resolution|blue ?screen|bsod|server|cloud|sharepoint|onedrive|locked ?out|certificate|firewall|bandwidth|storage|backup|restore|intune|enrollment|it support|tech support|not working|not responding|won't turn on|dead|stuck|boot)\b/i,
  HR: /\b(leave|pto|vacation|time ?off|sick|holiday|absence|payroll|salary|benefits|health ?insurance|dental|vision|401k|epf|pf|provident|compensation|raise|promotion|appraisal|review|performance|onboarding|resignation|termination|offboarding|training|learning|development|harassment|grievance|ethics|parental|maternity|paternity|wfh|work from home|remote|hybrid|dress ?code|overtime|attendance|timesheet|diversity|inclusion|culture|engagement|wellness|mental ?health|eap|counseling|buddy|mentor|exit|employment|verification|letter|handbook|policy|procedure|hr|people|employee)\b/i,
  Finance: /\b(expense|reimbursement|receipt|purchase|vendor|budget|corporate ?card|credit ?card|travel ?booking|hotel|flight|per ?diem|refund|tax|audit|compliance|wire ?transfer|bank|payment|invoice|mileage|fuel|petty ?cash|gst|vat|accounts ?payable|cost ?center|depreciation|financial|quarterly|capex|opex|finance|payroll|salary advance)\b/i,
  Facilities: /\b(badge|building|door|security|entry ?pass|desk|office ?space|reservation|seat|meeting ?room|conference|temperature|hvac|air ?conditioning|heating|maintenance|repair|cleaning|parking|garage|car|ev ?charging|fire ?drill|evacuation|drill|visitor|guest|reception|mail|package|delivery|courier|office ?supplies|stationery|elevator|lift|floor|cafeteria|kitchen|coffee|pantry|noise|waste|recycling|locker|catering|standing ?desk|ergonomic|chair|furniture|shuttle|bus|transport|campus|smoking ?zone|facilities)\b/i,
};

function detectCrossDepartmentIntents(text) {
  // If the user explicitly asks for direct connection/contact or emergency/wedding leave, never split into multi-intent
  if (/\b(?:connect(?:\s*me)?(?:\s*with|\s*to)?|talk\s*to|speak\s*(?:to|with)|transfer(?:\s*me)?\s*to|direct\s*contact|urgent\s*leave|wedding|marriage)\b/i.test(text)) {
    return [];
  }
  const detectedDepts = [];
  for (const [dept, pattern] of Object.entries(DEPT_KEYWORD_MAP)) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      detectedDepts.push({ department: dept, matchedKeywords: [...new Set(matches.map(m => m.toLowerCase()))] });
    }
  }
  return detectedDepts;
}

// ─── Scope guard ─────────────────────────────────────────────
// Department classifiers always return their "best" label, even when the
// message is unrelated to work. Stop clearly non-work input before a guessed
// department can create a real support request.
const WORKPLACE_CONTEXT_RE = /\b(work|workplace|office|company|employee|coworker|colleague|manager|supervisor|team|client|customer|corporate|policy|support|ticket|request|approval|harass(?:ment|ed|ing)?|discrimination|unwanted|assault|report|complaint)\b/i;
const PERSONAL_SEXUAL_RE = /\b(?:i\s*(?:am|'m)\s+horny|turn\s+me\s+on|sext(?:ing)?|send\s+(?:me\s+)?nudes?|sexual\s+chat|want\s+sex|porn(?:ography)?)\b/i;
const CASUAL_NON_WORK_RE = /^(?:ok(?:ay)?|k|cool|lol|lmao|thanks?|thank\s+you|good\s*(?:morning|afternoon|evening|night)|bye|goodbye|tell\s+me\s+(?:a\s+)?joke|i\s*(?:am|'m)\s+bored)[.!?\s]*$/i;
const UNRELATED_TOPIC_RE = /\b(?:pizza|weather|sports?\s+score|cricket\s+score|football\s+score|movie\s+recommendation|dating\s+advice|recipe|horoscope)\b/i;

function hasWorkplaceSignal(text) {
  if (WORKPLACE_CONTEXT_RE.test(text)) return true;
  return Object.values(DEPT_KEYWORD_MAP).some(pattern => pattern.test(text));
}

function outOfScopeReason(text) {
  if (PERSONAL_SEXUAL_RE.test(text) && !WORKPLACE_CONTEXT_RE.test(text)) return 'personal_sexual';
  if (CASUAL_NON_WORK_RE.test(text)) return 'casual';
  if (UNRELATED_TOPIC_RE.test(text) && !hasWorkplaceSignal(text)) return 'unrelated';
  return null;
}

function recentlyAskedForClarification(conversationHistory = []) {
  return conversationHistory.slice(-4).reverse().some(m =>
    m.role === 'assistant' && (
      m.metadata?.type === 'clarification' ||
      m.metadata?.type === 'multi_intent_clarification' ||
      m.type === 'clarification' ||
      m.type === 'multi_intent_clarification' ||
      m.content?.includes('Just to confirm') ||
      m.content?.includes('Could you provide a few more details') ||
      m.content?.includes("which issue you'd like me to address first")
    )
  );
}

// ─── PII Redaction ───────────────────────────────────────────
const PII_PATTERNS = [
  { label: 'CARD',    re: /\b(?:\d{4}[\s-]?\d{6}[\s-]?\d{5}|\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g, mask: '[CARD HIDDEN]' },
  { label: 'SSN',     re: /\b\d{3}-\d{2}-\d{4}\b/g,                         mask: '[SSN HIDDEN]' },
  { label: 'PHONE',   re: /\b(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, mask: '[PHONE HIDDEN]' },
  { label: 'EMAIL',   re: /\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/gi, mask: '[EMAIL HIDDEN]' },
  { label: 'BANK_AC', re: /\b\d{8,17}\b/g,                                   mask: '[ACCOUNT HIDDEN]' },
];

function redactPII(text) {
  let redacted = text;
  const found = [];
  for (const { label, re, mask } of PII_PATTERNS) {
    if (re.test(redacted)) {
      found.push(label);
      redacted = redacted.replace(re, mask);
    }
    re.lastIndex = 0;
  }
  return { text: redacted, redacted: found };
}

// ─── Offensive content ────────────────────────────────────────
const OFFENSIVE_RE = /\b(fuck|shit|bitch|asshole|damn you|idiot|moron|hate you|kill|threat)\b/i;
function containsOffensive(text) { return OFFENSIVE_RE.test(text); }

// ─── Prompt Injection Guard ────────────────────────────────────
const INJECTION_RE = /ignore (your|all|previous|these) (instructions?|rules?|constraints?|prompts?)/i;
function isInjectionAttempt(text) { return INJECTION_RE.test(text) || PROMPT_INJECTION_RE.test(text); }

// ─── System Prompt Builder ────────────────────────────────────
function buildSystemPrompt(kbPassage, citation, department, nlpResult) {
  const { priority, priority_reason } = computePriority('', nlpResult.sentiment);

  return `You are the PS18 "One Front Door" AI assistant for a company. You help employees with IT, HR, Finance, and Facilities questions.

ROLE:
- Answer questions accurately using only the policy knowledge provided below.
- Always cite your source using the exact citation format given (e.g., "IT Policy §3.2").
- Be friendly, concise, and use sentence case. No exclamation marks. No "please". No "successfully".
- If you cannot find a definitive answer in the provided policy, say so clearly.
- Never make up policies, procedures, or numbers.
- If the question involves a security incident, payroll issue, or sensitive action, flag it.

DETECTED CONTEXT:
- Department: ${department}
- User Sentiment: ${nlpResult.sentiment?.label || 'neutral'}
- Intents: ${(nlpResult.intents || []).join(', ')}

RELEVANT POLICY KNOWLEDGE:
${kbPassage ? `[FROM ${citation}]\n${kbPassage}` : 'No specific KB article matched. Use general policy context below.'}

GENERAL POLICY CONTEXT:
${POLICY_CONTEXT}

RESPONSE FORMAT:
1. Give a direct, helpful answer (2-5 sentences max for simple questions).
2. Include numbered steps if the answer is procedural.
3. End with: 📎 *Source: ${citation || department + ' Policy'}*
4. If action is needed beyond info, say: "Reply here and I'll open a support ticket for you."

Keep your response under 200 words unless steps require more.`;
}

// ─── Warm Handoff Summary Builder ────────────────────────────
function buildHandoffSummaryPrompt(conversation, issue, department) {
  const userMsgs = conversation
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');

  return [
    {
      role: 'system',
      content: `You are writing a 3-line warm handoff summary for a ${department} support agent. 
Be specific. No fluff. Format:
Issue: [one line]
Tried: [what the user already attempted, or "Nothing tried yet"]
Needs: [what the agent should do]`,
    },
    {
      role: 'user',
      content: `Write the 3-line summary for this conversation:\n\n${userMsgs}`,
    },
  ];
}

// ─── Agent Suggested Reply Builder ───────────────────────────
function buildAgentSuggestReplyPrompt(ticket, kbPassage, citation) {
  return [
    {
      role: 'system',
      content: `You are a ${ticket.department} support specialist (${ticket.required_tier}). Write a helpful, professional reply to the user based on the KB article. Cite the source. Max 100 words.`,
    },
    {
      role: 'user',
      content: `User issue: ${ticket.transcript?.[0]?.content || ''}\n\nKB Article [${citation}]:\n${kbPassage}\n\nWrite a reply:`,
    },
  ];
}

// ─── Confidence Gate (Confidence-Driven Deflection & Routing) ────
function applyConfidenceGate(routing, kbResult, nlp, cleanMessage = '', conversationHistory = []) {
  // Sensitive action always requires identity verification
  if (nlp?.needsVerification) return 'verify';

  // Direct department transfer request detection
  const directDeptMatch = cleanMessage.match(/\b(?:connect(?:\s*me)?(?:\s*with|\s*to)?|talk\s*to|speak\s*(?:to|with)|transfer(?:\s*me)?\s*to|contact|direct)\s*(hr|it|finance|facilities)\b/i);
  if (directDeptMatch) {
    const targetDept = directDeptMatch[1].toUpperCase();
    const canonical = { HR: 'HR', IT: 'IT', FINANCE: 'Finance', FACILITIES: 'Facilities' }[targetDept];
    if (canonical) {
      routing.department = canonical;
      routing.raw_department = canonical;
      routing.confidence = 0.99;
    }
  }
  if (/\b(?:wedding|marriage|emergency\s*leave|urgent\s*leave|leave\s*approval|tomorrow\s*leave)\b/i.test(cleanMessage)) {
    routing.department = 'HR';
    routing.raw_department = 'HR';
    routing.confidence = 0.95;
  }

  // Explicit incident, physical breakdown, emergency, or direct human request
  const EXPLICIT_TICKET_RE = /\b(connect\s*(?:me\s*)?(?:to|with)?\s*(?:a\s*)?(?:human|person|agent|specialist|hr|it|finance|facilities)|talk\s*to\s*(?:a\s*)?(?:human|person|agent|specialist|hr|it|finance|facilities)|speak\s*(?:to|with)\s*(?:a\s*)?(?:human|person|agent|specialist|hr|it|finance|facilities)|contact\s*(?:hr|it|finance|facilities)|transfer\s*(?:me\s*)?to\s*(?:hr|it|finance|facilities)|direct\s*(?:hr|it|finance|facilities)\s*contact|urgent\s*(?:leave|approval|help)|emergency\s*leave|wedding\s*leave|marriage\s*leave|leave\s*for\s*(?:my\s*)?wedding|approval\s*for\s*tomorrow|looping\s*clarification|redundant\s*categorization|(?:need|reach)\s*(?:a\s*)?(?:human|person|agent|specialist)|create\s*(?:a\s*)?ticket|raise\s*(?:a\s*)?ticket|open\s*(?:a\s*)?ticket|file\s*(?:a\s*)?ticket|urgent\s*help|escalate|swelling|smoking|smoke|burnt|burned|fried|battery\s*burst|spill|shattered|cracked|broken\s*(?:screen|display|monitor|laptop|hardware|device|machine)|damaged\s*(?:screen|laptop|device|hardware)|won't\s*turn\s*on|dead\s*laptop|stolen|locked\s*out\s*of\s*(?:office|building)|lost\s*badge|approve\s*my|urgent\s*exception|cannot\s*work|monitor|static\s*lines|hardware\s*fault|replacement)\b/i;

  if (EXPLICIT_TICKET_RE.test(cleanMessage)) {
    return 'ticket';
  }

  // Conversational greeting or capability inquiry with no issue described -> State 2: Clarify (never ticket)
  if (nlp?.isGreeting || isGreetingOrGeneralInquiry(cleanMessage)) {
    return 'clarify';
  }

  // ─── Loop Breaker (PS18 Spec Rule 2: "never a second question in a row") ───
  // If the assistant just asked a clarification question in recent turns, NEVER clarify again!
  const recentClarification = recentlyAskedForClarification(conversationHistory);

  if (recentClarification) {
    console.log('[Orchestrator] Loop Breaker triggered: prior clarification detected in conversation. Forbidding clarification loop.');
    if (kbResult?.topResult && kbResult.topResult.score >= 0.15) {
      return 'answer';
    }
    // A classifier guess is not consent to contact an employee. If the reply
    // still contains no workplace signal, keep it in the assistant instead of
    // creating queue noise or exposing it to a specialist.
    if (!hasWorkplaceSignal(cleanMessage)) return 'out_of_scope';
    return 'ticket';
  }

  // Multi-intent check: requires at least 2 distinct departments detected
  const crossDepts = detectCrossDepartmentIntents(cleanMessage);
  const isKeywordMulti = crossDepts.length >= 2;
  const isDistilBertMulti = (routing.intent_type === 'MULTI' || (routing.multi_probability && routing.multi_probability >= MULTI_INTENT_THRESHOLD)) && crossDepts.length >= 2;

  if (crossDepts.length >= 2 && (isDistilBertMulti || isKeywordMulti)) {
    // Store detected departments for the clarification response
    routing._crossDepartments = crossDepts;
    return 'multi_clarify';
  }

  // A direct single-department policy/procedure question with grounded
  // evidence is already actionable. Do not ask another categorization
  // question for phrases such as "how do I apply".
  const asksForKnownProcedure = /\b(?:policy|procedure|how\s+(?:do|can)\s+i|where\s+(?:do|can)\s+i|apply|submit|request)\b/i.test(cleanMessage);
  if (asksForKnownProcedure && crossDepts.length < 2 && kbResult?.topResult && kbResult.topResult.score >= 0.12) {
    return 'answer';
  }

  // Known safe self-fix eligibility check (USP-1)
  const knownFix = findKnownFix(cleanMessage, routing.department);
  if (knownFix) {
    routing._matchedFix = knownFix;
    return 'ai_attempted';
  }

  const conf = routing.confidence || 0;

  // HIGH confidence: Answer via grounded KB + LLM if evidence exists
  if (conf >= ML_HIGH_CONFIDENCE) {
    if (kbResult?.topResult && (kbResult.topResult.score >= 0.08 || cleanMessage.includes('?'))) {
      return 'answer';
    }
    // Knowing the department is not evidence that a person must handle the request.
    // Missing guidance should trigger clarification, never automatic queue noise.
    return 'clarify';
  }

  // MEDIUM confidence: Ask exactly one clarification question unless KB evidence is definitive
  if (conf >= ML_MEDIUM_CONFIDENCE) {
    if (kbResult?.topResult && (kbResult.topResult.score >= 0.22 || (cleanMessage.includes('?') && kbResult.topResult.score >= 0.15))) {
      return 'answer';
    }
    return 'clarify';
  }

  // LOW confidence: Unknown department or ambiguous intent -> Clarify (State 2)
  return 'clarify';
}

// ─── Clarifying Question ──────────────────────────────────────
function generateClarifyingQuestion(routing, cleanMessage = '') {
  if (cleanMessage && isGreetingOrGeneralInquiry(cleanMessage)) {
    return TEMPLATES.greeting();
  }

  const scores = routing.allScores || [];
  const first = scores[0];
  const second = scores[1];

  if (!first || !second || routing.raw_department === 'Unknown' || (first.confidence < 0.25 && second && Math.abs(first.confidence - second.confidence) < 0.05)) {
    return `Could you provide a few more details so I can route your request to the right department? I can help with IT, HR, Finance, or Facilities.`;
  }

  const map = {
    'IT-Facilities':   'Is this about your **computer or system access** or your **building badge**?',
    'HR-Finance':      'Is this about your **employment or leave** or a **financial transaction**?',
    'IT-HR':           'Is this a **technical issue** or a **people or policy** question?',
    'Finance-Facilities': 'Is this about a **financial expense** or an **office or building** issue?',
    'HR-Facilities':   'Is this about a **workplace policy** or a **physical office** matter?',
  };

  const key = `${first.department}-${second.department}`;
  const revKey = `${second.department}-${first.department}`;
  const q = map[key] || map[revKey] ||
    `Could you give me a bit more detail — is this about **${first.department}** or **${second.department}**?`;
  return `Just to confirm — ${q}`;
}

// ─── Sensitive Action Detector ────────────────────────────────
const SENSITIVE_RE = /\b(password reset|salary change|payroll (change|update)|bank account|direct deposit|terminate|dismissal|account deletion|ssn|social security)\b/i;

// ─── TEMPLATES (user-visible copy per UX spec) ────────────────
const TEMPLATES = {
  greeting: () =>
    `Hello! I'm your One Front Door assistant. I can help with IT, HR, Finance, and Facilities. What do you need help with?`,

  ticket_created: (dept, ticketId, priority, assigneeName, levelLbl, etaLow, etaHigh) => {
    const shortId = ticketId.slice(-6).toUpperCase();
    const etaStr = etaLow && etaHigh ? formatETAMessage(etaLow, etaHigh) : 'shortly';
    return `Passing you to ${dept} Support. ${assigneeName ? `**${assigneeName}**, a ${levelLbl}, is on it.` : `A ${levelLbl || 'specialist'} will pick this up soon.`}\n\n📋 Ticket **#${shortId}** · ${priority} priority · ${etaStr}.\n\nYour notes went with the ticket — you won't need to repeat yourself. Reply here anytime for updates.`;
  },

  no_kb_match: (dept) =>
    `I wasn't able to find a specific answer in company policy for your question. I'm connecting you with a ${dept} specialist who can help directly.`,

  low_confidence_handoff: (dept) =>
    `I want to make sure you get the right help. Connecting you with a **${dept}** specialist now.`,

  multi_intent_handoff: (dept) =>
    `I noticed your request involves multiple topics across different domains. To ensure every part of your issue is properly handled without missing anything, I'm routing this to a ${dept || 'support'} specialist for coordination.`,

  multi_intent_clarify: (detectedDepts = []) => {
    if (!detectedDepts || detectedDepts.length < 2) {
      return `Could you provide a bit more detail about what you need help with? I can help with IT, HR, Finance, or Facilities.`;
    }
    const deptList = detectedDepts.map((d, i) => {
      const keywords = d.matchedKeywords.slice(0, 3).join(', ');
      const emoji = d.department === 'IT' ? '💻' : d.department === 'HR' ? '👥' : d.department === 'Finance' ? '💰' : '🏢';
      return `${i + 1}. ${emoji} **${d.department}** — _${keywords}_`;
    }).join('\n');

    return `I noticed your message covers **${detectedDepts.length} different topics** across these departments:\n\n${deptList}\n\nTo give you accurate answers for each, could you tell me **which issue you'd like me to address first**? I'll handle them one at a time so nothing gets missed.`;
  },

  identity_required: () =>
    `For security, I need to verify your identity first. Please confirm your **employee ID** and the **last 4 digits** of the phone number on your HR file.`,

  escalated: (newTier, reason, etaStr) =>
    `Moved up to ${newTier}. ${reason}. Your notes went with it. New estimate: ${etaStr}.`,

  off_hours: (dept, onlineAt) =>
    `${dept} Support is offline until ${onlineAt}. Your ticket is first in line. Here's a self-serve fix to try now:`,

  offensive_filter: () =>
    `Let's keep it respectful. I'll still help with this.`,

  out_of_scope: () =>
    `I can help with workplace requests for IT, HR, Finance, or Facilities. Tell me what you need at work, and I’ll either answer here or connect a specialist only when staff action is required.`,

  pii_masked: (label) =>
    `We hid your ${label.toLowerCase()} for safety. Here's what I can help with:`,
};

// ─── Multi-Intent Follow-Up Detector ─────────────────────────
function checkMultiIntentFollowUp(cleanMessage, conversationHistory) {
  if (!conversationHistory || conversationHistory.length < 2) return null;

  const revHistory = [...conversationHistory].reverse();
  const lastAsst = revHistory.find(m => m.role === 'assistant' || m.type === 'multi_intent_clarification');
  if (!lastAsst) return null;

  const isMultiPrompt = (lastAsst.type === 'multi_intent_clarification') ||
    (typeof lastAsst.content === 'string' && lastAsst.content.includes("which issue you'd like me to address first"));

  if (!isMultiPrompt) return null;

  const origUserMsg = revHistory.find(m => m.role === 'user' && m.content !== cleanMessage);
  if (!origUserMsg) return null;

  const crossDepts = detectCrossDepartmentIntents(origUserMsg.content);
  if (!crossDepts || crossDepts.length === 0) return null;

  const cleanLower = cleanMessage.toLowerCase().trim();

  let matchedDept = null;
  if (cleanLower === '1' && crossDepts[0]) matchedDept = crossDepts[0];
  else if (cleanLower === '2' && crossDepts[1]) matchedDept = crossDepts[1];
  else if (cleanLower === '3' && crossDepts[2]) matchedDept = crossDepts[2];
  else {
    matchedDept = crossDepts.find(d => {
      const deptName = d.department.toLowerCase();
      if (cleanLower === deptName || cleanLower.includes(deptName)) return true;
      return d.matchedKeywords.some(kw => cleanLower.includes(kw));
    });
  }

  if (!matchedDept) {
    for (const d of crossDepts) {
      if (d.department.toLowerCase() === cleanLower || cleanLower.includes(d.department.toLowerCase())) {
        matchedDept = d;
        break;
      }
    }
  }

  if (!matchedDept) return null;

  const remainingDepts = crossDepts.filter(d => d.department !== matchedDept.department);

  return {
    selectedDepartment: matchedDept.department,
    matchedKeywords: matchedDept.matchedKeywords,
    originalText: origUserMsg.content,
    remainingDepts: remainingDepts,
  };
}

// ─── Main Orchestrator ────────────────────────────────────────
async function orchestrate(message, conversationHistory = [], userId = null) {
  if (isEmergency(message) || isInjectionAttempt(message)) return orchestrateSingle(message, conversationHistory, userId);
  const previous = [...conversationHistory].reverse().find(m => m.role === 'assistant');
  let pending = previous?.metadata?.pending_intents || previous?.pending_intents || [];
  const clauses = message.split(/\s+(?:and also|also|and then|and)\s+/i).map(text => text.trim()).filter(Boolean);
  const intents = clauses.map(text => ({text, department: /\b(leave|vacation|pto)\b/i.test(text) ? 'HR' : /\b(vpn|password|laptop|computer)\b/i.test(text) ? 'IT' : /\b(reimbursement|expense|salary|refund)\b/i.test(text) ? 'Finance' : null}));
  if (intents.length > 1 && intents.every(i => i.department) && new Set(intents.map(i => i.department)).size > 1) {
    pending = intents;
    return {action:'multi_clarify', type:'multi_intent_clarification', department:'General', detected_departments:pending.map(i=>i.department), pending_intents:pending,
      response:'I noticed different topics. I can help with both requests. Which should we handle first?\n'+pending.map((i,n)=>`${n+1}. ${i.text}`).join('\n')+'\nI’ll keep the other request in this thread.'};
  }
  if(pending.length) {
    const choice = /^\d+$/.test(message.trim()) ? Number(message.trim())-1 : pending.findIndex(i => message.toLowerCase().includes(i.department.toLowerCase()) || i.text.toLowerCase().split(/\W+/).filter(w=>w.length>3).some(w=>message.toLowerCase().includes(w)));
    const selected = choice >= 0 && choice < pending.length ? choice : pending.length === 1 && /^(yes|next|continue|go ahead)[.!]?$/i.test(message.trim()) ? 0 : -1;
    if(selected >= 0) {
      const result = await orchestrateSingle(pending[selected].text, [], userId);
      const remaining = pending.filter((_,n)=>n!==selected);
      return {...result,pending_intents:remaining,pending_prompt:remaining.length?'Still in this thread: '+remaining.map(i=>i.text).join('; ')+'. Say “next” to handle it.':null};
    }
  }
  const result=await orchestrateSingle(message,conversationHistory,userId);
  return {...result,pending_intents:pending};
}

function highConfidenceRoute(text) {
  if (/\b(?:lost|missing|misplaced)\s+(?:my\s+)?(?:id(?:\s+card)?|badge)\b/i.test(text)) return {department:'Facilities',forceAction:'ticket',lost_id:true};
  if (/\b(?:production\s+)?server\s+(?:is\s+)?(?:down|offline|unavailable)\b/i.test(text)) return {department:'IT',forceAction:'ticket',urgent:true};
  if (/\b(?:reimbursement|salary(?:\s+hasn.t)?\s+(?:not|has not)|salary.not.credited)\b/i.test(text)) return {department:'Finance'};
  if (/\blaptop\b.*\b(?:slow|bahut|chal raha)\b/i.test(text)) return {department:'IT',forceAction:'ticket'};
  if (/\b(?:nda|non.disclosure)\b/i.test(text)) return {department:'Legal',forceAction:'ticket'};
  if (/\b(?:leave|pto|parental|vacation)\b/i.test(text)) return {department:'HR'};
  if (/\b(?:angry|abusive|rude)\b.*\b(?:email|manager|colleague)\b|\bcomplaint\b.*\b(?:email|manager|colleague)\b/i.test(text)) return {department:'HR',forceAction:'ticket'};
  return null;
}

async function orchestrateSingle(message, conversationHistory = [], userId = null) {
  if (isEmergency(message)) return { action:'emergency', type:'emergency', department:'Facilities', priority:'critical', priority_reason:'Immediate safety assistance required', response:EMERGENCY_REPLY };
  const startTime = Date.now();

  // ── Guard: PII redaction ──────────────────────────────────
  const { text: cleanMessage, redacted: piiFound } = redactPII(message);

  const safety = inspectUserContent(cleanMessage,userId);
  if(safety)return {action:'blocked',type:'content_filter',department:'General',response:safety.response,safety_category:safety.category,audit_id:safety.audit_id};

  // ── Guard: Offensive content ──────────────────────────────
  const hasOffensive = containsOffensive(cleanMessage);

  // ── Guard: Prompt injection ────────────────────────────────
  if (isInjectionAttempt(cleanMessage)) {
    return {
      type: 'blocked',
      response: `I can only help with company IT, HR, Finance, and Facilities questions. What can I assist you with?`,
      department: 'IT',
      raw_department: 'IT',
      confidence: 1,
      model: 'RuleGuard',
      intent_type: 'SINGLE',
      intent_confidence: 1.0,
      multi_probability: 0.0,
      single_probability: 1.0,
      multi_threshold: MULTI_INTENT_THRESHOLD,
      action: 'blocked',
      latency: Date.now() - startTime,
    };
  }

  const scopeReason = outOfScopeReason(cleanMessage);
  if (scopeReason) {
    return {
      type: 'out_of_scope',
      response: TEMPLATES.out_of_scope(),
      department: 'General',
      raw_department: 'OutOfScope',
      confidence: 1,
      department_confidence: 0,
      model: 'ScopeGuard',
      fallbackUsed: false,
      fallbackReason: null,
      intent_type: 'NON_WORK',
      intent_confidence: 1,
      multi_probability: 0,
      single_probability: 1,
      multi_threshold: MULTI_INTENT_THRESHOLD,
      priority: 'low',
      priority_reason: 'No workplace request detected',
      action: 'out_of_scope',
      resolution_type: 'answer',
      resolution_label: 'Kept private in chat',
      resolution_color: 'blue',
      resolution_icon: 'info',
      scope_reason: scopeReason,
      latency: Date.now() - startTime,
    };
  }

  // ── Step 1: Multi-Intent Follow-Up Check ──────────────────
  const multiFollowUp = checkMultiIntentFollowUp(cleanMessage, conversationHistory);

  // ── Step 2: NLP analysis ──────────────────────────────────
  const nlpResult = analyzeMessage(cleanMessage);
  nlpResult.needsVerification = SENSITIVE_RE.test(cleanMessage);

  // ── Step 3: Department & Intent Classification ─────────────
  let routing = null;

  const override = highConfidenceRoute(cleanMessage);
  if (override && !multiFollowUp) {
    routing={...override,confidence:0.99,model:'HighConfidenceRule',raw_department:override.department,intent_type:'SINGLE'};
  } else if (multiFollowUp) {
    console.log(`[ML] Multi-intent follow-up resolved department: ${multiFollowUp.selectedDepartment}`);
    routing = {
      department: multiFollowUp.selectedDepartment,
      raw_department: multiFollowUp.selectedDepartment,
      confidence: 0.92,
      model: 'MultiIntentContextResolver',
      intent_type: 'SINGLE',
      intent_confidence: 0.95,
      multi_probability: 0.0,
      single_probability: 1.0,
      multi_threshold: MULTI_INTENT_THRESHOLD,
      fallbackUsed: false,
    };
  } else {
    // Primary: DistilBERT microservice
    // Fallback: Legacy Naive Bayes classifier
    try {
      const mlRes = await predictML(cleanMessage);

      if (mlRes.department && SUPPORTED_DEPARTMENTS.has(mlRes.department)) {
        console.log(`[ML] DistilBERT prediction used: ${mlRes.department} (raw: ${mlRes.raw_department}, conf: ${(mlRes.department_confidence * 100).toFixed(1)}%)`);
        routing = {
          department: mlRes.department,
          raw_department: mlRes.raw_department,
          confidence: mlRes.department_confidence,
          model: 'DistilBERT',
          allScores: (mlRes.department_top_predictions || []).map(p => ({
            department: p.department,
            confidence: p.confidence,
          })),
          intent_type: mlRes.intent_type || 'SINGLE',
          intent_confidence: mlRes.intent_confidence,
          multi_probability: mlRes.multi_probability,
          single_probability: mlRes.single_probability,
          multi_threshold: mlRes.multi_threshold || MULTI_INTENT_THRESHOLD,
          fallbackUsed: false,
        };
      } else {
        console.log(`[ML] DistilBERT predicted unsupported department "${mlRes.raw_department}", falling back to Naive Bayes`);
        const nb = classifier.classify(cleanMessage);
        routing = {
          ...nb,
          model: 'Naive Bayes (Fallback)',
          raw_department: mlRes.raw_department,
          fallbackUsed: true,
          fallbackReason: `DistilBERT predicted unsupported department "${mlRes.raw_department}"`,
          intent_type: mlRes.intent_type || 'SINGLE',
          intent_confidence: mlRes.intent_confidence,
          multi_probability: mlRes.multi_probability,
          single_probability: mlRes.single_probability,
          multi_threshold: mlRes.multi_threshold || MULTI_INTENT_THRESHOLD,
        };
      }
    } catch (mlErr) {
      console.log(`[ML] DistilBERT unavailable, using Naive Bayes fallback: ${mlErr.message}`);
      const nb = classifier.classify(cleanMessage);
      routing = {
        ...nb,
        model: 'Naive Bayes (Fallback)',
        raw_department: nb.department,
        fallbackUsed: true,
        fallbackReason: mlErr.message,
        intent_type: 'SINGLE',
        intent_confidence: 1.0,
        multi_probability: 0.0,
        single_probability: 1.0,
        multi_threshold: MULTI_INTENT_THRESHOLD,
      };
    }
  }

  // ── Step 4: KB retrieval using canonical department & contextual query ────────
  const searchQuery = multiFollowUp ? multiFollowUp.originalText : cleanMessage;
  const kbResult = kbEngine.search(searchQuery, routing.department, 3);

  // ── Step 5: Confidence gate ────────────────────────────────
  const action = routing.forceAction || applyConfidenceGate(routing, kbResult, nlpResult, cleanMessage, conversationHistory);

  // ── Step 5: Priority computation ───────────────────────────
  const { priority, priority_reason } = computePriority(cleanMessage, nlpResult.sentiment);

  const latency = Date.now() - startTime;

  // Base payload metadata
  const baseResult = {
    department: routing.department,
    raw_department: routing.raw_department || routing.department,
    confidence: routing.confidence,
    department_confidence: routing.confidence,
    model: routing.model,
    fallbackUsed: !!routing.fallbackUsed,
    fallbackReason: routing.fallbackReason || null,
    intent_type: routing.intent_type,
    intent_confidence: routing.intent_confidence,
    multi_probability: routing.multi_probability,
    single_probability: routing.single_probability,
    multi_threshold: routing.multi_threshold,
    priority: routing.urgent ? 'critical' : priority,
    priority_reason: routing.urgent ? 'Production service unavailable; team unable to work' : priority_reason,
    lost_id: !!routing.lost_id,
    nlp: nlpResult,
    latency,
  };

  // ── Build response based on action ──────────────────────────

  // Sensitive action / identity required
  if (action === 'verify') {
    return {
      ...baseResult,
      type: 'verification_required',
      response: TEMPLATES.identity_required(),
      action: 'verify',
    };
  }

  // Multi-intent clarification (ask user which issue first)
  if (action === 'multi_clarify') {
    const crossDepts = routing._crossDepartments || detectCrossDepartmentIntents(cleanMessage);
    return {
      ...baseResult,
      type: 'multi_intent_clarification',
      response: [
        hasOffensive ? TEMPLATES.offensive_filter() + '\n\n' : '',
        TEMPLATES.multi_intent_clarify(crossDepts),
      ].join(''),
      action: 'multi_clarify',
      detected_departments: crossDepts.map(d => d.department),
      detected_keywords: crossDepts.reduce((acc, d) => { acc[d.department] = d.matchedKeywords; return acc; }, {}),
    };
  }

  // Clarifying question (medium confidence or greeting/low confidence)
  if (action === 'clarify') {
    const isGreeting = nlpResult.isGreeting || isGreetingOrGeneralInquiry(cleanMessage);
    const clarifyingOptions = isGreeting || routing.raw_department === 'Unknown'
      ? ['IT Support', 'HR Policies', 'Finance & Expenses', 'Facilities']
      : (routing.allScores && routing.allScores.length >= 2
        ? [routing.allScores[0].department, routing.allScores[1].department]
        : ['IT Support', 'HR Policies', 'Finance & Expenses']);

    return {
      ...baseResult,
      department: isGreeting ? 'General' : baseResult.department,
      type: 'clarification',
      response: [
        hasOffensive ? TEMPLATES.offensive_filter() + '\n\n' : '',
        generateClarifyingQuestion(routing, cleanMessage),
      ].join(''),
      action: 'clarify',
      options: clarifyingOptions,
    };
  }

  if (action === 'out_of_scope') {
    return {
      ...baseResult,
      department: 'General',
      raw_department: 'OutOfScope',
      model: 'ScopeGuard',
      type: 'out_of_scope',
      response: TEMPLATES.out_of_scope(),
      action: 'out_of_scope',
      resolution_type: 'answer',
      resolution_label: 'Kept private in chat',
      resolution_color: 'blue',
      resolution_icon: 'info',
      scope_reason: 'no_workplace_signal_after_clarification',
    };
  }

  // Direct answer via LLM (Grounded in retrieved KB article)
  if (action === 'answer') {
    const kb = kbResult?.topResult;
    const passage = kb ? kbEngine.extractPassage(kb.content, cleanMessage, 400) : 'Standard enterprise policies and procedures apply across IT, HR, Finance, and Facilities.';
    const citation = kb?.source_citation || `${routing.department} Corporate Policy Manual §1.0`;

    const systemPrompt = buildSystemPrompt(passage, citation, routing.department, nlpResult);

    // Build history for LLM context (last 6 turns)
    const recentHistory = conversationHistory
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content.substring(0, 400),
      }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: cleanMessage },
    ];

    let response;
    try {
      response = await callLLM(messages, { temperature: 0.35, maxTokens: 600 });
    } catch (llmErr) {
      console.error('[LLM] Error, falling back to KB extraction:', llmErr.message);
      response = `${passage}\n\n📎 *Source: ${citation}*`;
    }

    if (piiFound.length > 0) {
      response = TEMPLATES.pii_masked(piiFound[0]) + '\n\n' + response;
    }
    if (hasOffensive) {
      response = TEMPLATES.offensive_filter() + '\n\n' + response;
    }

    if (multiFollowUp && multiFollowUp.remainingDepts.length > 0) {
      const nextDept = multiFollowUp.remainingDepts[0];
      const nextEmoji = nextDept.department === 'IT' ? '💻' : nextDept.department === 'HR' ? '👥' : nextDept.department === 'Finance' ? '💰' : '🏢';
      response += `\n\n---\n💡 *Would you like me to address your **${nextEmoji} ${nextDept.department}** issue next?*`;
    }

    return {
      ...baseResult,
      type: 'answer',
      department: kb?.department || baseResult.department,
      response,
      retrievalConfidence: kbResult?.retrievalConfidence || 'medium',
      kbArticle: kb ? { id: kb.id, department:kb.department, title: kb.title, source_citation: citation } : null,
      action: 'answer',
      resolution_type: 'answer',
      resolution_label: 'Answered directly',
      resolution_color: 'blue',
      resolution_icon: 'info',
      usedLLM: true,
    };
  }

  // ── Known safe self-fix path (USP-1) ─────────────────────────
  if (action === 'ai_attempted') {
    const fix = routing._matchedFix || findKnownFix(cleanMessage, routing.department);
    return {
      ...baseResult,
      type: 'ai_attempted',
      action: 'ai_attempted',
      resolution_type: 'ai_attempted',
      resolution_label: 'Tried a fix',
      resolution_color: 'amber',
      resolution_icon: 'wrench',
      fix,
      response: `${fix.fix_text}\n\nDid this solve the problem?`,
      kbArticle: {
        id: fix.id,
        title: fix.title,
        source_citation: fix.source_citation,
        source_clause_id: fix.source_clause_id,
        content: fix.fix_text,
      },
      tags: ['self_fix', ...(nlpResult.entities?.tool || [])].slice(0, 4),
    };
  }

  // Default: Human ticket / handoff (Multi-intent, low confidence, or missing KB evidence)
  let ticketResponse;
  if (routing.intent_type === 'MULTI' || (routing.multi_probability && routing.multi_probability >= MULTI_INTENT_THRESHOLD)) {
    ticketResponse = TEMPLATES.multi_intent_handoff(routing.department);
  } else if (kbResult) {
    ticketResponse = TEMPLATES.low_confidence_handoff(routing.department);
  } else {
    ticketResponse = TEMPLATES.no_kb_match(routing.department);
  }

  return {
    ...baseResult,
    type: 'ticket',
    response: [
      hasOffensive ? TEMPLATES.offensive_filter() + '\n\n' : '',
      ticketResponse,
    ].join(''),
    action: 'ticket',
    resolution_type: 'human_required',
    resolution_label: 'Connecting you with a person',
    resolution_color: 'purple',
    resolution_icon: 'headset',
    tags: [
      ...(nlpResult.entities?.system || []),
      ...(nlpResult.entities?.tool || []),
    ].slice(0, 4),
  };
}

// ─── Warm Handoff Summary (async LLM call) ────────────────────
async function generateWarmHandoffSummary(conversation, department) {
  try {
    const msgs = buildHandoffSummaryPrompt(conversation, null, department);
    const summary = await callLLM(msgs, { temperature: 0.3, maxTokens: 150 });
    return summary;
  } catch {
    const firstMsg = conversation.find(m => m.role === 'user');
    return `Issue: ${(firstMsg?.content || 'Unknown issue').substring(0, 100)}\nTried: Nothing tried yet\nNeeds: Specialist review`;
  }
}

// ─── Agent Suggested Reply (async LLM call) ────────────────────
async function generateAgentSuggestedReply(ticket, kbResult) {
  if (!kbResult?.topResult) return null;
  try {
    const kb = kbResult.topResult;
    const passage = kbEngine.extractPassage(kb.content, ticket.transcript?.[0]?.content || '', 300);
    const msgs = buildAgentSuggestReplyPrompt(ticket, passage, kb.source_citation);
    const reply = await callLLM(msgs, { temperature: 0.4, maxTokens: 200 });
    return { text: reply, citation: kb.source_citation };
  } catch {
    const kb = kbResult.topResult;
    const passage = kbEngine.extractPassage(kb.content, ticket.transcript?.[0]?.content || '', 300);
    return {
      text: `Based on company policy (${kb.source_citation}): ${passage.substring(0, 180)}...`,
      citation: kb.source_citation,
    };
  }
}

module.exports = {
  orchestrate,
  generateWarmHandoffSummary,
  generateAgentSuggestedReply,
  TEMPLATES,
  redactPII,
  ML_HIGH_CONFIDENCE,
  ML_MEDIUM_CONFIDENCE,
  MULTI_INTENT_THRESHOLD,
  hasWorkplaceSignal,
  outOfScopeReason,
};
