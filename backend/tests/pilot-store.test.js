const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PilotStore } = require('../services/pilotStore');

test('durable aggregate survives reload and rolls back failed transactions', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onegate-store-test-'));
  const file = path.join(directory, 'pilot.json');
  const store = new PilotStore();
  store.pool = null; store.memory = false; store.file = file;
  try {
    await store.init();
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.transaction(data => { data.events.push({ id: String(i) }); })));
    await assert.rejects(store.transaction(data => { data.events.push({ id: 'not-committed' }); throw new Error('rollback'); }));
    const reloaded = new PilotStore();
    reloaded.pool = null; reloaded.memory = false; reloaded.file = file;
    await reloaded.init();
    assert.equal(reloaded.data.events.length, 10);
    assert.equal(new Set(reloaded.data.events.map(e => e.id)).size, 10);
    assert.ok(!reloaded.data.events.some(e => e.id === 'not-committed'));
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmdirSync(directory);
  }
});
