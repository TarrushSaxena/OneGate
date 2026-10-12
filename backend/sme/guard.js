// ============================================================
// OneGate SME — Guardrails: prompt-injection, phishing, PII redaction
// Treats all document / counterparty text as untrusted data.
// ============================================================

const INJECTION_PATTERNS = [
  /(?:ignore|disregard|override|forget)\s+(?:all\s+|any\s+)?(?:previous|prior|above|system|earlier)\s+(?:instructions?|prompts?|rules?)/i,
  /\byou\s+are\s+now\b|\bact\s+as\s+(?:an?\s+)?(?:admin|developer|system)\b/i,
  /\b(?:reveal|print|show|expose|leak)\b.{0,40}\b(?:system\s+prompt|api\s*key|password|secret|token)\b/i,
  /\b(?:transfer|send|wire|pay|move)\b.{0,40}\b(?:full|entire|all|whole)\b.{0,20}\b(?:balance|funds|money)\b/i,
  /\b(?:approve|execute|authori[sz]e)\b.{0,30}\bwithout\b.{0,20}\b(?:approval|confirmation|asking|owner)\b/i,
  /(?:ignore|disregard|override|forget|bypass)\b.{0,30}\b(?:instructions?|guidance|guidelines|rules?|polic(?:y|ies)|guardrails?|safety|approvals?)\b/i,
  /\b(?:transfer|send|wire|pay|move)\b.{0,15}\b(?:everything|all\s+(?:of\s+)?(?:it|the\s+money|my\s+money|funds|cash))\b/i,
  /\b(?:system|developer)\s*(?:prompt|message|mode)\b|\bjailbreak\b|\bdan\s+mode\b/i,
];

/** Undo common obfuscation before matching: zero-width chars, homoglyph digits, s p a c e d letters. */
function normalize(text) {
  let t = String(text || '').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
  t = t.replace(/\b(?:[A-Za-z][ .\-_*]){3,}[A-Za-z]\b/g, (m) => m.replace(/[ .\-_*]/g, ''));
  return t.replace(/\s+/g, ' ');
}

const PHISHING_PATTERNS = [
  { re: /\b(?:bank|account|payment|remittance|beneficiary)\s*(?:account\s+)?(?:details?|number|info(?:rmation)?)?\s+(?:has|have|is|are)?\s*(?:been\s+)?(?:changed|updated|new|revised|switched)\b|\bnew\s+(?:bank\s+)?account\b|\bpay\s+(?:to|into)\s+(?:a|the|this|our)\s+new\b/i, reason: 'bank_detail_change' },
  { re: /\b(?:urgent(?:ly)?|immediately|asap|within\s+\d+\s+(?:hours?|minutes?)|today\s+only|final\s+notice)\b/i, reason: 'urgency_pressure' },
  { re: /\b(?:gift\s*cards?|crypto|usdt|bitcoin)\b/i, reason: 'unusual_payment_rail' },
  { re: /\b(?:kyc|otp|pin|cvv)\b.{0,30}\b(?:share|send|verify|update)\b|\b(?:share|send)\b.{0,20}\b(?:otp|pin|cvv)\b/i, reason: 'credential_request' },
];

const PII_PATTERNS = [
  { re: /\b(?:\d[ -]?){13,16}\b/g, tag: '[CARD]' },
  { re: /\b[A-Z]{5}\d{4}[A-Z]\b/g, tag: '[PAN]' },
  { re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, tag: '[AADHAAR]' },
  { re: /\b\d{9,18}\b/g, tag: '[ACCOUNT]' },
  { re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, tag: '[IFSC]' },
  { re: /(?:\+91[ -]?)?\b[6-9]\d{9}\b/g, tag: '[PHONE]' },
];

function detectInjection(text) {
  const t = normalize(text);
  const hit = INJECTION_PATTERNS.find((re) => re.test(t));
  return hit ? { flagged: true, reason: 'prompt_injection' } : { flagged: false };
}

function detectPhishing(text) {
  const t = normalize(text);
  const reasons = PHISHING_PATTERNS.filter((p) => p.re.test(t)).map((p) => p.reason);
  const score = Math.min(100, reasons.length * 35 + (reasons.includes('bank_detail_change') ? 30 : 0));
  return { flagged: score >= 50, score, reasons };
}

function redactPII(text) {
  let out = String(text || '');
  for (const p of PII_PATTERNS) out = out.replace(p.re, p.tag);
  return out;
}

/** Untrusted text (invoice notes, emails, uploaded docs) is never executed as instructions. */
function sanitizeUntrustedText(text) {
  if (!text) return { text: '', flagged: false };
  const inj = detectInjection(text);
  const phish = detectPhishing(text);
  if (inj.flagged) return { text: '[content withheld: possible prompt injection]', flagged: true, reason: 'prompt_injection' };
  if (phish.flagged) return { text: redactPII(text), flagged: true, reason: `phishing:${phish.reasons.join(',')}` };
  return { text: redactPII(text), flagged: false };
}

module.exports = { normalize, detectInjection, detectPhishing, redactPII, sanitizeUntrustedText };
