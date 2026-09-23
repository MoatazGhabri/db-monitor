import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { encrypt, decrypt } from './secrets.js';

/**
 * Backup destinations ("drives").
 *   local  — a folder on the server (mount a host directory / NAS / USB disk into the container)
 *   webdav — Nextcloud, ownCloud, Synology, any WebDAV server
 *   s3     — Amazon S3 and every S3-compatible service (Backblaze B2, Wasabi, MinIO, Cloudflare R2, DigitalOcean Spaces…)
 */
export const PROVIDERS = {
  local: { label: 'Local folder', secrets: [] },
  webdav: { label: 'WebDAV', secrets: ['password'] },
  s3: { label: 'S3-compatible', secrets: ['secretAccessKey'] },
};

export const readConfig = (row) => {
  if (!row.config) return {};
  try { return JSON.parse(decrypt(row.config)); } catch { return {}; }
};
export const packConfig = (obj) => encrypt(JSON.stringify(obj));

/** Config without secrets, safe for the browser. */
export function publicConfig(row) {
  const cfg = readConfig(row);
  const out = { ...cfg };
  for (const s of PROVIDERS[row.provider]?.secrets ?? []) { out[s] = ''; out[`has_${s}`] = !!cfg[s]; }
  return out;
}

/** Merge an edit into the stored config: blank secrets keep their stored value. */
export function mergeConfig(provider, stored, incoming) {
  const merged = { ...stored, ...incoming };
  for (const s of PROVIDERS[provider]?.secrets ?? []) if (!incoming?.[s]) merged[s] = stored[s] ?? '';
  for (const k of Object.keys(merged)) if (k.startsWith('has_')) delete merged[k];
  return merged;
}

/* =====================================================================
 * AWS Signature V4
 * ===================================================================== */
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** `headers` are lower-case and must include `host` and `x-amz-date`. */
export function signV4({ method, pathname, query = {}, headers, payloadHash, region, service = 's3', accessKeyId, secretAccessKey, encodePath = true }) {
  const amzDate = headers['x-amz-date'];
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = pathname.split('/').map((seg) => (encodePath ? enc(seg) : seg)).join('/') || '/';
  const canonicalQuery = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&');
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((k) => `${k}:${String(headers[k]).trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    signature,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function s3Request(cfg, method, key, body) {
  const endpoint = new URL(cfg.endpoint || `https://s3.${cfg.region || 'us-east-1'}.amazonaws.com`);
  const pathStyle = cfg.pathStyle !== false;
  const host = pathStyle ? endpoint.host : `${cfg.bucket}.${endpoint.host}`;
  const objectPath = `${pathStyle ? `/${cfg.bucket}` : ''}/${key}`.replace(/\/+/g, '/');
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const { authorization } = signV4({
    method, pathname: objectPath, headers, payloadHash,
    region: cfg.region || 'us-east-1', accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey,
  });
  const url = `${endpoint.protocol}//${host}${objectPath.split('/').map(enc).join('/')}`;
  const res = await fetch(url, {
    method,
    headers: { 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, Authorization: authorization },
    body,
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
    const msg = /<Message>([^<]+)<\/Message>/.exec(text)?.[1];
    throw new Error(`S3 ${method} failed (${res.status}${code ? ` ${code}` : ''})${msg ? `: ${msg}` : ''}`);
  }
  return res;
}
const s3Key = (cfg, name) => `${(cfg.prefix || '').replace(/^\/+|\/+$/g, '')}/${name}`.replace(/^\/+/, '');

/* =====================================================================
 * WebDAV
 * ===================================================================== */
function davAuth(cfg) {
  return cfg.username ? { Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password || ''}`).toString('base64')}` } : {};
}
function davUrl(cfg, folder, name) {
  const base = String(cfg.url || '').replace(/\/+$/, '');
  const parts = [folder, name].filter(Boolean).join('/').split('/').filter(Boolean).map(enc);
  return `${base}/${parts.join('/')}`;
}
async function davEnsureFolder(cfg, folder) {
  const segs = String(folder || '').split('/').filter(Boolean);
  let acc = '';
  for (const s of segs) {
    acc = acc ? `${acc}/${s}` : s;
    const r = await fetch(davUrl(cfg, acc, ''), { method: 'MKCOL', headers: davAuth(cfg), signal: AbortSignal.timeout(15000) });
    // 405 = already exists; 409 = parent missing (handled by loop order)
    if (!r.ok && r.status !== 405) throw new Error(`WebDAV MKCOL ${acc} failed (${r.status})`);
  }
}

/* =====================================================================
 * Public API
 * ===================================================================== */
export async function putFile(drive, localPath, remoteName) {
  const cfg = readConfig(drive);
  const folder = drive.folder || '';
  if (drive.provider === 'local') {
    const dir = cfg.path || folder;
    if (!dir) throw new Error('This local drive has no folder configured');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(localPath, path.join(dir, remoteName));
    return path.join(dir, remoteName);
  }
  if (drive.provider === 'webdav') {
    await davEnsureFolder(cfg, folder);
    const url = davUrl(cfg, folder, remoteName);
    const r = await fetch(url, { method: 'PUT', headers: { ...davAuth(cfg), 'Content-Type': 'application/gzip' }, body: fs.readFileSync(localPath), signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!r.ok) throw new Error(`WebDAV upload failed (${r.status})`);
    return url;
  }
  if (drive.provider === 's3') {
    const key = s3Key({ ...cfg, prefix: cfg.prefix ?? folder }, remoteName);
    await s3Request(cfg, 'PUT', key, fs.readFileSync(localPath));
    return `s3://${cfg.bucket}/${key}`;
  }
  throw new Error(`Unsupported drive type "${drive.provider}"`);
}

export async function deleteFile(drive, remoteName) {
  const cfg = readConfig(drive);
  const folder = drive.folder || '';
  if (drive.provider === 'local') {
    fs.rmSync(path.join(cfg.path || folder, remoteName), { force: true });
  } else if (drive.provider === 'webdav') {
    const r = await fetch(davUrl(cfg, folder, remoteName), { method: 'DELETE', headers: davAuth(cfg), signal: AbortSignal.timeout(30000) });
    if (!r.ok && r.status !== 404) throw new Error(`WebDAV delete failed (${r.status})`);
  } else if (drive.provider === 's3') {
    await s3Request(cfg, 'DELETE', s3Key({ ...cfg, prefix: cfg.prefix ?? folder }, remoteName));
  }
}

/** Write + delete a tiny object to prove the credentials and permissions work. */
export async function testDrive(drive) {
  const cfg = readConfig(drive);
  const name = `.dbhub-test-${Date.now()}`;
  const tmp = path.join(fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'dbhub-')), name);
  fs.writeFileSync(tmp, 'dbhub connectivity test');
  try {
    if (drive.provider === 'local') {
      const dir = cfg.path || drive.folder;
      if (!dir) throw new Error('No folder configured');
      await putFile(drive, tmp, name);
      await deleteFile(drive, name);
      let free = null;
      try { const s = fs.statfsSync(dir); free = s.bavail * s.bsize; } catch { /* ignore */ }
      return { ok: true, message: `Folder ${dir} is writable`, free_bytes: free };
    }
    await putFile(drive, tmp, name);
    await deleteFile(drive, name);
    return { ok: true, message: 'Upload and delete succeeded' };
  } catch (err) {
    const cause = err?.cause?.code || err?.cause?.message;
    return { ok: false, message: `${err.message}${cause ? ` (${cause})` : ''}` };
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
}
