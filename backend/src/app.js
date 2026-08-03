const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const routes = require('./routes');

const app = express();

// helmet's default CSP blocks the frontend's own inline/asset loading when this same
// process serves it -- disabled here since the frontend is trusted, same-origin static
// output, not third-party content. The API responses aren't HTML, so this doesn't
// weaken anything about the JSON endpoints themselves.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, service: 'chronobooks-backend' }));

app.use('/api', routes);

// In production, the built frontend is copied to backend/frontend by the root
// Dockerfile (see /Dockerfile) so a single Railway service answers both the API and the
// app itself on one origin -- no separate frontend service, no CORS, no cross-site
// cookie concerns. In local dev this directory doesn't exist (the frontend runs on its
// own Vite dev server instead, proxying /api to this backend), so this block is skipped
// entirely and nothing here affects the local dev workflow.
const FRONTEND_DIR = path.join(__dirname, '../frontend');
if (fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
  console.log(`Serving frontend from ${FRONTEND_DIR} (API base: /api, relative)`);
  app.use(express.static(FRONTEND_DIR));
  // Anything not already matched above (i.e. not /api/* or /health) is a client-side
  // React Router route -- always hand back index.html so a hard refresh on e.g. /sales
  // still works instead of 404ing.
  app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
}

// Centralized error handler — keeps controllers free of try/catch boilerplate.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

module.exports = app;
