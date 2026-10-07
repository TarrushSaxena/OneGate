// Central route security policy mapping paths to required roles
const { ROLES } = require('./roles');

const POLICIES = [
  // Public routes
  { method: 'POST', pattern: /^\/api\/auth\/(login|logout|forgot-password|reset-password)$/, public: true },

  // Any authenticated role
  { method: 'GET', pattern: /^\/api\/auth\/me$/, roles: Object.values(ROLES) },
  { method: 'POST', pattern: /^\/api\/auth\/change-password$/, roles: Object.values(ROLES) },
  { method: 'POST', pattern: /^\/api\/chat\/(message|history|feedback)$/, roles: Object.values(ROLES) },
  { method: 'GET', pattern: /^\/api\/kb\/(search|stats|articles)/, roles: Object.values(ROLES) },
  { method: 'GET', pattern: /^\/api\/system\/status$/, roles: Object.values(ROLES) },

  // Employee only or tickets created by employee
  { method: 'GET', pattern: /^\/api\/tickets\/my$/, roles: [ROLES.EMPLOYEE] },

  // Support Executive, Department Manager, Main Manager
  { method: 'GET', pattern: /^\/api\/support\/(inbox|stats|queue)/, roles: [ROLES.SUPPORT_EXECUTIVE, ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER] },
  { method: 'PATCH', pattern: /^\/api\/tickets\/[^\/]+$/, roles: [ROLES.SUPPORT_EXECUTIVE, ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER] },
  { method: 'POST', pattern: /^\/api\/tickets\/[^\/]+\/(reply|resolve|escalate|reassign)$/, roles: [ROLES.SUPPORT_EXECUTIVE, ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER] },
  { method: 'POST', pattern: /^\/api\/routing\/correct$/, roles: [ROLES.SUPPORT_EXECUTIVE, ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER] },

  // Managers only (Department Manager + Main Manager)
  { method: 'GET', pattern: /^\/api\/manager\/(department|roster|metrics)/, roles: [ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER] },
  { method: 'GET', pattern: /^\/api\/admin\/accounts$/, roles: [ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER] },
  { method: 'POST', pattern: /^\/api\/admin\/accounts$/, roles: [ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER] },
  { method: 'GET', pattern: /^\/api\/dashboard\/all$/, roles: [ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER] },
  { method: 'GET', pattern: /^\/api\/departments\/[^\/]+\/dashboard$/, roles: [ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER] },
  { method: 'GET', pattern: /^\/api\/ml\/stats$/, roles: [ROLES.DEPARTMENT_MANAGER, ROLES.MAIN_MANAGER] },
];

function getPolicy(method, path) {
  for (const pol of POLICIES) {
    if (pol.method === method && pol.pattern.test(path)) {
      return pol;
    }
  }
  return null;
}

module.exports = {
  POLICIES,
  getPolicy,
};
