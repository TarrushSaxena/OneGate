// Role definitions and permission helpers
const ROLES = {
  EMPLOYEE: 'employee',
  SUPPORT_EXECUTIVE: 'support_executive',
  DEPARTMENT_MANAGER: 'department_manager',
  MAIN_MANAGER: 'main_manager',
};

const ALL_ROLES = Object.values(ROLES);

function isValidRole(role) {
  return ALL_ROLES.includes(role);
}

function isManager(role) {
  return role === ROLES.DEPARTMENT_MANAGER || role === ROLES.MAIN_MANAGER;
}

function isSupportOrManager(role) {
  return (
    role === ROLES.SUPPORT_EXECUTIVE ||
    role === ROLES.DEPARTMENT_MANAGER ||
    role === ROLES.MAIN_MANAGER
  );
}

function canViewAllDepartments(role) {
  return role === ROLES.MAIN_MANAGER;
}

function getRoleRedirect(role) {
  switch (role) {
    case ROLES.EMPLOYEE:
      return '/app/chat';
    case ROLES.SUPPORT_EXECUTIVE:
      return '/app/inbox';
    case ROLES.DEPARTMENT_MANAGER:
      return '/app/department';
    case ROLES.MAIN_MANAGER:
      return '/app/org';
    default:
      return '/';
  }
}

module.exports = {
  ROLES,
  ALL_ROLES,
  isValidRole,
  isManager,
  isSupportOrManager,
  canViewAllDepartments,
  getRoleRedirect,
};
