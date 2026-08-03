/**
 * Database adapter.
 *
 * Production (Railway) sets DATABASE_URL to a postgres:// connection string and this
 * talks to real PostgreSQL via `pg`, matching the rest of the ChronoSync stack.
 *
 * When DATABASE_URL is unset or points at sqlite:, it falls back to Node's built-in
 * node:sqlite module (zero extra install, no server process) so the app can be run and
 * smoke-tested anywhere, including sandboxes without a Postgres server available.
 * Query text is written Postgres-style ($1, $2, ... plus RETURNING) and translated for
 * SQLite automatically, so application code never branches on the driver.
 */

function createPgDriver(connectionString) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString });

  return {
    dialect: 'postgres',
    async query(text, params = []) {
      const result = await pool.query(text, params);
      return { rows: result.rows };
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async end() {
      await pool.end();
    },
  };
}

function createSqliteDriver(file) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');

  return {
    dialect: 'sqlite',
    async query(text, params = []) {
      // Postgres-style $1/$2 placeholders can repeat (e.g. $2 used twice in a subquery).
      // Resolve each occurrence to its source param rather than assuming positions line up 1:1.
      const boundParams = [];
      const sqliteText = text.replace(/\$(\d+)/g, (_, n) => {
        boundParams.push(params[Number(n) - 1]);
        return '?';
      });
      const upper = sqliteText.trim().toUpperCase();
      const stmt = db.prepare(sqliteText);
      const returnsRows = upper.startsWith('SELECT') || upper.includes('RETURNING');
      if (returnsRows) {
        return { rows: stmt.all(...boundParams) };
      }
      stmt.run(...boundParams);
      return { rows: [] };
    },
    async exec(sql) {
      db.exec(sql);
    },
    async end() {
      db.close();
    },
  };
}

function createDb() {
  const url = process.env.DATABASE_URL || 'sqlite:./chronobooks.db';
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    return createPgDriver(url);
  }
  const file = url.replace(/^sqlite:/, '') || './chronobooks.db';
  return createSqliteDriver(file);
}

module.exports = createDb();
