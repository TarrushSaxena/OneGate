// ============================================================
// OneGate SME — Tenant membership & isolation
// A user only ever sees the SME they belong to. Platform roles
// (even main_manager) grant NO cross-tenant access.
// ============================================================
const SME_ROLES = { OWNER: 'owner', ACCOUNTANT: 'accountant', VIEWER: 'viewer' };

const members = new Map(); // email -> { tenant_id, sme_role }

const DEMO_MEMBERS = [
  ['owner.ananya@company.com', 'sme_ananya_textiles', SME_ROLES.OWNER],
  ['accounts.ananya@company.com', 'sme_ananya_textiles', SME_ROLES.ACCOUNTANT],
  ['owner.chai@company.com', 'sme_chai_point_cafe', SME_ROLES.OWNER],
  ['owner.pixelforge@company.com', 'sme_pixelforge_studio', SME_ROLES.OWNER],
  ['viewer.pixelforge@company.com', 'sme_pixelforge_studio', SME_ROLES.VIEWER],
];
for (const [e, t, r] of DEMO_MEMBERS) members.set(e, { tenant_id: t, sme_role: r });

function assignMember(email, tenantId, smeRole) {
  if (!Object.values(SME_ROLES).includes(smeRole)) throw new Error('invalid sme role');
  members.set(String(email).toLowerCase(), { tenant_id: tenantId, sme_role: smeRole });
}
function membershipFor(user) {
  if (!user || !user.email) return null;
  return members.get(String(user.email).toLowerCase()) || null;
}

module.exports = { SME_ROLES, assignMember, membershipFor, DEMO_MEMBERS };
