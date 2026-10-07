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
