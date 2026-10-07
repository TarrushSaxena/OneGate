const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// A single transactional aggregate keeps the pilot's records and outbox atomic.
// PostgreSQL row locking also serializes multiple application processes.
class PilotStore {
  constructor() {
    this.pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
    this.file = process.env.PILOT_FILE || path.join(__dirname, '../data/runtime/pilot.json');
    this.memory = process.env.NODE_ENV === 'test' || this.file === ':memory:';
    this.data = { tickets: [], conversations: {}, events: [], feedback: [], subscriptions: [], workplace: {}, idempotency: {}, calls: [] };
    this.tail = Promise.resolve();
  }
  async init() {
    if (process.env.NODE_ENV === 'production' && !this.pool) throw new Error('DATABASE_URL is required for production');
    if (this.pool) {
      await this.pool.query('CREATE TABLE IF NOT EXISTS onegate_pilot (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
      await this.pool.query('INSERT INTO onegate_pilot(id,data) VALUES(1,$1) ON CONFLICT DO NOTHING', [JSON.stringify(this.data)]);
      this.data = (await this.pool.query('SELECT data FROM onegate_pilot WHERE id=1')).rows[0].data;
    } else if (!this.memory && fs.existsSync(this.file)) {
      this.data = { ...this.data, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    }
  }
  transaction(fn) {
    const run = async () => {
      const client = this.pool ? await this.pool.connect() : null;
      try {
        if (client) {
          await client.query('BEGIN');
          this.data = (await client.query('SELECT data FROM onegate_pilot WHERE id=1 FOR UPDATE')).rows[0].data;
        }
        const draft = structuredClone(this.data);
        const result = await fn(draft);
        if (client) {
          await client.query('UPDATE onegate_pilot SET data=$1,updated_at=now() WHERE id=1', [JSON.stringify(draft)]);
          await client.query('COMMIT');
        } else if (!this.memory) {
          fs.mkdirSync(path.dirname(this.file), { recursive: true });
          fs.writeFileSync(this.file + '.tmp', JSON.stringify(draft));
          fs.renameSync(this.file + '.tmp', this.file);
        }
        this.data = draft;
        return result;
      } catch (error) {
        if (client) await client.query('ROLLBACK');
        throw error;
      } finally { if (client) client.release(); }
    };
    const pending = this.tail.then(run, run);
    this.tail = pending.catch(() => {});
    return pending;
  }
  async refresh() {
    await this.tail;
    if (this.pool) this.data = (await this.pool.query('SELECT data FROM onegate_pilot WHERE id=1')).rows[0].data;
    return this.data;
  }
}
module.exports = { PilotStore };
