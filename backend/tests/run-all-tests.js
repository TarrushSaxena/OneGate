// Master test runner for PS18-01 through PS18-13
const { spawn } = require('child_process');
const path = require('path');

const testFiles = [
  'ps18-01-migrations.test.js',
  'ps18-02-priority.test.js',
  'ps18-03-eta.test.js',
  'ps18-04-level-labels.test.js',
  'ps18-05-handoff-payload.test.js',
  'ps18-06-realtime-events.test.js',
  'ps18-07-orchestrator.test.js',
  'ps18-08-filters.test.js',
  'ps18-09-warm-handoff.test.js',
  'ps18-10-escalation.test.js',
  'ps18-11-offhours-busyqueue.test.js',
  'ps18-12-chat-ui-states.test.js',
  'ps18-13-agent-portal.test.js',
  'ps18-14-auth.test.js',
  'ps18-15-accounts.test.js',
  'ps18-16-routing.test.js',
  'ps18-17-dept-manager.test.js',
  'ps18-18-main-manager.test.js',
  'ps18-20-attendance.test.js',
  'ps18-21-emergency-sos.test.js',
  'ps18-22-lost-id.test.js',
  'ps18-usp1-three-way-routing.test.js',
  'ps18-usp2-resolution-type.test.js',
  'ps18-usp3-explainability.test.js',
  'ps18-usp4-tier-automation.test.js',
  'ps18-usp5-routing-learning.test.js',
  'ps18-usp6-audit-log.test.js',
  'ps18-usp7-continuous-thread.test.js',
  'ps18-23-department-manager-powers.test.js',
];

console.log('====================================================');
console.log(' Running PS18 Backlog & USP Acceptance Test Suite ');
console.log('====================================================\n');

async function runTest(file) {
  return new Promise((resolve) => {
    const fullPath = path.join(__dirname, file);
    const child = spawn(process.execPath, ['--test', fullPath], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test' },
    });
    child.on('close', (code) => {
      resolve({ file, passed: code === 0 });
    });
  });
}

async function runAll() {
  const results = [];
  for (const f of testFiles) {
    console.log(`\n▶ Running ${f}...`);
    const r = await runTest(f);
    results.push(r);
  }

  console.log('\n====================================================');
  console.log(' Test Summary:');
  console.log('====================================================');
  let allPass = true;
  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} - ${r.file}`);
    if (!r.passed) allPass = false;
  }

  if (allPass) {
    console.log('\n🎉 ALL 21 ACCEPTANCE TEST SUITES PASSED CLEANLY.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️ SOME TESTS FAILED.\n');
    process.exit(1);
  }
}

runAll();
