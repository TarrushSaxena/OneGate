// ============================================================
// KNOWN SAFE FIXES REGISTRY (USP-1)
// Known self-service resolution paths for recoverable incidents
// ============================================================

const KNOWN_FIXES = [
  {
    id: 'fix-vpn-reset',
    department: 'IT',
    symptom_pattern: /\b(vpn|globalprotect|error\s*90|tunnel\s*timeout|vpn\s*connection|vpn\s*fail|vpn\s*disconnect)\b/i,
    title: 'VPN Connection Reset Protocol',
    fix_text: 'It looks like your VPN connection may need a credential or socket reset:\n\n1. Sign out of the GlobalProtect/VPN client application.\n2. Fully restart the application via system tray.\n3. Sign in again using your corporate SSO credentials.\n4. If error 90 persists, disconnect corporate Wi-Fi and reconnect to mobile hotspot to re-issue the certificate.',
    source_citation: 'IT Knowledge Base §3.2 — VPN & Remote Access',
    source_clause_id: 'KB-IT-003',
    follow_up_window_hours: 24,
    is_active: true,
  },
  {
    id: 'fix-password-reset',
    department: 'IT',
    symptom_pattern: /\b(reset.*password|forgot.*password|password.*expired|sso.*lockout)\b/i,
    title: 'Self-Service Password Reset',
    fix_text: 'Self-service password reset is available:\n\n1. Navigate to https://reset.company.com.\n2. Complete multi-factor push verification on your authenticator app.\n3. Set a new password meeting enterprise requirements (12+ characters, upper, lower, number, symbol).\n4. Wait 3 minutes for Active Directory synchronization across SSO services.',
    source_citation: 'IT Security Policy §7.1 — Password Management',
    source_clause_id: 'KB-IT-007',
    follow_up_window_hours: 24,
    is_active: true,
  },
  {
    id: 'fix-wifi-reconnect',
    department: 'IT',
    symptom_pattern: /\b(wifi|wi-fi|eduroam|corporate network|wpa2|wifi drop)\b/i,
    title: 'Corporate Wi-Fi Certificate Renewal',
    fix_text: 'To refresh corporate Wi-Fi authentication:\n\n1. Forget the "Corporate-Secure" network in your device Wi-Fi settings.\n2. Toggle Airplane mode ON for 5 seconds, then OFF.\n3. Re-select "Corporate-Secure" and enter your domain username and password.\n4. Accept the corporate 802.1x security certificate when prompted.',
    source_citation: 'IT Network Handbook §2.1',
    source_clause_id: 'KB-IT-012',
    follow_up_window_hours: 24,
    is_active: true,
  },
  {
    id: 'fix-concur-cache',
    department: 'Finance',
    symptom_pattern: /\b(concur.*error|concur.*stuck|expense.*receipt.*upload.*fail|expense.*portal.*blank)\b/i,
    title: 'Finance Portal Cache Refresh',
    fix_text: 'To resolve expense portal upload errors:\n\n1. Log out of Concur / Finance Portal.\n2. Clear your browser cookies and site cache for *.company.com.\n3. Open in a private/incognito window.\n4. Upload receipts in PDF or JPEG format under 5MB per attachment.',
    source_citation: 'Finance Policy Handbook §4.2',
    source_clause_id: 'KB-FIN-004',
    follow_up_window_hours: 24,
    is_active: true,
  },
];

function findKnownFix(message, department) {
  if (!message || typeof message !== 'string') return null;
  const text = message.trim();

  // If physical damage or severe emergency is reported, never try self-fix
  const EMERGENCY_RE = /\b(swelling|smoking|battery\s*burst|spill|shattered|cracked\s*screen|broken\s*screen|lost\s*badge|fire|medical)\b/i;
  if (EMERGENCY_RE.test(text)) return null;

  for (const fix of KNOWN_FIXES) {
    if (!fix.is_active) continue;
    if (fix.symptom_pattern.test(text)) {
      return fix;
    }
  }

  return null;
}

module.exports = {
  KNOWN_FIXES,
  findKnownFix,
};
