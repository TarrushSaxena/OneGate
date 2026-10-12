// Master test runner for PS18-01 through PS18-13
const { spawn } = require('child_process');
const path = require('path');

const testFiles = require('fs').readdirSync(__dirname).filter(file => /^(pilot-|ps18-|sme-).*\.test\.js$/.test(file)).sort();

console.log('====================================================');
console.log(' Running PS18 Backlog & USP Acceptance Test Suite ');
console.log('====================================================\n');

async function runTest(file) {
  return new Promise((resolve) => {
    const fullPath = path.join(__dirname, file);
    const child = spawn(process.execPath, ['--test', '--test-timeout=60000', fullPath], {
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
    console.log('\n🎉 ALL ACCEPTANCE TEST SUITES PASSED CLEANLY.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️ SOME TESTS FAILED.\n');
    process.exit(1);
  }
}

runAll();
