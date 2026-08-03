require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

// Tracks which migration files have already run, so `npm run migrate` is safe to
// re-run after adding a new file (002_sales.sql, 003_..., etc.) without re-applying
// ones already in place.
async function ensureMigrationsTable() {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at ${db.dialect === 'postgres' ? 'TIMESTAMPTZ' : 'TEXT'} NOT NULL DEFAULT ${db.dialect === 'postgres' ? 'now()' : "(datetime('now'))"}
  )`);
}

async function migrate() {
  const folder = db.dialect === 'postgres' ? 'postgres' : 'sqlite';
  const dir = path.join(__dirname, '..', '..', 'migrations', folder);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  await ensureMigrationsTable();
  const appliedRes = await db.query('SELECT filename FROM schema_migrations', []);
  const applied = new Set(appliedRes.rows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.exec(sql);
    await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    console.log(`Applied ${folder}/${file}`);
  }
}

module.exports = { migrate };

// Runs standalone (`npm run migrate`) and closes the connection pool when invoked
// directly from the CLI. When imported by server.js to auto-migrate on boot, only the
// bare `migrate()` function is used and the pool is left open for the server to use.
if (require.main === module) {
  migrate()
    .then(() => db.end())
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
