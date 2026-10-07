const definitions = [
  {
    id: 'hr.apply_leave',
    label: 'Apply for leave',
    description: 'Choose dates and send the request to your manager.',
    policyClauses: ['hr-001'],
    owner: 'HR',
    viewers: ['Your department manager', 'HR'],
    kind: 'submission',
    fields: [
      { name: 'leaveType', label: 'Leave type', type: 'select', required: true, options: [{ value: 'pto', label: 'Paid time off' }, { value: 'sick', label: 'Sick leave' }, { value: 'bereavement', label: 'Bereavement' }, { value: 'comp_off', label: 'Comp-off' }] },
      { name: 'startDate', label: 'Start date', type: 'date', required: true },
      { name: 'endDate', label: 'End date', type: 'date', required: true },
      { name: 'reason', label: 'Reason', type: 'textarea', required: true, maxLength: 1200 },
    ],
  },
  {
    id: 'hr.view_leave_balance',
    label: 'View leave balance',
    description: 'Show available and pending leave in this thread.',
    policyClauses: ['hr-balance'], owner: 'HR', viewers: ['You'], kind: 'read_only', fields: [],
  },
  {
    id: 'finance.submit_expense_claim',
    label: 'Submit expense claim',
    description: 'Record an expense for manager and Finance review.',
    policyClauses: ['fin-001'], owner: 'Finance', viewers: ['Your department manager', 'Finance'], kind: 'submission',
    fields: [
      { name: 'amount', label: 'Amount (INR)', type: 'number', required: true, min: 1, max: 10000000 },
      { name: 'expenseDate', label: 'Expense date', type: 'date', required: true },
      { name: 'category', label: 'Category', type: 'select', required: true, options: ['Travel', 'Meals', 'Office supplies', 'Client expense', 'Other'].map(value => ({ value, label: value })) },
      { name: 'reason', label: 'Business purpose', type: 'textarea', required: true, maxLength: 1200 },
      { name: 'receipt', label: 'Receipt', type: 'file', required: true, accept: 'image/png,image/jpeg,application/pdf', maxBytes: 1048576 },
    ],
  },
  {
    id: 'it.report_lost_device',
    label: 'Report lost or stolen device',
    description: 'Verify your identity and alert IT Security immediately.',
    policyClauses: ['it-003', 'it-008'], owner: 'IT Security', viewers: ['Your department manager', 'IT Security'], kind: 'incident', requiresVerification: true,
    fields: [
      { name: 'device', label: 'Device', type: 'text', required: true, maxLength: 160 },
      { name: 'lastSeen', label: 'Last seen', type: 'datetime-local', required: true },
      { name: 'reason', label: 'What happened?', type: 'textarea', required: true, maxLength: 1200 },
    ],
  },
  {
    id: 'facilities.report_lost_id',
    label: 'Report lost ID card',
    description: 'Verify your identity and alert Facilities Security.',
    policyClauses: ['fac-001'], owner: 'Facilities Security', viewers: ['Your department manager', 'Facilities Security'], kind: 'incident', requiresVerification: true,
    fields: [
      { name: 'lastSeen', label: 'Last seen', type: 'datetime-local', required: true },
      { name: 'reason', label: 'What happened?', type: 'textarea', required: true, maxLength: 1200 },
    ],
  },
];

function publicDefinition(definition) {
  return {
    id: definition.id, label: definition.label, description: definition.description,
    owner: definition.owner, viewers: definition.viewers, kind: definition.kind,
    requiresVerification: !!definition.requiresVerification,
    fields: definition.fields.map(field => ({ ...field })),
  };
}

function getAction(id) {
  return definitions.find(action => action.id === id) || null;
}

function matchActions(kbArticle) {
  const clauseId = typeof kbArticle === 'string' ? kbArticle : kbArticle?.id;
  if (!clauseId) return [];
  return definitions.filter(action => action.policyClauses.includes(clauseId)).slice(0, 2).map(publicDefinition);
}

module.exports = { definitions, getAction, matchActions, publicDefinition };
