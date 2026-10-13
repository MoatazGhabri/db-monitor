import { db, uuid, now } from '../lib/context.js';
import { authConfigured, login, logout, requireFilesAuth, clientIp } from '../lib/filesAuth.js';
import { listRoots, resolveRoot, hostRootAvailable } from '../lib/fileRoots.js';
import {
  listDir, readTextFile, downloadStream, writeTextFile, writeBinaryFile,
  mkdir, removeEntry, renameEntry, moveEntry, dirSize, stat,
} from '../lib/fileManager.js';

function audit(req, action, root, relPath, detail, status = 'ok') {
  try {
    db.prepare(`INSERT INTO file_audit (id, action, root, path, detail, status, ip, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(uuid(), action, root || '', relPath || '', detail ?? null, status, clientIp(req), now());
  } catch { /* auditing must never break the request */ }
}

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { res.status(err.status || 500).json({ error: err.message || 'Erreur inattendue' }); }
};

export function registerFilesRoutes(app) {
  /* ---------- Auth ---------- */
  app.get('/api/files/status', (_req, res) => res.json({ configured: authConfigured(), hostAvailable: hostRootAvailable() }));

  app.post('/api/files/login', wrap(async (req, res) => {
    const ip = clientIp(req);
    const r = await login(req.body?.password, ip);
    if (!r.ok) { audit(req, 'login', '', '', null, 'failed'); return res.status(r.status).json({ error: r.error }); }
    audit(req, 'login', '', '', null, 'ok');
    res.json({ token: r.token, expiresInSec: r.expiresInSec });
  }));

  app.post('/api/files/logout', (req, res) => { logout(req); res.json({ success: true }); });

  /* ---------- Roots ---------- */
  app.get('/api/files/roots', requireFilesAuth, wrap(async (_req, res) => {
    res.json({ roots: await listRoots() });
  }));

  /* ---------- Browse ---------- */
  app.get('/api/files/list', requireFilesAuth, wrap(async (req, res) => {
    const { root: rootId, path: relPath = '/' } = req.query;
    const root = await resolveRoot(String(rootId || ''));
    const entries = await listDir(root.path, String(relPath));
    res.json({ root: root.id, path: relPath, entries });
  }));

  app.get('/api/files/read', requireFilesAuth, wrap(async (req, res) => {
    const { root: rootId, path: relPath } = req.query;
    const root = await resolveRoot(String(rootId || ''));
    const result = await readTextFile(root.path, String(relPath || ''));
    res.json(result);
  }));

  app.get('/api/files/download', requireFilesAuth, wrap(async (req, res) => {
    const { root: rootId, path: relPath } = req.query;
    const root = await resolveRoot(String(rootId || ''));
    const { abs, s } = await stat(root.path, String(relPath || ''));
    if (s.isDirectory()) return res.status(400).json({ error: "Impossible de télécharger un dossier directement." });
    res.setHeader('Content-Disposition', `attachment; filename="${abs.split('/').pop()}"`);
    res.setHeader('Content-Length', String(s.size));
    const stream = downloadStream(root.path, String(relPath || ''));
    stream.on('error', (err) => { if (!res.headersSent) res.status(500).json({ error: err.message }); });
    stream.pipe(res);
    audit(req, 'download', root.id, String(relPath || ''));
  }));

  app.get('/api/files/size', requireFilesAuth, wrap(async (req, res) => {
    const { root: rootId, path: relPath = '/' } = req.query;
    const root = await resolveRoot(String(rootId || ''));
    res.json(dirSize(root.path, String(relPath)));
  }));

  /* ---------- Write ---------- */
  app.post('/api/files/write', requireFilesAuth, wrap(async (req, res) => {
    const { root: rootId, path: relPath, content } = req.body || {};
    const root = await resolveRoot(String(rootId || ''));
    if (typeof content !== 'string') return res.status(400).json({ error: 'Contenu manquant' });
    try {
      await writeTextFile(root.path, relPath, content);
      audit(req, 'write', root.id, relPath, `${content.length} caractères`);
      res.json({ success: true });
    } catch (err) {
      audit(req, 'write', root.id, relPath, err.message, 'failed');
      throw err;
    }
  }));

  /** Binary upload: JSON body with base64 content (consistent with the rest of the app's Import feature). */
  app.post('/api/files/upload', requireFilesAuth, wrap(async (req, res) => {
    const { root: rootId, path: relPath, name, contentBase64 } = req.body || {};
    const root = await resolveRoot(String(rootId || ''));
    if (!name || typeof contentBase64 !== 'string') return res.status(400).json({ error: 'Fichier manquant' });
    const buf = Buffer.from(contentBase64, 'base64');
    const dest = `${String(relPath || '/').replace(/\/$/, '')}/${name}`;
    try {
      await writeBinaryFile(root.path, dest, buf);
      audit(req, 'upload', root.id, dest, `${buf.length} octets`);
      res.json({ success: true, size: buf.length });
    } catch (err) {
      audit(req, 'upload', root.id, dest, err.message, 'failed');
      throw err;
    }
  }));

  app.post('/api/files/mkdir', requireFilesAuth, wrap(async (req, res) => {
    const { root: rootId, path: relPath, name } = req.body || {};
    const root = await resolveRoot(String(rootId || ''));
    if (!name || /[/\\]/.test(name)) return res.status(400).json({ error: 'Nom de dossier invalide' });
    const dest = `${String(relPath || '/').replace(/\/$/, '')}/${name}`;
    try {
      await mkdir(root.path, dest);
      audit(req, 'mkdir', root.id, dest);
      res.json({ success: true });
    } catch (err) {
      audit(req, 'mkdir', root.id, dest, err.message, 'failed');
      throw err;
    }
  }));

  app.post('/api/files/rename', requireFilesAuth, wrap(async (req, res) => {
    const { root: rootId, path: relPath, newName } = req.body || {};
    const root = await resolveRoot(String(rootId || ''));
    try {
      await renameEntry(root.path, relPath, newName);
      audit(req, 'rename', root.id, relPath, `→ ${newName}`);
      res.json({ success: true });
    } catch (err) {
      audit(req, 'rename', root.id, relPath, err.message, 'failed');
      throw err;
    }
  }));

  app.post('/api/files/move', requireFilesAuth, wrap(async (req, res) => {
    const { fromRoot, fromPath, toRoot, toPath, copy } = req.body || {};
    const from = await resolveRoot(String(fromRoot || ''));
    const to = await resolveRoot(String(toRoot || ''));
    try {
      await moveEntry({ fromRoot: from.path, fromPath, toRoot: to.path, toPath, copy: !!copy });
      audit(req, copy ? 'copy' : 'move', from.id, fromPath, `→ ${to.id}:${toPath}`);
      res.json({ success: true });
    } catch (err) {
      audit(req, copy ? 'copy' : 'move', from.id, fromPath, err.message, 'failed');
      throw err;
    }
  }));

  /** Deletion requires the caller to name the exact entry (no wildcards, no recursive-by-pattern) and is always logged. */
  app.post('/api/files/delete', requireFilesAuth, wrap(async (req, res) => {
    const { root: rootId, path: relPath } = req.body || {};
    const root = await resolveRoot(String(rootId || ''));
    if (!relPath || relPath === '/') return res.status(400).json({ error: 'Chemin manquant' });
    try {
      await removeEntry(root.path, relPath);
      audit(req, 'delete', root.id, relPath);
      res.json({ success: true });
    } catch (err) {
      audit(req, 'delete', root.id, relPath, err.message, 'failed');
      throw err;
    }
  }));

  /* ---------- Audit ---------- */
  app.get('/api/files/audit', requireFilesAuth, (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    res.json({ entries: db.prepare('SELECT * FROM file_audit ORDER BY created_at DESC LIMIT ?').all(limit) });
  });
}
