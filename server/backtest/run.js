// Back-test run, as BACKTEST.md describes it. Unit = one S2 show at a test room. Pool = resolved headliners of every archive
// show (test and pool rooms, any size) in the 21-day window of the show (its Monday-to-Sunday week, the week before and the
// week after, cut at 30 Sep 2026: Amendment 1), minus the room's S1 headliners; fewer than 10 drops it.
// Output holds only totals and per-room summary numbers: no Qloo response, no artist score, no artist list.
import { S1, S2, periodOf } from './data.js';
import { backtestWindow } from '../rank/pool.js';
import { resolveHeadliner } from './headliner.js';
import {
  CLAIM_SENTENCE, claimRule, clusterBootstrap, clusterBootstrapDiff, hitAt, percentileRank, randomExpectation,
  reciprocalRank, spread, stratifiedBootstrap, stratifiedBootstrapDiff,
} from './metrics.js';
import { BacktestError, poolOrder, rankByPopularity, rankBySignal, resolveVenueEntity, topGenreTags } from './rankers.js';

export const DEFAULT_SEED = 20261011;
export const DEFAULT_REPS = 2000;
export const MIN_POOL = 10;
export const HIT_K = 5;
export const WINDOW_DAYS = 21;
export const DROP_REASONS = Object.freeze(['canceled', 'unresolved', 'repeat_headliner', 'small_pool']);
const ARCHIVE_ROLES = new Set(['test', 'pool']);

const round = (x, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const roundIv = (iv) => ({ mean: round(iv.mean), lo: round(iv.lo), hi: round(iv.hi) });

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Counts every Qloo call and cache hit, without keeping any response. */
function countingClient(client) {
  const stats = { calls: 0, cache_hits: 0 };
  const tally = (r) => {
    stats.calls++;
    if (r?.call?.cache === 'hit') stats.cache_hits++;
    return r;
  };
  return {
    stats,
    search: async (...a) => tally(await client.search(...a)),
    insights: async (...a) => tally(await client.insights(...a)),
  };
}

const showsBy = (shows, pred) => shows.filter((s) => s.canceled === '0' && pred(s));
const windowKey = (w) => `${w.from}..${w.to}`;

/**
 * Counts that need no Qloo call: shows per room and period, canceled rows, and archive titles per pool window of the test period.
 * @param {{ venues: object[], shows: object[] }} data
 */
export function dryRun({ venues, shows }) {
  const rooms = venues.map((v) => {
    const mine = shows.filter((s) => s.venue_id === v.venue_id);
    const count = (p, canceled) => mine.filter((s) => periodOf(s.date) === p && s.canceled === canceled).length;
    return { venue_id: v.venue_id, role: v.role, S1: count('S1', '0'), S2: count('S2', '0'), canceled: { S1: count('S1', '1'), S2: count('S2', '1') } };
  });
  const archive = new Set(venues.filter((v) => ARCHIVE_ROLES.has(v.role)).map((v) => v.venue_id));
  const archiveShows = showsBy(shows, (x) => archive.has(x.venue_id));
  const testRooms = new Set(venues.filter((v) => v.role === 'test').map((v) => v.venue_id));
  const testShows = showsBy(shows, (s) => periodOf(s.date) === 'S2' && testRooms.has(s.venue_id));
  const windows = new Map();
  for (const s of testShows) {
    const w = backtestWindow(s.date);
    const key = windowKey(w);
    if (!windows.has(key)) {
      const titles = new Set(archiveShows.filter((x) => x.date >= w.from && x.date <= w.to).map((x) => x.title.trim().toLowerCase()));
      windows.set(key, { ...w, candidates: titles.size, test_shows: 0 });
    }
    windows.get(key).test_shows++;
  }
  const perWindow = [...windows.values()].sort((a, b) => (a.from < b.from ? -1 : 1));
  const sizes = perWindow.map((w) => w.candidates);
  return {
    kind: 'dry-run',
    protocol: 'BACKTEST.md with Amendments 1-2 (11 Oct 2026)',
    note: 'No Qloo call. Pool candidates are distinct archive show titles in each window before the headliner rule, so the real pools are smaller.',
    periods: { S1, S2 },
    rooms,
    test_shows_before_drops: rooms.filter((r) => r.role === 'test').reduce((t, r) => t + r.S2, 0),
    canceled_test_shows: rooms.filter((r) => r.role === 'test').reduce((t, r) => t + r.canceled.S2, 0),
    window_days: WINDOW_DAYS,
    window_rule: "the show's Monday-to-Sunday week, the week before and the week after, cut at the archive end (2026-09-30)",
    pool_candidates_by_window: perWindow,
    candidates_range: sizes.length ? { min: Math.min(...sizes), max: Math.max(...sizes) } : null,
    windows_cut: perWindow.filter((w) => w.cut).length,
    test_shows_with_cut_window: perWindow.filter((w) => w.cut).reduce((t, w) => t + w.test_shows, 0),
    windows_below_min_pool_before_resolution: perWindow.filter((w) => w.candidates < MIN_POOL).length,
    min_pool: MIN_POOL,
  };
}

/**
 * @param {{
 *   client: { search: Function, insights: Function },
 *   data: { venues: object[], shows: object[] },
 *   restrict: 'filter' | 'take500',
 *   llm?: { rank: Function, model: string, sampling: string } | null, llmSkipReason?: string,
 *   seed?: number, reps?: number, concurrency?: number, log?: (event: object) => void, now?: () => number,
 * }} args
 */
export async function runBacktest({
  client: rawClient, data, restrict, llm = null, llmSkipReason = 'no Claude key', seed = DEFAULT_SEED, reps = DEFAULT_REPS,
  concurrency = 4, log = () => {}, now = Date.now,
}) {
  const client = countingClient(rawClient);
  const { venues, shows } = data;
  const tests = venues.filter((v) => v.role === 'test');
  const placebos = venues.filter((v) => v.role === 'placebo');
  const archive = new Set(venues.filter((v) => ARCHIVE_ROLES.has(v.role)).map((v) => v.venue_id));
  if (!tests.length) throw new BacktestError('no_test_rooms', 'venues.csv has no test room');

  // 1. Headliner rule for every title that can matter: archive shows (pools, signals, positives) and placebo S1 shows.
  const needed = showsBy(shows, (s) => archive.has(s.venue_id) || (periodOf(s.date) === 'S1' && placebos.some((p) => p.venue_id === s.venue_id)));
  const titles = [...new Set(needed.map((s) => s.title))];
  const resolution = { titles: titles.length, title: 0, split: 0, unresolved: 0 };
  const resolved = new Map();
  await mapLimit(titles, concurrency, async (title) => {
    const r = await resolveHeadliner(client, title);
    if (r.status === 'error') throw new BacktestError(r.error.code ?? 'qloo_error', `headliner search failed: ${r.error.message ?? r.error.code}`);
    resolution[r.status === 'resolved' ? r.step : 'unresolved']++;
    if (r.status === 'resolved') resolved.set(title, r.entity);
  });
  log({ event: 'resolved', ...resolution, qloo: { ...client.stats } });

  const s1Headliners = (venueId) => {
    const out = new Map();
    for (const s of showsBy(shows, (x) => x.venue_id === venueId && periodOf(x.date) === 'S1')) {
      const e = resolved.get(s.title);
      if (e && !out.has(e.entity_id)) out.set(e.entity_id, e);
    }
    return [...out.values()];
  };
  const archiveShows = showsBy(shows, (x) => archive.has(x.venue_id));
  const windowPools = new Map(); // window key -> Map(entity_id -> entity), built once per window
  const windowPool = (w) => {
    const key = windowKey(w);
    if (!windowPools.has(key)) {
      const pool = new Map();
      for (const s of archiveShows) {
        if (s.date < w.from || s.date > w.to) continue;
        const e = resolved.get(s.title);
        if (e && !pool.has(e.entity_id)) pool.set(e.entity_id, e);
      }
      windowPools.set(key, pool);
    }
    return windowPools.get(key);
  };

  // 2. Units and drops, per test room.
  const placeboSignals = placebos.map((p) => ({ venue_id: p.venue_id, ids: s1Headliners(p.venue_id).map((e) => e.entity_id) }));
  const rooms = [];
  for (const v of tests) {
    const signal = s1Headliners(v.venue_id);
    const signalIds = new Set(signal.map((e) => e.entity_id));
    const drops = Object.fromEntries(DROP_REASONS.map((r) => [r, 0]));
    drops.canceled = shows.filter((s) => s.venue_id === v.venue_id && periodOf(s.date) === 'S2' && s.canceled === '1').length;
    const units = [];
    const cut = { reached_pool: 0, small_pool: 0, units: 0 }; // shows whose window was cut at the archive end
    for (const s of showsBy(shows, (x) => x.venue_id === v.venue_id && periodOf(x.date) === 'S2')) {
      const positive = resolved.get(s.title);
      if (!positive) {
        drops.unresolved++;
        continue;
      }
      if (signalIds.has(positive.entity_id)) {
        drops.repeat_headliner++;
        continue;
      }
      const win = backtestWindow(s.date);
      const pool = poolOrder([...windowPool(win).values()].filter((e) => !signalIds.has(e.entity_id)));
      if (win.cut) cut.reached_pool++;
      if (pool.length < MIN_POOL) {
        drops.small_pool++;
        if (win.cut) cut.small_pool++;
        continue;
      }
      if (win.cut) cut.units++;
      units.push({ window: windowKey(win), positive: positive.entity_id, pool });
    }
    rooms.push({ venue: v, signal, drops, units, cut });
    log({ event: 'units', venue_id: v.venue_id, signal: signal.length, units: units.length, drops, cut_windows: cut });
  }

  // 3. Rank. Shows of a room in the same week share one window and one pool, so each ranking is computed once per (room, window).
  const llmState = { status: llm ? 'run' : 'not run', reason: llm ? null : llmSkipReason, usd: 0, incomplete_answers: 0 };
  for (const room of rooms) {
    const signalIds = room.signal.map((e) => e.entity_id);
    room.tags = signalIds.length ? await topGenreTags(client, room.signal) : [];
    room.venueEntity = await resolveVenueEntity(client, room.venue.name);
    const byWindow = new Map();
    for (const u of room.units) if (!byWindow.has(u.window)) byWindow.set(u.window, u.pool);
    room.rankings = new Map();
    await mapLimit([...byWindow], concurrency, async ([win, pool]) => {
      const rk = {};
      const where = `${room.venue.venue_id} ${win}`;
      rk.Q = signalIds.length ? await rankBySignal(client, { pool, entityIds: signalIds, restrict, what: `Q ${where}` }) : null;
      rk.P = rankByPopularity(pool);
      rk.T = room.tags.length ? await rankBySignal(client, { pool, tagIds: room.tags, restrict, what: `T ${where}` }) : null;
      rk.Qvenue = room.venueEntity && signalIds.length
        ? await rankBySignal(client, { pool, entityIds: [...signalIds, room.venueEntity], restrict, what: `Q+venue ${where}` })
        : null;
      for (const p of placeboSignals) {
        rk[`placebo:${p.venue_id}`] = p.ids.length ? await rankBySignal(client, { pool, entityIds: p.ids, restrict, what: `placebo ${where}` }) : null;
      }
      room.rankings.set(win, rk);
    });
    if (llm && llmState.status === 'run') {
      for (const [win, pool] of byWindow) {
        try {
          const r = await llm.rank({ signalNames: room.signal.map((e) => e.name), poolNames: pool.map((e) => e.name) });
          room.rankings.get(win).L = r.order.map((i) => pool[i].entity_id);
          llmState.usd += r.usd ?? 0;
          if (!r.complete) llmState.incomplete_answers++;
        } catch (err) {
          if (!(err instanceof BacktestError)) throw err;
          // A partial L run would be a biased sample, so L is dropped entirely.
          llmState.status = 'not run';
          llmState.reason = `${err.message}; stopped part-way, so no L numbers are reported`;
          break;
        }
      }
    }
    log({ event: 'ranked', venue_id: room.venue.venue_id, windows: byWindow.size, tags: room.tags.length, venue_entity: Boolean(room.venueEntity), qloo: { ...client.stats } });
  }

  // 4. Metrics per show, grouped by room.
  const rankerNames = ['Q', 'P', 'T', 'L', 'Qvenue', ...placeboSignals.map((p) => `placebo:${p.venue_id}`)];
  const values = {};
  const missing = new Set();
  for (const name of rankerNames) values[name] = { rr: {}, hit: {}, pct: {} };
  values.R = { rr: {}, hit: {}, pct: {} };
  for (const room of rooms) {
    const id = room.venue.venue_id;
    if (!room.units.length) continue;
    for (const u of room.units) {
      const rk = room.rankings.get(u.window);
      for (const name of rankerNames) {
        const order = name === 'L' && llmState.status !== 'run' ? null : rk[name];
        if (!order) {
          missing.add(name);
          continue;
        }
        for (const [m, f] of [['rr', reciprocalRank], ['hit', (o, p) => hitAt(o, p, HIT_K)], ['pct', percentileRank]]) (values[name][m][id] ??= []).push(f(order, u.positive));
      }
      const r = randomExpectation(u.pool.length, HIT_K);
      (values.R.rr[id] ??= []).push(r.rr);
      (values.R.hit[id] ??= []).push(r.hit);
      (values.R.pct[id] ??= []).push(r.percentile);
    }
  }

  const testedRooms = rooms.filter((r) => r.units.length);
  const N = testedRooms.length;
  const n = testedRooms.reduce((t, r) => t + r.units.length, 0);
  const byRooms = N >= 8;
  const iv = byRooms ? clusterBootstrap : stratifiedBootstrap;
  const ivDiff = byRooms ? clusterBootstrapDiff : stratifiedBootstrapDiff;
  const opts = { reps, seed };
  const complete = (name) => !missing.has(name) && Object.keys(values[name].rr).length === N && N > 0;

  const rankers = {};
  const notRun = {
    L: llmState.reason,
    T: 'a test room had no genre tags for its S1 headliners',
    Q: 'a test room had no resolved S1 headliners',
    Qvenue: "a test room's own place entity did not resolve",
  };
  for (const name of [...rankerNames, 'R']) {
    if (!complete(name)) {
      rankers[name] = { status: 'not run', reason: notRun[name] ?? (name.startsWith('placebo:') ? 'the placebo room had no resolved S1 headliners' : 'missing') };
      continue;
    }
    const v = values[name];
    rankers[name] = {
      status: 'run',
      mrr: roundIv(iv(v.rr, opts)),
      hit_at_5: roundIv(iv(v.hit, opts)),
      percentile_rank: roundIv(iv(v.pct, opts)),
      rr_median: round(spread(Object.values(v.rr).flat()).median),
      rr_iqr: spread(Object.values(v.rr).flat()).iqr.map((x) => round(x)),
    };
  }
  if (rankers.L.status === 'run') {
    Object.assign(rankers.L, { model: llm.model, sampling: llm.sampling, usd: round(llmState.usd, 4), incomplete_answers: llmState.incomplete_answers });
    // Amendment 2: without temperature 0 the L numbers are one draw of the model, not a deterministic answer.
    if (llm.draw) rankers.L.draw = llm.draw;
  }
  if (rankers.R.status === 'run') rankers.R.note = 'analytic expectation for each pool size';
  if (rankers.Qvenue.status === 'run') rankers.Qvenue.note = "Q with the room's own place entity added: a leakage size, never the headline number";

  const differences = {};
  const diff = (a, b, label = `${a}-${b}`) => {
    differences[label] = complete(a) && complete(b) ? roundIv(ivDiff(values[a].rr, values[b].rr, opts)) : { status: 'not run' };
  };
  diff('Q', 'P');
  diff('Q', 'T');
  diff('Q', 'L');
  for (const p of placeboSignals) diff('Q', `placebo:${p.venue_id}`, `Q-placebo:${p.venue_id}`);
  diff('Qvenue', 'Q', 'Qvenue-Q');

  const qMinusPlacebo = Object.fromEntries(placeboSignals.map((p) => [p.venue_id, differences[`Q-placebo:${p.venue_id}`]]));
  const claim = claimRule({ rooms: N, shows: n, qMinusP: differences['Q-P'], qMinusPlacebo });
  const sumCut = (k) => rooms.reduce((t, x) => t + x.cut[k], 0);
  const dropped = Object.fromEntries(DROP_REASONS.map((r) => [r, rooms.reduce((t, x) => t + x.drops[r], 0)]));

  return {
    status: claim.status,
    label: `${claim.status} (N = ${N} rooms, n = ${n} shows)`,
    protocol: 'BACKTEST.md (frozen 11 Oct 2026) with Amendments 1-2',
    split: 'test',
    run_at: new Date(now()).toISOString(),
    rooms: N,
    shows: n,
    periods: { S1, S2 },
    pool_restriction: restrict === 'filter' ? 'filter.results.entities' : 'take=500, pool members kept',
    pool_window: {
      days: WINDOW_DAYS,
      rule: "the show's Monday-to-Sunday week, the week before and the week after, cut at the archive end (2026-09-30)",
      cut_shows: sumCut('reached_pool'),
      cut_shows_dropped_small_pool: sumCut('small_pool'),
      cut_shows_scored: sumCut('units'),
    },
    interval: {
      method: byRooms ? 'bootstrap over rooms' : 'bootstrap of shows within each room, room counts kept, rooms weighted equally',
      level: 0.95,
      reps,
      seed,
      caveat: byRooms ? null : 'Shows in the same room are not independent, so these intervals are too narrow.',
    },
    metric_note: 'MRR: reciprocal rank of the actual headliner, averaged per room, then across rooms with equal weight. Percentile rank: 0 = top, 1 = bottom.',
    rankers,
    differences,
    claim: { sentence: CLAIM_SENTENCE, used: claim.used, checks: claim.checks },
    dropped,
    resolution,
    per_room: rooms.map((r) => {
      const sizes = r.units.map((u) => u.pool.length);
      const ps = sizes.length ? spread(sizes) : null;
      const mrrOf = (name) => {
        const rr = values[name]?.rr[r.venue.venue_id];
        return rankers[name]?.status === 'run' && rr?.length ? round(rr.reduce((t, x) => t + x, 0) / rr.length) : null;
      };
      return {
        venue_id: r.venue.venue_id,
        name: r.venue.name,
        capacity: r.venue.capacity ? Number(r.venue.capacity) : null,
        signal_size: r.signal.length,
        shows: r.units.length,
        dropped: r.drops,
        pool_size: ps ? { median: ps.median, min: Math.min(...sizes), max: Math.max(...sizes) } : null,
        mrr: Object.fromEntries([...rankerNames, 'R'].map((name) => [name, mrrOf(name)])),
      };
    }),
    qloo: { ...client.stats },
  };
}
