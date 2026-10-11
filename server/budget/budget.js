// Claude spend ledger and per-IP daily plan limit (SQLite via node:sqlite). Day boundaries are UTC.
// Cost comes from the `usage` block of each SDK response, never from an estimate. When a cap is reached the
// agent stops making live calls and falls back to a recorded run (or the scripted plan when none exists).
// IP addresses are not stored: the ledger keeps a salted hash, and only for the current UTC day.
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Default on-disk location inside DATA_DIR. */
export const budgetPath = (dataDir) => path.join(dataDir, 'budget.sqlite');

// Prompt caching multipliers on the base input price (Anthropic pricing: 5-minute write 1.25x, 1-hour write 2x,
// read 0.1x on most models). The read multiplier differs by model, so all three can be overridden.
export const CACHE_MULTIPLIERS = Object.freeze({ write5m: 1.25, write1h: 2, read: 0.1 });

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const round = (x) => Math.round(x * 1e6) / 1e6;
const tokens = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/**
 * USD cost of one Messages API response.
 * `input_tokens` is the uncached remainder; cache writes and reads are billed on top at their own multipliers.
 * When `cache_creation` splits writes by TTL, each part gets its own rate; any unsplit rest is billed as a 5-minute write.
 * @param {{ input_tokens?: number, output_tokens?: number, cache_creation_input_tokens?: number,
 *   cache_read_input_tokens?: number, cache_creation?: { ephemeral_5m_input_tokens?: number, ephemeral_1h_input_tokens?: number } }} usage
 * @param {{ inPerMTok: number, outPerMTok: number, cache?: Partial<typeof CACHE_MULTIPLIERS> }} prices
 */
export function usageCost(usage, prices) {
  const m = { ...CACHE_MULTIPLIERS, ...(prices.cache ?? {}) };
  const u = usage ?? {};
  const input = tokens(u.input_tokens);
  const output = tokens(u.output_tokens);
  const read = tokens(u.cache_read_input_tokens);
  const w1h = tokens(u.cache_creation?.ephemeral_1h_input_tokens);
  const w5mSplit = tokens(u.cache_creation?.ephemeral_5m_input_tokens);
  const writeTotal = Math.max(tokens(u.cache_creation_input_tokens), w1h + w5mSplit);
  const w5m = writeTotal - w1h;
  const inputEquivalent = input + w5m * m.write5m + w1h * m.write1h + read * m.read;
  return {
    usd: round((inputEquivalent * prices.inPerMTok + output * prices.outPerMTok) / 1e6),
    tokens: { input, output, cache_write: writeTotal, cache_read: read },
  };
}

/**
 * @param {{ dbPath?: string, dailyCap: number, totalCap: number, ipLimit: number,
 *   prices: { inPerMTok: number, outPerMTok: number, cache?: Partial<typeof CACHE_MULTIPLIERS> }, now?: () => number }} opts
 *   dbPath ":memory:" (default) or a file path. `now` fixes the clock in tests.
 */
export function createBudget({ dbPath = ':memory:', dailyCap, totalCap, ipLimit, prices, now = Date.now }) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS spend (
      id INTEGER PRIMARY KEY,
      at INTEGER NOT NULL,
      day TEXT NOT NULL,
      usd REAL NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_write_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS spend_day ON spend (day);
    CREATE TABLE IF NOT EXISTS ip_hits (
      day TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (day, ip_hash)
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('ip_salt', randomBytes(16).toString('hex'));
  const salt = db.prepare('SELECT value FROM meta WHERE key = ?').get('ip_salt').value;

  const insertSpend = db.prepare(
    'INSERT INTO spend (at, day, usd, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const daySum = db.prepare('SELECT COALESCE(SUM(usd), 0) AS usd FROM spend WHERE day = ?');
  const totalSum = db.prepare('SELECT COALESCE(SUM(usd), 0) AS usd FROM spend');
  const hit = db.prepare(
    'INSERT INTO ip_hits (day, ip_hash, count) VALUES (?, ?, 1) ON CONFLICT(day, ip_hash) DO UPDATE SET count = count + 1 RETURNING count',
  );
  const pruneHits = db.prepare('DELETE FROM ip_hits WHERE day < ?');

  const ipHash = (ip) => createHash('sha256').update(`${salt}:${String(ip ?? '').trim().toLowerCase()}`).digest('hex');
  const totals = () => {
    const day = Number(daySum.get(dayOf(now())).usd);
    const total = Number(totalSum.get().usd);
    return { day, total };
  };

  return {
    /** Live Claude calls are allowed only while both the daily and the total cap have room. */
    canSpend() {
      const { day, total } = totals();
      if (total >= totalCap) return { ok: false, reason: 'total_cap' };
      if (day >= dailyCap) return { ok: false, reason: 'daily_cap' };
      return { ok: true, reason: null };
    },
    /** Book one response's usage; returns its cost. */
    record(usage) {
      const at = now();
      const { usd, tokens: t } = usageCost(usage, prices);
      insertSpend.run(at, dayOf(at), usd, t.input, t.output, t.cache_write, t.cache_read);
      return { usd };
    },
    /** Count one plan request from `ip` today; ok while the count is within the daily limit. */
    checkIp(ip) {
      const day = dayOf(now());
      pruneHits.run(day);
      const count = Number(hit.get(day, ipHash(ip)).count);
      return { ok: count <= ipLimit, count };
    },
    snapshot() {
      const { day, total } = totals();
      return { day_usd: round(day), total_usd: round(total), day_cap: dailyCap, total_cap: totalCap };
    },
    close() {
      db.close();
    },
  };
}

const LOOPBACK = new Set(['127.0.0.1', '::ffff:127.0.0.1', '::1']);

/**
 * Client address for the IP limit. X-Forwarded-For is trusted only when the connection itself comes from loopback
 * (nginx on the same host); then the last entry is used, since that is the one nginx appended.
 * @param {{ socket?: { remoteAddress?: string }, headers?: Record<string, string | string[] | undefined> }} req
 */
export function clientIp(req) {
  const remote = req.socket?.remoteAddress ?? '';
  const raw = req.headers?.['x-forwarded-for'];
  if (!LOOPBACK.has(remote) || !raw) return remote;
  const list = (Array.isArray(raw) ? raw.join(',') : raw).split(',').map((s) => s.trim()).filter(Boolean);
  return list.at(-1) ?? remote;
}

/**
 * Agent mode for one plan request. Every request is counted against its IP; a live run additionally needs room in
 * the spend caps. When either check fails the run falls back to a recorded run, or to the scripted plan.
 * @param {'live' | 'recorded' | 'scripted'} baseMode the mode from configuration (see effectiveAgentMode)
 * @param {ReturnType<typeof createBudget>} budget
 * @param {{ ip?: string, hasRecordedRuns?: boolean }} [opts]
 * @returns {{ agent: 'live' | 'recorded' | 'scripted', fallback: null | { step: string, reason: string, used: string } }}
 */
export function planMode(baseMode, budget, { ip, hasRecordedRuns = false } = {}) {
  const ipCheck = ip === undefined ? { ok: true } : budget.checkIp(ip);
  if (baseMode !== 'live') return { agent: baseMode, fallback: null };
  const used = hasRecordedRuns ? 'recorded' : 'scripted';
  const reason = !ipCheck.ok ? 'ip_daily_limit' : budget.canSpend().reason;
  if (!reason) return { agent: 'live', fallback: null };
  return { agent: used, fallback: { step: 'agent mode', reason, used: `${used} agent` } };
}
