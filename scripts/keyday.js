#!/usr/bin/env node
// Key-day go/no-go test: 30 numbered probes against the Qloo hackathon API, run once when the key arrives.
// Usage: node scripts/keyday.js <dev-venue.json> [<dev-venue-2.json> ...] [--placebo <other-city-venue.json>]
// Venue files use the data/venues format: { id, name, city, geo?: {lat, lon}, shows: [{date, headliner}],
//   keyday?: { known_artists?: [2 names], local_artists?: [2 names], genre_query?: string } }.
// Every response is cached in DATA_DIR. The only output is DATA_DIR/keyday-summary.json, which holds
// counts and pass/fail flags, never names, ids or other Qloo response content.
// Exit codes: 0 GO, 1 usage/config error, 2 no QLOO_API_KEY, 3 NO-GO.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from '../server/config.js';
import { cachePath, createQlooCache } from '../server/qloo/cache.js';
import { createQlooClient, entitiesOf, tagsOf } from '../server/qloo/client.js';

export const SIGNAL_WINDOW = ['2026-01-01', '2026-06-30'];
export const TEST_WINDOW = ['2026-07-01', '2026-12-31'];
const ARTIST = 'urn:entity:artist';
const POOL_PROBE_SIZE = 50;

const inWindow = (d, [from, to]) => d >= from && d <= to;
const unique = (xs) => [...new Set(xs)];
const ids = (env, n = Infinity) => entitiesOf(env?.data).slice(0, n).map((e) => e.entity_id);
const changedIn = (a, b, n) => {
  const top = new Set(ids(a, n));
  return ids(b, n).filter((id) => !top.has(id)).length;
};
const point = (geo) => (geo ? `POINT(${geo.lon} ${geo.lat})` : undefined);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function headliners(venue, window) {
  return unique((venue.shows ?? []).filter((s) => s.headliner && inWindow(s.date, window)).map((s) => s.headliner.trim()));
}

/** Reciprocal rank of the first positive in a ranked id list (0 if none). */
function firstHit(ranked, positives) {
  const i = ranked.findIndex((id) => positives.has(id));
  return { hit10: i >= 0 && i < 10 ? 1 : 0, rr: i >= 0 ? Number((1 / (i + 1)).toFixed(4)) : 0 };
}

/**
 * Run the probes. Returns the summary object (numbers and flags only).
 * @param {{ client: ReturnType<typeof createQlooClient>, venues: object[], placebo?: object }} args
 */
export async function runKeyday({ client, venues, placebo }) {
  const calls = [];
  const record = (n, label, env, extra = {}) => {
    const row = {
      n, label,
      ok: env?.status === 'ok',
      status: env?.status ?? 'skipped',
      sent: env ? env.call?.sent !== false : false,
      cache: env?.call?.cache ?? null,
      ms: env?.call?.ms ?? null,
      count: env ? entitiesOf(env.data).length : null,
      ...extra,
    };
    if (env?.error) row.error_code = env.error.code;
    calls.push(row);
    return env;
  };
  const skip = (n, label, reason) => calls.push({ n, label, ok: false, status: 'skipped', sent: false, reason });

  // Name resolution (setup, cached; not part of the 30 numbered probes).
  const setup = { search_calls: 0, resolved: 0, unresolved: 0 };
  const resolved = new Map();
  async function resolve(name) {
    if (resolved.has(name)) return resolved.get(name);
    setup.search_calls++;
    const env = await client.search(name, { types: [ARTIST], take: 3 });
    const exact = entitiesOf(env.data).find((e) => String(e.name).toLowerCase() === name.toLowerCase());
    const id = (exact ?? entitiesOf(env.data)[0])?.entity_id;
    setup[id ? 'resolved' : 'unresolved']++;
    resolved.set(name, id);
    return id;
  }
  const resolveAll = async (names) => unique((await Promise.all(names.map(resolve))).filter(Boolean));

  const [a] = venues;
  const signalNames = headliners(a, SIGNAL_WINDOW);
  const kd = a.keyday ?? {};
  const known = kd.known_artists ?? signalNames.slice(0, 2);
  const local = kd.local_artists ?? signalNames.slice(-2);

  // 1-4: search probes
  for (const [i, name] of [...known.slice(0, 2), ...local.slice(0, 2)].entries()) {
    const label = i < 2 ? 'search well-known act' : 'search small local act';
    if (!name) { skip(i + 1, label, 'no name in venue file'); continue; }
    const env = await client.search(name, { types: [ARTIST], take: 5 });
    const exact = entitiesOf(env.data).filter((e) => String(e.name).toLowerCase() === name.toLowerCase()).length;
    record(i + 1, label, env, { exact_matches: exact, ambiguous: exact > 1 });
  }
  // 5: the venue itself
  record(5, 'search venue as place', await client.search(a.name, { types: ['urn:entity:place'], take: 5 }));
  // 6: genre tags
  if (kd.genre_query) {
    const env = await client.tags(kd.genre_query, { take: 10 });
    record(6, 'tags genre search', env, { count: tagsOf(env.data).length });
  }  else skip(6, 'tags genre search', 'no keyday.genre_query in venue file');

  const signal = await resolveAll(signalNames);
  const base = { 'filter.type': ARTIST, 'signal.interests.entities': signal, take: 30 };
  const poolNames = unique(venues.flatMap((v) => headliners(v, TEST_WINDOW))).filter((n) => !signalNames.includes(n));
  const pool = (await resolveAll(poolNames)).filter((id) => !signal.includes(id));
  const neutral = await resolveAll(unique(venues.flatMap((v) => headliners(v, SIGNAL_WINDOW))));

  // 7: base insights
  const c7 = record(7, 'insights artist, entity signal, take 30', signal.length ? await client.insights(base) : undefined, { signals: signal.length });
  // 8: explainability
  const c8 = await client.insights({ ...base, 'feature.explainability': true });
  const explained = entitiesOf(c8.data).filter((e) => e?.query?.explainability ?? e?.explainability).length;
  record(8, 'insights + feature.explainability', c8, { explained, warnings: Array.isArray(c8.data?.warnings) ? c8.data.warnings.length : null });
  // 9-10: signal.location with / without
  if (a.geo) {
    const c9 = record(9, 'insights + signal.location', await client.insights({ ...base, 'signal.location': point(a.geo) }));
    const c10 = record(10, 'insights without signal.location', await client.insights(base));
    calls.at(-1).changed_top30 = changedIn(c10, c9, 30);
  } else {
    skip(9, 'insights + signal.location', 'no geo in venue file');
    skip(10, 'insights without signal.location', 'no geo in venue file');
  }
  // 11: closed pool
  const probePool = pool.slice(0, POOL_PROBE_SIZE);
  const c11 = record(11, 'insights + filter.results.entities (pool)', probePool.length ? await client.insights({ ...base, 'filter.results.entities': probePool, take: probePool.length }) : undefined, { pool_size: probePool.length });
  if (c11) calls.at(-1).returned_share = Number((entitiesOf(c11.data).length / probePool.length).toFixed(3));
  // 12: qloo_rank
  skip(12, 'qloo_rank on pool', 'qloo_rank is an MCP harness tool; run through `qloo mcp`, not this HTTP adapter');
  // 13: neutral signal on the pool
  record(13, 'pool with neutral city signal', probePool.length ? await client.insights({ 'filter.type': ARTIST, 'signal.interests.entities': neutral, 'filter.results.entities': probePool, take: probePool.length }) : undefined, { signals: neutral.length });
  // 14-15: popularity ceiling
  for (const [n, max] of [[14, 0.9], [15, 0.7]]) {
    const env = record(n, `insights + filter.popularity.max ${max}`, await client.insights({ ...base, 'filter.popularity.max': max }));
    calls.at(-1).changed_top30 = changedIn(c7, env, 30);
  }
  // 16-18: single-signal ablation
  const ablation = [];
  for (const [i, drop] of signal.slice(0, 3).entries()) {
    const rest = signal.filter((id) => id !== drop);
    const env = rest.length ? await client.insights({ ...base, 'signal.interests.entities': rest }) : undefined;
    record(16 + i, 'ablation: drop one past show', env);
    if (env) ablation.push((calls.at(-1).changed_top10 = changedIn(c7, env, 10)));
  }
  for (let n = 16 + signal.slice(0, 3).length; n <= 18; n++) skip(n, 'ablation: drop one past show', 'fewer than 3 signal acts');
  // 19: trends bias
  const c19 = record(19, 'insights + bias.trends medium', await client.insights({ ...base, 'bias.trends': 'medium' }));
  calls.at(-1).changed_top30 = changedIn(c7, c19, 30);
  // 20: qloo_trends
  skip(20, 'qloo_trends (5 entities)', 'qloo_trends is an MCP harness tool; run through `qloo mcp`, not this HTTP adapter');
  // 21: partner places within 600 m
  if (a.geo) record(21, 'place within 600 m', await client.insights({ 'filter.type': 'urn:entity:place', 'signal.interests.entities': signal, 'filter.location': point(a.geo), 'filter.location.radius': 600, take: 20 }));
  else skip(21, 'place within 600 m', 'no geo in venue file');
  // 22-23: brand lift (venue vs neutral)
  const c22 = record(22, 'brand, venue signal', await client.insights({ 'filter.type': 'urn:entity:brand', 'signal.interests.entities': signal, take: 30 }));
  const c23 = record(23, 'brand, neutral city signal', await client.insights({ 'filter.type': 'urn:entity:brand', 'signal.interests.entities': neutral, take: 30 }));
  calls.at(-1).changed_top10 = changedIn(c23, c22, 10);
  // 24: wrong-type parameter (must be stopped by the validator)
  const c24 = await client.insights({ ...base, 'filter.location.radius': 600 });
  calls.push({ n: 24, label: 'wrong-type parameter blocked before sending', ok: c24.status === 'error' && c24.call.sent === false, status: c24.status, sent: c24.call.sent !== false, error_code: c24.error?.code });
  // 25: cache
  record(25, 'repeat of 7 (cache)', await client.insights(base));

  // 26-30: mini back-test (Qloo vs popularity per dev venue, then one placebo)
  const backtest = [];
  async function venueRun(v, signalVenue) {
    const vSignalNames = headliners(signalVenue, SIGNAL_WINDOW);
    const vSignal = await resolveAll(vSignalNames);
    const vPool = (await resolveAll(poolNames.filter((nm) => !headliners(v, SIGNAL_WINDOW).includes(nm)))).filter((id) => !vSignal.includes(id));
    const positives = new Set((await resolveAll(headliners(v, TEST_WINDOW))).filter((id) => vPool.includes(id)));
    return { vSignal, vPool, positives };
  }
  let n = 26;
  for (const v of venues.slice(0, 2)) {
    const { vSignal, vPool, positives } = await venueRun(v, v);
    if (!vSignal.length || !vPool.length) { skip(n++, 'mini back-test: taste signal', 'empty signal or pool'); skip(n++, 'mini back-test: popularity', 'empty signal or pool'); continue; }
    const q = await client.insights({ 'filter.type': ARTIST, 'signal.interests.entities': vSignal, 'filter.results.entities': vPool, take: Math.min(vPool.length, 500) });
    record(n++, 'mini back-test: taste signal', q, { pool_size: vPool.length, positives: positives.size, ...firstHit(ids(q), positives) });
    const p = await client.insights({ 'filter.type': ARTIST, 'filter.results.entities': vPool, take: Math.min(vPool.length, 500) });
    const byPop = entitiesOf(p.data).slice().sort((x, y) => (y.popularity ?? 0) - (x.popularity ?? 0)).map((e) => e.entity_id);
    record(n++, 'mini back-test: popularity', p, { pool_size: vPool.length, positives: positives.size, ...firstHit(byPop, positives) });
    backtest.push(positives.size);
  }
  while (n <= 29) skip(n++, 'mini back-test', 'needs a second dev venue');
  if (placebo) {
    const { vSignal, vPool, positives } = await venueRun(a, placebo);
    const q = vSignal.length && vPool.length ? await client.insights({ 'filter.type': ARTIST, 'signal.interests.entities': vSignal, 'filter.results.entities': vPool, take: Math.min(vPool.length, 500) }) : undefined;
    record(30, 'mini back-test: placebo signal', q, { pool_size: vPool.length, positives: positives.size, ...(q ? firstHit(ids(q), positives) : {}) });
  } else skip(30, 'mini back-test: placebo signal', 'no --placebo venue');

  const by = Object.fromEntries(calls.map((c) => [c.n, c]));
  const meanAblation = mean(ablation);
  const go = {
    base_insights: by[7].ok,
    closed_pool: (by[11].ok && by[11].count > 0) || by[12].ok,
    evidence: (by[8].ok && by[8].explained > 0) || (meanAblation !== null && meanAblation >= 1),
  };
  return {
    generated_at: new Date().toISOString(),
    venues: venues.length,
    placebo: Boolean(placebo),
    setup,
    calls: calls.sort((x, y) => x.n - y.n),
    mean_ablation_change_top10: meanAblation,
    go: { decision: go.base_insights && go.closed_pool && go.evidence ? 'GO' : 'NO-GO', ...go },
  };
}

function parseArgs(argv) {
  const venues = [];
  let placebo;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--placebo') placebo = argv[++i];
    else venues.push(argv[i]);
  }
  return { venues, placebo };
}

async function main(argv, env) {
  if (!env.QLOO_API_KEY || !env.QLOO_API_KEY.trim()) {
    console.log('no key: set QLOO_API_KEY to run the key-day test');
    return 2;
  }
  let config;
  try {
    config = loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) { console.error(err.message); return 1; }
    throw err;
  }
  const args = parseArgs(argv);
  if (!args.venues.length) {
    console.error('usage: node scripts/keyday.js <dev-venue.json> [<dev-venue-2.json> ...] [--placebo <venue.json>]');
    return 1;
  }
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const cache = createQlooCache({ dbPath: cachePath(config.dataDir) });
  const client = createQlooClient({ apiKey: config.qloo.apiKey, baseUrl: config.qloo.baseUrl, mode: 'live', cache });
  const summary = await runKeyday({ client, venues: args.venues.map(read), placebo: args.placebo ? read(args.placebo) : undefined });
  cache.close();
  mkdirSync(config.dataDir, { recursive: true });
  const out = path.join(config.dataDir, 'keyday-summary.json');
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  const sent = summary.calls.filter((c) => c.sent).length;
  console.log(`${summary.go.decision}: ${summary.calls.filter((c) => c.ok).length}/30 probes ok, ${sent} sent, ${summary.setup.search_calls} name lookups. Summary: ${out}`);
  return summary.go.decision === 'GO' ? 0 : 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
