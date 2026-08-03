require('dotenv').config();
const app = require('./app');
const { migrate } = require('./db/migrate');

const PORT = process.env.PORT || 4000;

// Migrations run automatically on every boot (schema_migrations tracks what's already
// applied, so this is safe/idempotent) rather than as a separate deploy step -- this
// blocks the server from accepting requests until the schema is up to date, so a
// fresh/empty database on first deploy can't be hit by a request before its tables
// exist. Set AUTO_MIGRATE=false to opt out (e.g. running migrations via a separate
// step in your own pipeline instead).
async function start() {
  if (process.env.AUTO_MIGRATE !== 'false') {
    console.log('[auto-migrate] starting...');
    await migrate();
    console.log('[auto-migrate] done.');
  }

  app.listen(PORT, () => {
    console.log(`ChronoBooks backend listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start ChronoBooks backend:', err);
  process.exit(1);
});
