import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { clientIp, createBudget, planMode, usageCost } from '../server/budget/budget.js';
import { loadConfig } from '../server/config.js';
import { buildApp } from '../server/app.js';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'dnd-budget-'));
test.after(() => rm(tmp, { recursive: true, force: true }));

const PRICES = { inPerMTok: 2, outPerMTok: 10 };
const make = (opts = {}) => createBudget({ dailyCap: 2, totalCap: 30, ipLimit: 20, prices: PRICES, ...opts });

test('usageCost: plain input and output tokens', () => {
  assert.equal(usageCost({ input_tokens: 1_000_000, output_tokens: 100_000 }, PRICES).usd, 3);
});

test('usageCost: cache writes at 1.25x, cache reads at 0.1x of the input price', () => {
  const { usd, tokens } = usageCost(
    { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 },
    PRICES,
  );
  assert.equal(usd, 2.5 + 0.2);
  assert.deepEqual(tokens, { input: 0, output: 0, cache_write: 1_000_000, cache_read: 1_000_000 });
});

test('usageCost: TTL split bills 1-hour writes at 2x, the rest at 1.25x', () => {
  const usd = usageCost({
    cache_creation_input_tokens: 1_500_000,
    cache_creation: { ephemeral_5m_input_tokens: 500_000, ephemeral_1h_input_tokens: 1_000_000 },
  }, PRICES).usd;
  assert.equal(usd, 0.5 * 1.25 * 2 + 1 * 2 * 2);
});

test('usageCost: read multiplier can be overridden per model; junk fields count as zero', () => {
  assert.equal(usageCost({ cache_read_input_tokens: 1_000_000 }, { ...PRICES, cache: { read: 0.05 } }).usd, 0.1);
  assert.equal(usageCost({ input_tokens: -5, output_tokens: 'x' }, PRICES).usd, 0);
  assert.equal(usageCost(undefined, PRICES).usd, 0);
});

test('daily cap blocks live calls until the next UTC day; snapshot follows', () => {
  let t = Date.parse('2026-10-15T23:59:00Z');
  const b = make({ now: () => t });
  assert.deepEqual(b.canSpend(), { ok: true, reason: null });
  assert.deepEqual(b.record({ input_tokens: 600_000, output_tokens: 100_000 }), { usd: 2.2 });
  assert.deepEqual(b.canSpend(), { ok: false, reason: 'daily_cap' });
  assert.deepEqual(b.snapshot(), { day_usd: 2.2, total_usd: 2.2, day_cap: 2, total_cap: 30, month_usd: 2.2, month_cap: null });
  t = Date.parse('2026-10-16T00:00:30Z');
  assert.equal(b.canSpend().ok, true);
  assert.deepEqual(b.snapshot(), { day_usd: 0, total_usd: 2.2, day_cap: 2, total_cap: 30, month_usd: 2.2, month_cap: null });
  b.close();
});

test('total cap blocks live calls for good', () => {
  let t = Date.parse('2026-10-01T12:00:00Z');
  const b = make({ totalCap: 3, now: () => t });
  b.record({ input_tokens: 750_000 }); // 1.5
  t += 86_400_000;
  b.record({ input_tokens: 750_000 }); // 1.5, total 3
  t += 86_400_000;
  assert.deepEqual(b.canSpend(), { ok: false, reason: 'total_cap' });
  b.close();
});

test('usageCost: a prompt over the long-context threshold uses the long rate', () => {
  const prices = { inPerMTok: 0.1, outPerMTok: 0.5, long: { inPerMTok: 0.5, outPerMTok: 2.5, aboveTokens: 100_000 } };
  assert.equal(usageCost({ input_tokens: 100_000, output_tokens: 1_000_000 }, prices).usd, 0.01 + 0.5);
  assert.equal(usageCost({ input_tokens: 50_000, cache_read_input_tokens: 60_000, output_tokens: 1_000_000 }, prices).usd,
    (50_000 + 60_000 * 0.1) * 0.5 / 1e6 + 2.5);
});

test('monthly cap blocks live calls until the next UTC month; snapshot follows', () => {
  let t = Date.parse('2026-10-30T12:00:00Z');
  const b = make({ monthlyCap: 3, now: () => t });
  b.record({ input_tokens: 750_000 }); // 1.5
  t = Date.parse('2026-10-31T12:00:00Z');
  b.record({ input_tokens: 750_000 }); // 1.5, month 3
  assert.deepEqual(b.canSpend(), { ok: false, reason: 'monthly_cap' });
  assert.deepEqual(b.snapshot(), { day_usd: 1.5, total_usd: 3, day_cap: 2, total_cap: 30, month_usd: 3, month_cap: 3 });
  t = Date.parse('2026-11-01T00:00:30Z');
  assert.deepEqual(b.canSpend(), { ok: true, reason: null });
  assert.equal(b.snapshot().month_usd, 0);
  b.close();
});

test('key last day: live calls stop after it (UTC), before any cap', () => {
  let t = Date.parse('2026-11-11T23:59:00Z');
  const b = make({ keyLastDay: '2026-11-11', now: () => t });
  assert.equal(b.canSpend().ok, true);
  t = Date.parse('2026-11-12T00:00:30Z');
  assert.deepEqual(b.canSpend(), { ok: false, reason: 'key_expired' });
  b.close();
});

test('IP limit: 20 per UTC day, other IPs unaffected, resets the next day', () => {
  let t = Date.parse('2026-10-15T10:00:00Z');
  const b = make({ now: () => t });
  for (let i = 1; i <= 20; i++) assert.deepEqual(b.checkIp('203.0.113.7'), { ok: true, count: i });
  assert.deepEqual(b.checkIp('203.0.113.7'), { ok: false, count: 21 });
  assert.deepEqual(b.checkIp('203.0.113.8'), { ok: true, count: 1 });
  t = Date.parse('2026-10-16T00:00:01Z');
  assert.deepEqual(b.checkIp('203.0.113.7'), { ok: true, count: 1 });
  b.close();
});

test('ledger persists in a file and never stores raw IP addresses', () => {
  const dbPath = path.join(tmp, 'nested', 'budget.sqlite');
  const b1 = make({ dbPath });
  b1.record({ input_tokens: 500_000 });
  b1.checkIp('198.51.100.23');
  b1.close();
  const b2 = make({ dbPath });
  assert.equal(b2.snapshot().total_usd, 1);
  assert.deepEqual(b2.checkIp('198.51.100.23'), { ok: true, count: 2 });
  b2.close();
  const db = new DatabaseSync(dbPath);
  const rows = JSON.stringify(db.prepare('SELECT * FROM ip_hits').all());
  db.close();
  assert.doesNotMatch(rows, /198\.51\.100\.23/);
});

test('clientIp trusts X-Forwarded-For only from loopback, and takes the entry nginx appended', () => {
  const req = (remoteAddress, xff) => ({ socket: { remoteAddress }, headers: xff ? { 'x-forwarded-for': xff } : {} });
  assert.equal(clientIp(req('127.0.0.1', '10.0.0.9, 203.0.113.7')), '203.0.113.7');
  assert.equal(clientIp(req('::ffff:127.0.0.1', '203.0.113.7')), '203.0.113.7');
  assert.equal(clientIp(req('127.0.0.1')), '127.0.0.1');
  assert.equal(clientIp(req('198.51.100.4', '203.0.113.7')), '198.51.100.4');
});

test('planMode: live falls back on the IP limit or a spent cap; every request is counted', () => {
  const b = make({ ipLimit: 1 });
  assert.deepEqual(planMode('live', b, { ip: 'a' }), { agent: 'live', fallback: null });
  assert.deepEqual(planMode('live', b, { ip: 'a', hasRecordedRuns: true }), {
    agent: 'recorded', fallback: { step: 'agent mode', reason: 'ip_daily_limit', used: 'recorded agent' },
  });
  assert.equal(planMode('scripted', b, { ip: 'c' }).agent, 'scripted');
  assert.equal(b.checkIp('c').count, 2);
  b.record({ input_tokens: 1_000_000 });
  assert.deepEqual(planMode('live', b, { ip: 'b' }), {
    agent: 'scripted', fallback: { step: 'agent mode', reason: 'daily_cap', used: 'scripted agent' },
  });
  b.close();
});

test('health returns the ledger snapshot and drops a live agent once the cap is spent', async () => {
  const budget = make();
  const config = loadConfig({ DATA_DIR: path.join(tmp, 'var'), VENUES_DIR: path.join(tmp, 'none'), ANTHROPIC_API_KEY: 'k' });
  const app = await buildApp(config, { budget });
  assert.equal((await app.inject('/api/health')).json().agent, 'live');
  budget.record({ input_tokens: 500_000, output_tokens: 20_000 });
  const body = (await app.inject('/api/health')).json();
  assert.deepEqual(body.budget, { day_usd: 1.2, total_usd: 1.2, day_cap: 2, total_cap: 30, month_usd: 1.2, month_cap: null });
  budget.record({ input_tokens: 500_000 });
  assert.equal((await app.inject('/api/health')).json().agent, 'scripted');
  await app.close();
  budget.close();
});
