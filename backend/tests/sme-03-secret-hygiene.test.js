// Fails the suite if a tracked file contains a secret-looking value.
// Patterns are assembled at runtime so this file never matches itself.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'venv', '.venv', '__pycache__', 'runtime', 'models']);
const TEXT_EXT = /\.(js|ts|json|md|txt|env|example|yml|yaml|html|css|py|sh|ps1|cfg|ini|toml)$/i;

function listFiles() {
  try {
    return execSync('git ls-files', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean);
  } catch {
    const out = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (SKIP_DIRS.has(e.name)) continue;
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) walk(rel); else out.push(rel);
      }
    })('');
    return out;
  }
}

const j = (...p) => p.join('');
const PATTERNS = [
  { name: 'OpenAI-style API key', re: new RegExp(j('\\bsk-', '[A-Za-z0-9_-]{24,}')) },
  { name: 'GitHub token', re: new RegExp(j('\\bgh', '[pousr]_[A-Za-z0-9]{30,}')) },
  { name: 'AWS access key', re: new RegExp(j('\\bAK', 'IA[0-9A-Z]{16}\\b')) },
  { name: 'Private key block', re: new RegExp(j('-----BEGIN (?:RSA |EC |OPENSSH )?PRIV', 'ATE KEY-----')) },
  // Throwaway fixture passwords inside tests/ are allowed; published ones elsewhere are not.
  { name: 'Published demo password', re: new RegExp(j('Password', '@2026!|TestOnly', '!12345')), allowIn: /^backend[\\/]tests[\\/]/ },
  { name: 'Hard-coded API key assignment', re: new RegExp(j('(?:API_KEY|SECRET|TOKEN)\\s*[=:]\\s*[\'"]?', '[A-Za-z0-9_\\-]{32,}')) },
];

test('no secrets in tracked files', () => {
  const hits = [];
  for (const rel of listFiles()) {
    if (!TEXT_EXT.test(rel) || /package-lock\.json$/.test(rel) || SKIP_DIRS.has(rel.split(/[\\/]/)[0])) continue;
    const abs = path.join(ROOT, rel);
    let text;
    try { if (fs.statSync(abs).size > 2000000) continue; text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    for (const p of PATTERNS) if (!(p.allowIn && p.allowIn.test(rel)) && p.re.test(text)) hits.push(`${rel}: ${p.name}`);
  }
  assert.deepStrictEqual(hits, [], `Secrets found:\n${hits.join('\n')}`);
});

test('demo provisioning has no hard-coded shared password', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'provision-demo-accounts.js'), 'utf8');
  assert.match(src, new RegExp(j('process\\.env', '\\.DEMO_PASSWORD')));
  assert.match(src, /randomBytes/);
});
