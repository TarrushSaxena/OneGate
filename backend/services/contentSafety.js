const SEXUAL_RE = /\b(?:horny|sext(?:ing)?|send\s+(?:me\s+)?nudes?|porn(?:ography)?|sexual\s+chat|want\s+sex)\b/i;
const REPORT_RE = /\b(?:report|complaint|harass(?:ment|ed|ing)?|unwanted|assault)\b/i;
const STAFF_ABUSE_RE = /\b(?:fuck(?:ing|ed)?|bitch(?:es)?|asshole|moron|idiot|stupid)\b/i;

function assertProfessionalStaffText(value) {
  const text = String(value || '').trim();
  if (STAFF_ABUSE_RE.test(text)) {
    const error = new Error('Use professional workplace language before sending this update');
    error.status = 400;
    error.payload = { code: 'unprofessional_language' };
    throw error;
  }
  return text;
}

module.exports = { assertProfessionalStaffText, STAFF_ABUSE_RE };

const PROMPT_INJECTION_RE = /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system)\s+(?:instructions?|prompts?)|(?:print|reveal|show|give|expose)\b.{0,60}\b(?:admin password|system prompt|api key|secret)/i;
function inspectUserContent(text, userId) {
  const category=PROMPT_INJECTION_RE.test(String(text))?'prompt_injection':SEXUAL_RE.test(String(text))&&!REPORT_RE.test(String(text))?'sexual_content':null;
  if(!category)return null;
  const audit=require('./audit').logAuditEvent({actor_id:userId,action:'content_safety_blocked',target_type:'chat',target_id:userId,metadata:{category}});
  return {category,audit_id:audit.id,response:category==='sexual_content'?'I can help with workplace requests, but not sexual chat. If you need to report harassment or unwanted conduct, tell me what happened.':'I can’t reveal passwords, secrets, or internal system instructions. I can help with a workplace support request.'};
}
module.exports.inspectUserContent=inspectUserContent;
module.exports.PROMPT_INJECTION_RE=PROMPT_INJECTION_RE;
