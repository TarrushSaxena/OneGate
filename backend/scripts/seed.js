// OneGate Organization Seeder Script
// Provisions real organizational accounts with temporary passwords and sets must_change_password: true.
const crypto = require('crypto');
const accountStore = require('../auth/accountStore');
const { buildOrganizationRoster, buildSeedTickets } = require('../seed/org-generator');
const mailer = require('../auth/mailer');
const { COMPANY_EMAIL_DOMAIN, isProd } = require('../auth/config');

function generateSecureTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const specials = '!@#$%&*';

  let pass = '';
  pass += chars[crypto.randomInt(chars.length)];
  pass += chars[crypto.randomInt(chars.length)];
  pass += lower[crypto.randomInt(lower.length)];
  pass += lower[crypto.randomInt(lower.length)];
  pass += digits[crypto.randomInt(digits.length)];
  pass += digits[crypto.randomInt(digits.length)];
  pass += specials[crypto.randomInt(specials.length)];
  pass += specials[crypto.randomInt(specials.length)];

  const all = chars + lower + digits + specials;
  while (pass.length < 14) {
    pass += all[crypto.randomInt(all.length)];
  }
  return pass;
}

async function seed() {
  console.log('🌱 Seeding OneGate Enterprise Organization Accounts...');
  const roster = buildOrganizationRoster(COMPANY_EMAIL_DOMAIN);

  let createdCount = 0;
  for (const person of roster) {
    const existing = accountStore.findByEmail(person.email);
    if (!existing) {
      const tempPassword = generateSecureTempPassword();
      const account = await accountStore.createAccount({
        ...person,
        password: tempPassword,
        must_change_password: true,
      });

      await mailer.sendTemporaryPassword({
        to: account.email,
        name: account.name,
        tempPassword,
      });

      createdCount++;
    }
  }

  console.log(`✅ Seeded ${createdCount} new accounts across 11 departments.`);
  console.log(`📧 Temporary credentials sent securely to mailer outbox.`);
  console.log(`🔒 All accounts have must_change_password enforced on first login.`);
}

if (require.main === module) {
  seed().catch(err => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  });
}

module.exports = { seed };
