const accountStore = require('../auth/accountStore');
const { DEMO_MODE } = require('../auth/config');
const { DEMO_ACCOUNTS } = require('../data/demo-accounts');
const crypto = require('crypto');
const { verifyPassword } = require('../auth/passwords');

// No shared password lives in the repo. Set DEMO_PASSWORD for a stable value on a
// private demo box; otherwise a random one is generated per run and printed once.
// Day-to-day demos use passwordless one-click demo login (dev only, see DEMO_ACCESS.md).
const MASTER_DEMO_PASSWORD = process.env.DEMO_PASSWORD || `Demo-${crypto.randomBytes(9).toString('base64url')}!`;
const PASSWORD_FROM_ENV = Boolean(process.env.DEMO_PASSWORD);
if (PASSWORD_FROM_ENV && MASTER_DEMO_PASSWORD.length < 12) throw new Error('DEMO_PASSWORD must be at least 12 characters');

async function provisionDemoAccounts() {
  if (!DEMO_MODE) throw new Error('Demo account provisioning is disabled');
  const result = { created: 0, repaired: 0, unchanged: 0 };
  for (const definition of DEMO_ACCOUNTS) {
    const existing = accountStore.findByEmail(definition.email);
    if (!existing) {
      await accountStore.createAccount({
        ...definition,
        id: `acct-demo-${definition.key}`,
        password: MASTER_DEMO_PASSWORD,
        active: true,
        must_change_password: false,
        created_by: 'demo-provisioner',
      });
      result.created++;
      continue;
    }

    // Without DEMO_PASSWORD, never rotate an existing account's password on re-runs.
    const passwordMatches = PASSWORD_FROM_ENV ? await verifyPassword(MASTER_DEMO_PASSWORD, existing.password_hash) : true;
    const profileMatches = existing.name === definition.name &&
      existing.role === definition.role && existing.department === definition.department &&
      existing.tier === definition.tier && existing.active !== false && !existing.must_change_password &&
      passwordMatches;
    if (profileMatches) {
      result.unchanged++;
      continue;
    }
    const updateData = {
      name: definition.name,
      role: definition.role,
      department: definition.department,
      tier: definition.tier,
      skill_tags: definition.skill_tags || existing.skill_tags || [],
      active: true,
      must_change_password: false,
    };
    if (!passwordMatches) {
      updateData.password = MASTER_DEMO_PASSWORD;
    }
    await accountStore.updateAccount(existing.id, updateData);
    result.repaired++;
  }
  return { ...result, total: DEMO_ACCOUNTS.length };
}

if (require.main === module) {
  provisionDemoAccounts()
    .then(result => {
      console.log(`Demo accounts ready: ${result.total} total, ${result.created} created, ${result.repaired} repaired, ${result.unchanged} unchanged.`);
      if (result.created && !PASSWORD_FROM_ENV) console.log(`Password for newly created demo accounts (shown once, not stored): ${MASTER_DEMO_PASSWORD}`);
    })
    .catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = { provisionDemoAccounts };
