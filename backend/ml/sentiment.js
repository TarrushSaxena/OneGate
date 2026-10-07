// ============================================================
// SENTIMENT & INTENT NLP ENGINE
// Lexicon-based sentiment + rule-based intent detection
// No external libraries — pure JS NLP from scratch
// ============================================================

// ─── Sentiment Lexicon ────────────────────────────────────────
const POSITIVE_WORDS = new Set([
  'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'good', 'love',
  'best', 'perfect', 'happy', 'satisfied', 'pleased', 'helpful', 'resolved',
  'fixed', 'working', 'solved', 'thanks', 'thank', 'appreciate', 'quick',
  'fast', 'efficient', 'professional', 'awesome', 'brilliant', 'outstanding',
]);

const NEGATIVE_WORDS = new Set([
  'terrible', 'awful', 'horrible', 'bad', 'worst', 'hate', 'frustrated',
  'angry', 'annoyed', 'broken', 'failed', 'slow', 'useless', 'waste',
  'disappointed', 'unhappy', 'stuck', 'crash', 'lost', 'missing', 'wrong',
]);

const FRUSTRATED_WORDS = new Set([
  'frustrated', 'angry', 'annoyed', 'furious', 'unacceptable', 'terrible',
  'awful', 'horrible', 'hate', 'worst', 'escalate',
]);

const URGENCY_WORDS = new Set([
  'urgent', 'emergency', 'critical', 'asap', 'immediately', 'right away', 'crisis',
  'cannot work', 'cant work', 'outage', 'escalate',
  'right now', 'need help now', 'help needed now', 'urgent help',
  'blocking my work', 'blocking our work', 'work is blocked', 'completely blocked',
  'system down', 'server down', 'service down', 'network down', 'site down', 'is down', 'went down',
  'due today', 'deadline today', 'needed today', 'due tomorrow', 'deadline tomorrow',
  'high priority', 'top priority', 'urgent priority',
]);

const NEGATION_WORDS = new Set(['not', 'no', 'never', "don't", "doesn't", "can't", 'cannot', "won't", 'nothing']);

// ─── Intent Patterns ─────────────────────────────────────────
const INTENT_PATTERNS = [
  { intent: 'report_issue',     patterns: [/broken|not working|failed|error|crash|down|outage|issue|problem|bug/i] },
  { intent: 'request_help',     patterns: [/help|assist|support|guide|how (do|to|can)|what (is|are)|where is/i] },
  { intent: 'request_access',   patterns: [/access|permission|badge|login|password|unlock|reset|enable/i] },
  { intent: 'request_approval', patterns: [/approve|approval|authorize|sign.?off|authorize|request/i] },
  { intent: 'check_status',     patterns: [/status|update|progress|where is|what happened|any news|pending/i] },
  { intent: 'submit_form',      patterns: [/submit|fill|complete|expense|report|form|application/i] },
  { intent: 'schedule',         patterns: [/schedule|book|reserve|meet|meeting|appointment|calendar/i] },
  { intent: 'complaint',        patterns: [/complain|dissatisfied|unhappy|frustrated|awful|terrible|worst/i] },
  { intent: 'inquiry',          patterns: [/policy|rule|allowed|can i|am i|what is|tell me|explain|information/i] },
  { intent: 'escalate',         patterns: [/escalate|manager|supervisor|urgent|asap|immediately|critical/i] },
];

// ─── Entity Extraction Patterns ──────────────────────────────
const ENTITY_PATTERNS = [
  { type: 'system',    pattern: /\b(vpn|wifi|laptop|email|outlook|teams|zoom|onedrive|sharepoint|windows|mac)\b/gi },
  { type: 'action',    pattern: /\b(reset|install|connect|setup|configure|access|download|update|fix|unlock)\b/gi },
  { type: 'urgency',   pattern: /\b(urgent|asap|immediately|critical|emergency|deadline|today)\b/gi },
  { type: 'timeframe', pattern: /\b(today|tomorrow|this week|monday|tuesday|wednesday|thursday|friday|morning|afternoon|next week)\b/gi },
  { type: 'tool',      pattern: /\b(concur|workday|coupa|jira|servicenow|slack|github|confluence|figma)\b/gi },
];

// ─── Priority Detection ─────────────────────────────────────
const PRIORITY_SIGNALS = {
  critical: /\b(outage|down|emergency|critical|all users affected|production|cannot work|blocked everyone)\b/i,
  high:     /\b(urgent|asap|immediately|today|deadline|cannot|unable|broken|failed)\b/i,
  medium:   /\b(issue|problem|not working|slow|intermittent|sometimes)\b/i,
  low:      /\b(question|how to|wondering|when|best practice|suggestion|would like)\b/i,
};

// ─── Sentiment Analysis ─────────────────────────────────────
function analyzeSentiment(text) {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/);
  
  let positiveScore = 0;
  let negativeScore = 0;
  let negating = false;

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    
    if (NEGATION_WORDS.has(word)) {
      negating = true;
      continue;
    }

    if (POSITIVE_WORDS.has(word)) {
      negating ? negativeScore += 1 : positiveScore += 1;
      negating = false;
    } else if (NEGATIVE_WORDS.has(word)) {
      negating ? positiveScore += 0.5 : negativeScore += 1;
      negating = false;
    } else {
      negating = false;
    }
  }

  const total = positiveScore + negativeScore;
  const score = total === 0 ? 0 : (positiveScore - negativeScore) / total;

  let label;
  if (tokens.some(w => FRUSTRATED_WORDS.has(w))) label = 'frustrated';
  else if (score > 0.3) label = 'positive';
  else if (score < -0.2) label = 'negative';
  else label = 'neutral';

  const hasUrgency = [...URGENCY_WORDS].some(w => {
    if (w.includes(' ')) return text.toLowerCase().includes(w);
    return new RegExp('\\b' + w + '\\b', 'i').test(text);
  });

  return { score: parseFloat(score.toFixed(3)), label, hasUrgency };
}

// ─── Intent Detection ────────────────────────────────────────
function detectIntent(text) {
  const detected = [];
  
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some(p => p.test(text))) {
      detected.push(intent);
    }
  }

  return detected.length > 0 ? detected : ['general_inquiry'];
}

// ─── Entity Extraction ────────────────────────────────────────
function extractEntities(text) {
  const entities = {};

  for (const { type, pattern } of ENTITY_PATTERNS) {
    const matches = [...text.matchAll(pattern)].map(m => m[0].toLowerCase());
    if (matches.length > 0) {
      entities[type] = [...new Set(matches)];
    }
  }

  return entities;
}

// ─── Priority Detection ──────────────────────────────────────
function detectPriority(text) {
  if (PRIORITY_SIGNALS.critical.test(text)) return 'critical';
  if (PRIORITY_SIGNALS.high.test(text)) return 'high';
  if (PRIORITY_SIGNALS.medium.test(text)) return 'medium';
  return 'low';
}

// ─── Greeting / Capability Inquiry Detector ───────────────────
function isGreetingOrGeneralInquiry(text) {
  const t = text.trim();
  if (/^(?:hello|hi|hey|good\s*(?:morning|afternoon|evening)|greetings|howdy)(?:[\s!,?.]*|(?:[\s!,?.].*))?$/i.test(t)) {
    const hasIssue = /\b(?:broken|error|crash|down|failed|freeze|stolen|lost|vpn|wifi|payroll|salary|tax|leave|reimburse|badge|keycard|laptop|monitor|device|refund)\b/i.test(t);
    if (!hasIssue) return true;
  }
  if (/\bwhat\s*can\s*you\s*help\s*(?:me\s*)?with\b/i.test(t) || /\bhow\s*can\s*you\s*help\b/i.test(t) || /\bwhat\s*do\s*you\s*do\b/i.test(t)) {
    return true;
  }
  return false;
}

// ─── Multi-topic Detection ────────────────────────────────────
function detectTopics(text) {
  const topics = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);

  if (sentences.length > 1) {
    // Check if different sentences might be about different departments
    const { classify } = require('./classifier');
    const depts = sentences.map(s => classify(s).department);
    const uniqueDepts = [...new Set(depts)];
    if (uniqueDepts.length > 1) {
      return sentences.map((s, i) => ({ text: s.trim(), department: depts[i] }));
    }
  }

  return [{ text: text, department: null }];
}

// ─── Full NLP Analysis ────────────────────────────────────────
function analyzeMessage(text) {
  const sentiment = analyzeSentiment(text);
  const intents = detectIntent(text);
  const entities = extractEntities(text);
  const isGreeting = isGreetingOrGeneralInquiry(text);
  const priority = isGreeting ? 'low' : (sentiment.hasUrgency ? 'high' : detectPriority(text));

  // Check for multi-topic
  const isMultiTopic = /\b(also|and also|additionally|another thing|besides|furthermore|plus)\b/i.test(text)
    || (text.match(/\b(my|i)\b/gi) || []).length > 3;

  return {
    sentiment,
    intents,
    entities,
    priority,
    isMultiTopic,
    wordCount: text.split(/\s+/).length,
    hasQuestion: /\?/.test(text) || /\b(how|what|when|where|why|can|could|is|are|do|does)\b/i.test(text),
    isGreeting,
  };
}

// ─── CSAT Prediction ─────────────────────────────────────────
function predictCSAT(transcript, resolutionTime) {
  let score = 3.0; // baseline

  // Analyze user messages sentiment
  const userMessages = transcript.filter(m => m.role === 'user');
  const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';
  const { score: sentimentScore, label } = analyzeSentiment(lastUserMsg);

  if (label === 'positive') score += 1.5;
  else if (label === 'negative') score -= 1.0;

  // Fast resolution bonus
  const hoursToResolve = resolutionTime / 3600000;
  if (hoursToResolve < 1) score += 0.5;
  else if (hoursToResolve > 8) score -= 0.5;

  return Math.min(5, Math.max(1, Math.round(score * 2) / 2));
}

module.exports = {
  analyzeSentiment,
  detectIntent,
  extractEntities,
  detectPriority,
  detectTopics,
  analyzeMessage,
  predictCSAT,
  isGreetingOrGeneralInquiry,
};
