// Server-side cache for Qloo responses (SQLite via node:sqlite). Responses live only here, never in the repo.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Stable cache key: endpoint plus parameters sorted by name, values trimmed and stringified.
 * @param {string} endpoint
 * @param {Record<string, unknown>} params
 */
export function cacheKey(endpoint, params) {
  const pairs = Object.entries(params ?? {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k.trim(), (Array.isArray(v) ? v.map((x) => String(x).trim()).join(',') : String(v)).trim()])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${endpoint}?${new URLSearchParams(pairs).toString()}`;
}

/** Default on-disk location inside DATA_DIR. */
export const cachePath = (dataDir) => path.join(dataDir, 'qloo-cache.sqlite');

/**
 * @param {{ dbPath?: string, now?: () => number }} [opts] dbPath ":memory:" (default) or a file path.
 */
export function createQlooCache({ dbPath = ':memory:', now = Date.now } = {}) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS qloo_cache (
    key TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    body TEXT NOT NULL,
    stored_at INTEGER NOT NULL
  )`);
  const getStmt = db.prepare('SELECT body, stored_at FROM qloo_cache WHERE key = ?');
  const putStmt = db.prepare(
    'INSERT INTO qloo_cache (key, endpoint, body, stored_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET body = excluded.body, stored_at = excluded.stored_at',
  );
  const countStmt = db.prepare('SELECT COUNT(*) AS n FROM qloo_cache');

  return {
    /** @returns {{ data: unknown, storedAt: number } | undefined} */
    get(key) {
      const row = getStmt.get(key);
      return row ? { data: JSON.parse(row.body), storedAt: Number(row.stored_at) } : undefined;
    },
    set(key, endpoint, data) {
      putStmt.run(key, endpoint, JSON.stringify(data), now());
    },
    size() {
      return Number(countStmt.get().n);
    },
    close() {
      db.close();
    },
  };
}
