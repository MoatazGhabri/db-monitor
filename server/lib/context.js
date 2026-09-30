import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initSecrets, encrypt, isEncrypted } from './secrets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');
export const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data');
export const BACKUP_DIR = join(DATA_DIR, 'backups');
export const DB_PATH = join(DATA_DIR, 'dbhub.db');
export const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version;
export const STARTED_AT = Date.now();

// The data directory is excluded from git/docker builds, so create it when missing.
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(BACKUP_DIR, { recursive: true });
export const secretSource = initSecrets(DATA_DIR);

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(readFileSync(join(ROOT, 'schema.sql'), 'utf-8'));

/* ---- migrations for databases created by earlier versions ---- */
function addColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
addColumn('cloud_drives', 'config', `TEXT NOT NULL DEFAULT ''`);
addColumn('backup_schedules', 'last_status', `TEXT`);

// Encrypt any password still stored in clear text by earlier versions.
for (const row of db.prepare('SELECT id, password_encrypted FROM db_connections').all()) {
  if (row.password_encrypted && !isEncrypted(row.password_encrypted)) {
    db.prepare('UPDATE db_connections SET password_encrypted = ? WHERE id = ?').run(encrypt(row.password_encrypted), row.id);
  }
}

export const uuid = () => randomUUID();
export const now = () => new Date().toISOString();

/* ---- settings ---- */
export const DEFAULT_SETTINGS = {
  profile: { name: 'Administrator', email: '', role: 'Admin', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
  notifications: {
    telegram: { enabled: false, botToken: '', chatId: '' },
    slack: { enabled: false, url: '' },
    webhook: { enabled: false, url: '' },
    events: { connectionDown: true, backupFailed: true, backupSucceeded: false, diskFull: true },
  },
  preferences: {
    slowQueryMs: 1000,
    queryTimeoutSec: 30,
    historyRetentionDays: 90,
    defaultPageSize: 25,
    language: 'en-US',
    dateFormat: 'locale',   // 'locale' | 'iso' | 'dmy' | 'mdy'
    timeFormat: '24h',      // '24h' | '12h'
  },
};

const deepMerge = (base, extra) => {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return base;
  const out = { ...base };
  for (const k of Object.keys(extra)) {
    out[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? deepMerge(base[k], extra[k]) : extra[k];
  }
  return out;
};

let cache = null;
export function getSettings() {
  if (cache) return cache;
  const all = structuredClone(DEFAULT_SETTINGS);
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    try { all[row.key] = deepMerge(all[row.key] ?? {}, JSON.parse(row.value)); } catch { /* ignore corrupt row */ }
  }
  cache = all;
  return all;
}

export function saveSettings(patch) {
  const current = getSettings();
  const next = { ...current };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (patch[key] !== undefined) next[key] = deepMerge(current[key], patch[key]);
  }
  const ts = now();
  const up = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  for (const key of Object.keys(DEFAULT_SETTINGS)) up.run(key, JSON.stringify(next[key]), ts);
  cache = next;
  return next;
}
export const prefs = () => getSettings().preferences;
