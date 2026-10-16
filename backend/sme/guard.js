// ============================================================
// OneGate SME — Guardrails: prompt-injection, phishing, PII redaction
// Treats all document / counterparty text as untrusted data.
// ============================================================

// A balance that belongs to a document (invoice, bill, PO, loan, EMI, GST/TDS challan) or is
// qualified as "due/owed/outstanding" is normal finance language, not a request to drain the account.
const DOC_WORDS = '(?:invoices?|bills?|inv\\b|inv-|po\\b|purchase\\s+orders?|orders?|loans?|emis?|gst|tds|challans?|vendors?|suppliers?|statements?|dues)';
const BENIGN_BALANCE = `(?!\\s+(?:due|owed|outstanding|remaining|pending|payable)\\b)(?!\\s+(?:of|on|for|against|under)\\s+(?:the\\s+|this\\s+|that\\s+|our\\s+|my\\s+|their\\s+)?(?:[a-z0-9-]+\\s+){0,4}${DOC_WORDS})`;

const INJECTION_PATTERNS = [
  /(?:ignore|disregard|override|forget)\s+(?:all\s+|any\s+)?(?:previous|prior|above|system|earlier)\s+(?:instructions?|prompts?|rules?)/i,
  /\byou\s+are\s+now\b|\bact\s+as\s+(?:an?\s+)?(?:admin|developer|system)\b/i,
  /\b(?:reveal|print|show|expose|leak)\b.{0,40}\b(?:system\s+prompt|api\s*key|password|secret|token)\b/i,
  // "Move the whole balance / all the funds": blocked, but ordinary finance phrasing like
  // "pay the full balance of invoice X" or "the full balance due on bill B-12" is allowed
  // (it names a document, not the account balance). The next pattern still blocks any of
  // these when they also name a destination account.
  new RegExp(`\\b(?:transfer|send|wire|pay|move)\\b.{0,40}\\b(?:full|entire|all|whole)\\b.{0,20}\\b(?:funds|money|balance${BENIGN_BALANCE})\\b`, 'i'),
  /\b(?:transfer|send|wire|pay|move)\b.{0,60}\b(?:full|entire|all|whole)\b.{0,40}\b(?:balance|funds|money)\b.{0,60}\bto\s+(?:me\b|myself\b|(?:a\s+|an\s+|the\s+|this\s+|that\s+|my\s+|our\s+|his\s+|her\s+)?(?:new\s+|different\s+|personal\s+|other\s+)?(?:account|a\/c|acct|upi|vpa|wallet|beneficiary|\d{6,}))/i,
  /\b(?:approve|execute|authori[sz]e)\b.{0,30}\bwithout\b.{0,20}\b(?:approval|confirmation|asking|owner)\b/i,
  /(?:ignore|disregard|override|forget|bypass)\b.{0,30}\b(?:instructions?|guidance|guidelines|rules?|polic(?:y|ies)|guardrails?|safety|approvals?)\b/i,
  /\b(?:transfer|send|wire|pay|move)\b.{0,15}\b(?:everything|all\s+(?:of\s+)?(?:it|the\s+money|my\s+money|funds|cash))\b/i,
  /\b(?:system|developer)\s*(?:prompt|message|mode)\b|\bjailbreak\b|\bdan\s+mode\b/i,
  // Social engineering: claimed approval or role-play to skip the owner.
  /\b(?:owner|ceo|boss|admin|director|malik)\b.{0,25}\b(?:already|has|have)\b.{0,12}\b(?:approved|authori[sz]ed|okayed|signed\s+off|said\s+(?:ok|yes))\b/i,
  /\b(?:pretend|imagine|role\s*-?\s*play|act\s+like)\b.{0,40}\b(?:owner|admin|approved?|no\s+(?:rules|limits))\b/i,
  // Hinglish (romanised Hindi).
  /\b(?:pichle|pichhle|purane|saare|sare|sabhi|upar\s+ke)\b.{0,25}\b(?:instructions?|niyam|rules?|nirdesh|baatein)\b.{0,25}\b(?:bhool|bhul|ignore|nazarandaz|chhod|chod)/i,
  /\b(?:poora|pura|poore|pure|saara|sara|saare|sare|sab|sabhi)\b.{0,20}\b(?:balance|paisa|paise|amount|funds?|rakam)\b.{0,40}\b(?:transfer|bhej|bhejo|daal|dalo|daalo|kar\s*do|nikal)/i,
  /\bbina\b.{0,20}\b(?:approval|permission|puche|pooche|poochhe|otp|code)\b.{0,25}\b(?:pay|bhej|bhejo|transfer|kar)/i,
  // Hindi (Devanagari).
  /(?:निर्देश|नियम|निर्देशों).{0,25}(?:भूल|अनदेखा|नज़रअंदाज़|नजरअंदाज)/,
  /(?:पूरा|पूरे|सारा|सारे|सब).{0,20}(?:बैलेंस|पैसा|पैसे|राशि|रकम).{0,40}(?:ट्रांसफर|भेज|डाल)/,
];

// Lookalike letters from other scripts and leetspeak, folded to plain Latin for matching only.
const HOMOGLYPHS = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'һ': 'h', 'ӏ': 'l', 'ո': 'n', 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'α': 'a', 'ο': 'o', 'ε': 'e', 'ι': 'i', 'ν': 'v', 'τ': 't', 'Ι': 'I', 'Ο': 'O', 'І': 'I', 'Ј': 'J', 'Ѕ': 'S', 'Ԁ': 'D', 'Һ': 'H', 'Ү': 'Y', 'ү': 'y', 'Ѵ': 'V', 'ѵ': 'v', 'ԛ': 'q', 'ԝ': 'w', 'Ԝ': 'W', 'Ζ': 'Z', 'Β': 'B', 'Ε': 'E', 'Η': 'H', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ρ': 'P', 'Τ': 'T', 'Χ': 'X', 'Υ': 'Y' };
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };
const foldHomoglyphs = (t) => t.replace(/[\u0370-\u03FF\u0400-\u04FF\u0500-\u052F\u0530-\u058F]/g, (c) => HOMOGLYPHS[c] || c);
const foldLeet = (t) => t.replace(/[a-z][0-9@$]+[a-z]|[0-9@$][a-z]{2,}|[a-z]{2,}[0-9@$]/gi, (w) => w.replace(/[0-9@$]/g, (c) => LEET[c] || c));

/** Decode hidden payloads (base64, %-encoding) so they are checked too. */
function decodeHidden(t) {
  const extra = [];
  for (const m of t.match(/[A-Za-z0-9+/]{16,}={0,2}/g) || []) {
    try {
      const d = Buffer.from(m, 'base64').toString('utf8');
      const printable = d.replace(/[^\x20-\x7E\u0900-\u097F]/g, '').length / Math.max(1, d.length);
      if (d.length >= 12 && printable > 0.9) extra.push(d);
    } catch (_) { /* not base64 */ }
  }
  if (/%[0-9A-Fa-f]{2}/.test(t)) { try { extra.push(decodeURIComponent(t)); } catch (_) { /* malformed */ } }
  return extra;
}

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

function variants(text) {
  const base = normalize(text);
  const out = [base, foldHomoglyphs(base)];
  out.push(foldLeet(out[1]));
  for (const d of decodeHidden(String(text || ''))) { const n = normalize(d); out.push(n, foldLeet(foldHomoglyphs(n))); }
  return out;
}

function detectInjection(text) {
  const vs = variants(text);
  for (const [i, t] of vs.entries()) {
    if (INJECTION_PATTERNS.some((re) => re.test(t))) return { flagged: true, reason: 'prompt_injection', via: i === 0 ? 'plain' : i <= 2 ? 'deobfuscated' : 'decoded_payload' };
  }
  return { flagged: false };
}

function detectPhishing(text) {
  const t = variants(text).join(' \n ');
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

module.exports = { variants, decodeHidden, normalize, detectInjection, detectPhishing, redactPII, sanitizeUntrustedText };
