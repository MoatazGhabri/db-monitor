import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

/**
 * A generic, safe filesystem engine bound to a fixed root directory. Every path the
 * caller supplies is resolved and verified to stay inside that root before any I/O —
 * this is what stands between "browse the server" and a path-traversal vulnerability.
 */
const TEXT_EDIT_LIMIT = 4 * 1024 * 1024;      // files above this open read-only (download instead of edit)
const BINARY_SNIFF_BYTES = 8000;

// Paths that are never writable/deletable through the file manager, even by an authenticated
// admin: editing Docker's own internal metadata outside of a container's merged view can
// corrupt the Docker daemon itself (a different risk than protecting user data).
const DANGEROUS_WRITE_PATTERNS = [
  /\/var\/lib\/docker\/overlay2\/[^/]+\/(diff|work|lower|link)(\/|$)/,
  /\/var\/lib\/docker\/(image|containers|network|buildkit|swarm)(\/|$)/,
  /\/var\/lib\/docker\/overlay2\/l(\/|$)/,
];

export function isDangerousWritePath(absPath) {
  return DANGEROUS_WRITE_PATTERNS.some((re) => re.test(absPath));
}

/** Resolve `relPath` inside `rootPath`, rejecting any attempt to escape it. */
export function safeResolve(rootPath, relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/');
  const resolved = path.resolve(rootPath, `.${rel.startsWith('/') ? rel : `/${rel}`}`);
  const rootNorm = path.resolve(rootPath);
  if (resolved !== rootNorm && !resolved.startsWith(rootNorm + path.sep)) {
    throw Object.assign(new Error('Chemin invalide'), { status: 400 });
  }
  return resolved;
}

function looksBinary(buf) {
  const sample = buf.subarray(0, Math.min(buf.length, BINARY_SNIFF_BYTES));
  if (sample.includes(0)) return true;
  let suspicious = 0;
  for (const b of sample) if (b < 7 || (b > 14 && b < 32 && b !== 27)) suspicious++;
  return sample.length > 0 && suspicious / sample.length > 0.3;
}

export async function stat(rootPath, relPath) {
  const abs = safeResolve(rootPath, relPath);
  const s = await fsp.lstat(abs);
  return { abs, s };
}

export async function listDir(rootPath, relPath) {
  const abs = safeResolve(rootPath, relPath);
  const names = await fsp.readdir(abs, { withFileTypes: true });
  const entries = await Promise.all(names.map(async (d) => {
    const full = path.join(abs, d.name);
    let s;
    try { s = await fsp.lstat(full); } catch { return null; }
    const isSymlink = s.isSymbolicLink();
    let broken = false;
    if (isSymlink) { try { await fsp.stat(full); } catch { broken = true; } }
    return {
      name: d.name,
      isDir: isSymlink ? false : s.isDirectory(),
      isSymlink,
      broken,
      size: s.isDirectory() ? null : s.size,
      mtime: s.mtime.toISOString(),
      mode: (s.mode & 0o777).toString(8).padStart(3, '0'),
    };
  }));
  const list = entries.filter(Boolean);
  list.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  return list;
}

export async function readTextFile(rootPath, relPath) {
  const abs = safeResolve(rootPath, relPath);
  const s = await fsp.stat(abs);
  if (s.isDirectory()) throw Object.assign(new Error('Ceci est un dossier'), { status: 400 });
  if (s.size > TEXT_EDIT_LIMIT) return { editable: false, reason: `Fichier trop volumineux pour l'édition (${(s.size / 1024 / 1024).toFixed(1)} Mo, limite 4 Mo) — téléchargez-le.`, size: s.size };
  const buf = await fsp.readFile(abs);
  if (looksBinary(buf)) return { editable: false, reason: 'Ce fichier semble binaire — utilisez le téléchargement.', size: s.size };
  return { editable: true, content: buf.toString('utf8'), size: s.size };
}

export function downloadStream(rootPath, relPath) {
  const abs = safeResolve(rootPath, relPath);
  return fs.createReadStream(abs);
}

function assertWritable(abs) {
  if (isDangerousWritePath(abs)) throw Object.assign(new Error("Ce chemin fait partie des fichiers internes de Docker et est protégé pour éviter de corrompre le serveur."), { status: 403 });
}

export async function writeTextFile(rootPath, relPath, content) {
  const abs = safeResolve(rootPath, relPath);
  assertWritable(abs);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, content, 'utf8');
}

export async function writeBinaryFile(rootPath, relPath, buffer) {
  const abs = safeResolve(rootPath, relPath);
  assertWritable(abs);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, buffer);
}

export async function mkdir(rootPath, relPath) {
  const abs = safeResolve(rootPath, relPath);
  assertWritable(abs);
  await fsp.mkdir(abs, { recursive: true });
}

export async function removeEntry(rootPath, relPath) {
  const abs = safeResolve(rootPath, relPath);
  if (abs === path.resolve(rootPath)) throw Object.assign(new Error('Impossible de supprimer la racine'), { status: 400 });
  assertWritable(abs);
  await fsp.rm(abs, { recursive: true, force: false });
}

export async function renameEntry(rootPath, relPath, newName) {
  if (!newName || /[/\\]/.test(newName)) throw Object.assign(new Error('Nom invalide'), { status: 400 });
  const abs = safeResolve(rootPath, relPath);
  const dest = path.join(path.dirname(abs), newName);
  assertWritable(abs); assertWritable(dest);
  if (fs.existsSync(dest)) throw Object.assign(new Error('Un élément porte déjà ce nom'), { status: 409 });
  await fsp.rename(abs, dest);
}

/** Move (or copy across roots) an entry from one root/path to another. */
export async function moveEntry({ fromRoot, fromPath, toRoot, toPath, copy }) {
  const src = safeResolve(fromRoot, fromPath);
  const dest = safeResolve(toRoot, toPath);
  assertWritable(dest);
  if (!copy) assertWritable(src);
  if (fs.existsSync(dest)) throw Object.assign(new Error('Un élément porte déjà ce nom à la destination'), { status: 409 });
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  if (copy || fromRoot !== toRoot) {
    await fsp.cp(src, dest, { recursive: true });
    if (!copy) await fsp.rm(src, { recursive: true, force: false });
  } else {
    await fsp.rename(src, dest);
  }
}

export function dirSize(rootPath, relPath, { maxMs = 3000, maxFiles = 60000 } = {}) {
  const abs = safeResolve(rootPath, relPath);
  let total = 0; let files = 0; let truncated = false;
  const start = Date.now();
  const stack = [abs];
  while (stack.length) {
    if (Date.now() - start > maxMs || files > maxFiles) { truncated = true; break; }
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      files++;
      const full = path.join(cur, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { stack.push(full); continue; }
      try { total += fs.statSync(full).size; } catch { /* ignore */ }
    }
  }
  return { bytes: total, truncated };
}
