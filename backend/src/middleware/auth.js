const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me';

// Routes a fully-expired (past its 30-day grace period) company must still be able to
// reach: auth (so they can still sign out / reset a password), license (so they can see
// their status and request an upgrade), and system (a Super Administrator manages every
// company's license, so their own trial state can never be the thing that locks them out).
const LICENSE_EXEMPT_PREFIXES = ['/auth', '/license', '/system'];

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing access token.' });

  let payload;
  try {
    payload = jwt.verify(token, ACCESS_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
  req.user = payload; // { sub, companyId, role, email }

  // Trial/license enforcement -- once a company's license has been expired for more than
  // its 30-day grace period, block write-and-read access to everything except the exempt
  // routes above, so the only thing left to do is request an upgrade or sign out.
  if (payload.role !== 'super_administrator' && !LICENSE_EXEMPT_PREFIXES.some((p) => req.path.startsWith(p))) {
    try {
      const db = require('../config/db');
      const result = await db.query(`SELECT license_expires_at FROM companies WHERE id = $1`, [payload.companyId]);
      const company = result.rows[0];
      if (company && company.license_expires_at) {
        const daysLeft = Math.ceil((new Date(company.license_expires_at) - new Date()) / (1000 * 60 * 60 * 24));
        if (daysLeft < -30) {
          return res.status(402).json({ error: 'Your license has expired. Please choose a plan to continue.', code: 'LICENSE_EXPIRED' });
        }
      }
    } catch (err) {
      // Fail open -- a bug in this check should never be able to lock every customer out.
      console.error('License check failed:', err);
    }
  }

  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have permission to do that." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, ACCESS_SECRET };
