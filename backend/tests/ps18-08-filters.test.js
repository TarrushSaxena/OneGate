const test = require('node:test');
const assert = require('node:assert');
const { redactPII } = require('../services/orchestrator');

test('PS18-08: Personal data redaction 20-case test with zero raw leaks', () => {
  const cases = [
    // Credit / Debit Cards
    { text: 'My card number is 4532-1234-5678-9012 please charge it', pattern: /4532[\s-]?1234/ },
    { text: 'Visa card: 4111 2222 3333 4444 expired', pattern: /(?:4111|2222|3333|4444)/ },
    { text: 'Mastercard 5500123456789010 on file', pattern: /5500123456789010/ },
    { text: 'Amex card 3782-822463-10005', pattern: /3782[\s-]?822463/ },

    // Social Security Numbers (SSN)
    { text: 'SSN is 123-45-6789 for tax record', pattern: /123-45-6789/ },
    { text: 'My ssn number 987-65-4321 was lost', pattern: /987-65-4321/ },
    { text: 'Employee SSN: 555-01-9999 verification', pattern: /555-01-9999/ },
    { text: 'Tax file with SSN 444-11-2222', pattern: /444-11-2222/ },

    // Phone Numbers
    { text: 'Call me back at 555-123-4567 today', pattern: /555-123-4567/ },
    { text: 'Mobile: (555) 987-6543 immediately', pattern: /\(555\)\s*987-6543/ },
    { text: 'Phone is +1-800-555-0199 for updates', pattern: /\+1-800-555-0199/ },
    { text: 'Reach me at 415.555.2671', pattern: /415\.555\.2671/ },

    // Bank Account Numbers
    { text: 'Update direct deposit to account 123456789012', pattern: /123456789012/ },
    { text: 'Wire transfer to routing account 98765432101', pattern: /98765432101/ },
    { text: 'Bank account number is 887766554433', pattern: /887766554433/ },
    { text: 'Account 112233445566 for payroll', pattern: /112233445566/ },

    // Emails
    { text: 'Send credentials to confidential.user@external.com', pattern: /confidential\.user@external\.com/ },
    { text: 'Alternative email is secret_ceo@competitor.net', pattern: /secret_ceo@competitor\.net/ },
    { text: 'Personal mail is john.doe.private@gmail.com', pattern: /john\.doe\.private@gmail\.com/ },
    { text: 'HR file sent to hr.audit.leak@outside.org', pattern: /hr\.audit\.leak@outside\.org/ },
  ];

  assert.strictEqual(cases.length, 20, 'Must have exactly 20 test cases');

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const { text: cleanText, redacted } = redactPII(c.text);

    // Verify raw pattern no longer exists in cleanText
    assert.strictEqual(
      c.pattern.test(cleanText),
      false,
      `Case ${i + 1} leak detected! Raw sensitive data still found in: "${cleanText}"`
    );

    // Verify redaction was tracked
    assert.ok(redacted.length > 0, `Case ${i + 1} failed to flag redacted PII category`);
    assert.ok(cleanText.includes('[') && cleanText.includes('HIDDEN]'), `Case ${i + 1} must include masked token`);
  }
});
