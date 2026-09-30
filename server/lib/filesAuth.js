import crypto from 'crypto';

/**
 * The file manager is the most powerful feature of DBHub, and the rest of the app has no login,
 * so it is protected by its own admin password (env DBHUB_ADMIN_PASSWORD). No password configured
 * = the file manager stays disabled. Sessions are random tokens kept in memory (30 min, sliding).
 */
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const sessions = new Map(); // token -> expiresAt
const fails = new Map();    // ip -> { count, lockedUntil }

export const authConfigured = () => !!process.env.DBHUB_ADMIN_PASSWORD;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

export const clientIp = (req) => String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');

export async function login(password, ip) {
  const f = fails.get(ip);
  if (f && f.lockedUntil > Date.now()) {
    const min = Math.ceil((f.lockedUntil - Date.now()) / 60000);
    return { ok: false, status: 429, error: `Trop de tentatives. Réessayez dans ${min} min.` };
  }
  const ok = crypto.timingSafeEqual(sha(password ?? ''), sha(process.env.DBHUB_ADMIN_PASSWORD));
  if (!ok) {
    const next = { count: (f?.count ?? 0) + 1, lockedUntil: 0 };
    if (next.count >= MAX_FAILS) { next.lockedUntil = Date.now() + LOCK_MS; next.count = 0; }
    fails.set(ip, next);
    await new Promise((r) => setTimeout(r, 600)); // slow down brute force
    return { ok: false, status: 401, error: 'Mot de passe incorrect.' };
  }
  fails.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return { ok: true, token, expiresInSec: SESSION_TTL_MS / 1000 };
}

export function isAuthenticated(req) {
  const token = req.headers['x-files-token'] || req.query?.token;
  const exp = token && sessions.get(String(token));
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(String(token)); return false; }
  sessions.set(String(token), Date.now() + SESSION_TTL_MS);
  return true;
}

export function logout(req) { sessions.delete(String(req.headers['x-files-token'] || '')); }

export function requireFilesAuth(req, res, next) {
  if (!authConfigured()) return res.status(403).json({ error: 'Le gestionnaire de fichiers est désactivé : définissez DBHUB_ADMIN_PASSWORD dans docker-compose.yml.', code: 'DISABLED' });
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Connexion requise.', code: 'AUTH' });
  next();
}
