import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// The same statements and transaction boundaries as D1, on actual SQLite.
export function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001.sql', import.meta.url), 'utf8'));
  const prepare = query => ({
    args: [], query,
    bind(...args) { return { ...this, args }; },
    async first() { return sql.prepare(query).get(...this.args) ?? null; },
    async all() { return { results: sql.prepare(query).all(...this.args) }; },
    async run() {
      const result = sql.prepare(query).run(...this.args);
      return { meta: { changes: Number(result.changes) }, results: [] };
    },
  });
  return { prepare, sql, async batch(statements) {
    sql.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(s => {
        const statement = sql.prepare(s.query);
        const rows = statement.all(...s.args);
        return { results: rows, meta: { changes: sql.prepare('SELECT changes() AS n').get().n } };
      });
      sql.exec('COMMIT');
      return results;
    } catch (e) { sql.exec('ROLLBACK'); throw e; }
  } };
}
