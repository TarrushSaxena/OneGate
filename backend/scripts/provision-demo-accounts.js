const accountStore = require('../auth/accountStore');
const { DEMO_MODE } = require('../auth/config');
const { DEMO_ACCOUNTS } = require('../data/demo-accounts');
const { verifyPassword } = require('../auth/passwords');

const MASTER_DEMO_PASSWORD = 'Password@2026!';

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

    const passwordMatches = await verifyPassword(MASTER_DEMO_PASSWORD, existing.password_hash);
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
    .then(result => console.log(`Demo accounts ready: ${result.total} total, ${result.created} created, ${result.repaired} repaired, ${result.unchanged} unchanged.`))
    .catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = { provisionDemoAccounts };
