function canRead(user, ticket) {
  return user.role === 'main_manager' ||
    (user.role === 'employee' && ticket.user_id === user.id) ||
    (user.role === 'support_executive' && ticket.assigned_to === user.id) ||
    (user.role === 'department_manager' && ticket.department === user.department);
}
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
function staff(user) { return ['main_manager', 'department_manager'].includes(user.role); }
module.exports = { canRead, fail, staff };
