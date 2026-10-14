// Study 2 run, as BACKTEST-2.md (registered 14 Oct 2026) and its Amendments 1-13 describe it (no Amendment 13 variant is switched on yet). Study 1 (run.js) is not used here.
// Unit = one S2 show at a test room. Pool = resolved headliners of every counted show at the eligible venues of the same metro
// in the show's 21-day window (cut at 30 Sep 2026), minus the room's S1 headliners; fewer than 10 drops it.
// Rooms sit in clusters (same owner or booking company): MRR averages rooms within a cluster, then clusters with equal weight,
// and the bootstrap draws clusters. Each test room has one placebo room from another metro and cluster, fixed before any Qloo call.
// Output holds only totals and per-room summary numbers: no Qloo response, no artist score, no artist list.
import { S1, S2, periodOf } from './data.js';
import { ARTIST, backtestWindow, normalizeName } from '../rank/pool.js';
import { entitiesOf } from '../qloo/client.js';
import { splitAtSeparator } from './headliner.js';
import {
  CLAIM_SENTENCE, claimRule, clusterBootstrap2, clusterBootstrap2Diff, clusterMeans, hitAt, nestedStratifiedBootstrap,
  nestedStratifiedBootstrapDiff, percentileRank, randomExpectation, reciprocalRank, spread,
} from './metrics.js';
import { BacktestError, poolOrder, rankByPopularity, rankBySignal, resolveVenueEntity, topGenreTags } from './rankers.js';
import {
  MIN_COVERAGE, PLACEBO_SEED, SIZE_SPLIT, checkSample, coverageProblems, nonMusicOutside, nonMusicWords, parsePerformers,
  performerCandidate, placeboChains, roomCoverage, sizeGroup, weekdayGroup,
} from './study2-data.js';

export const PROTOCOL2 = 'BACKTEST-2.md (registered 14 Oct 2026) with Amendments 1-13 (no Amendment 13 variant switched on)';
export const DEFAULT_SEED2 = 1;
export const DEFAULT_REPS2 = 2000;
export const MIN_POOL = 10;
export const HIT_K = 5;
export const WINDOW_DAYS = 21;
export const DROP_REASONS2 = Object.freeze([
  'canceled', 'off-site', 'untitled', 'unresolved', 'non-music', 'no_signal', 'repeat_headliner', 'duplicate', 'small_pool',
]);
const SEARCH_TAKE = 5;
const FIRST_WINDOW_DAY = backtestWindow(S2.from).from;
const WINDOW_RULE = "the show's Monday-to-Sunday week, the week before and the week after, cut at the archive end (2026-09-30)";

const round = (x, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const roundIv = (iv) => ({ mean: round(iv.mean), lo: round(iv.lo), hi: round(iv.hi) });
const windowKey = (w) => `${w.from}..${w.to}`;
const median = (xs) => (xs.length ? spread(xs).median : null);

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

/** What a row is before any Qloo call: a compile or run drop, or "live" (it goes to the headliner rule). */
export function rowState(s) {
  if (s.canceled === '1') return 'canceled';
  if (s.drop_reason === 'off-site') return 'off-site';
  if (normalizeName(s.title) === '') return 'untitled';
  return 'live';
}

/**
 * Headliner rule with Amendment 2: the performer candidate first (when the source has a structured performer field),
 * then the whole title, then the title before its first separator. First exact normalized match on the top /search result wins.
 * @param {(query: string) => Promise<object | null | {error: object}>} topOf memoized top artist result of /search
 */
export async function resolveHeadliner2(topOf, { title, candidate }) {
  const queries = [];
  if (candidate) queries.push(['performer', candidate]);
  queries.push(['title', String(title ?? '').trim()]);
  const head = splitAtSeparator(title);
  if (head) queries.push(['split', head]);
  for (const [step, query] of queries) {
    if (!normalizeName(query)) continue;
    const top = await topOf(query);
    if (top?.error) return { status: 'error', error: top.error };
    if (top?.entity_id && normalizeName(top.name) === normalizeName(query)) {
      return {
        status: 'resolved',
        step,
        query,
        entity: { entity_id: top.entity_id, name: top.name, popularity: typeof top.popularity === 'number' ? top.popularity : null, tags: Array.isArray(top.tags) ? top.tags : [] },
      };
    }
  }
  return { status: 'unresolved' };
}

/**
 * P2 (Amendment 5): pool ordered by the distance between an act's popularity and the target (the median popularity of the room's
 * resolved S1 headliners), smallest first; ties go to the more popular act, then pool order. Acts with no popularity go last in
 * pool order. Distances and popularity are compared at 1e-9, so mirror-image distances tie as written.
 * @returns {{ order: string[], scored: number, tied_distance: number, tied_both: number } | null} null when there is no target
 */
export function rankByPopularityFit(pool, target) {
  if (!Number.isFinite(target)) return null;
  const scored = [];
  const rest = [];
  pool.forEach((p, i) => {
    if (typeof p.popularity === 'number' && Number.isFinite(p.popularity)) {
      scored.push({ id: p.entity_id, d: Math.round(Math.abs(p.popularity - target) * 1e9), pop: Math.round(p.popularity * 1e9), i });
    } else rest.push(p.entity_id);
  });
  scored.sort((a, b) => a.d - b.d || b.pop - a.pop || a.i - b.i);
  const tied = (key) => {
    const n = new Map();
    for (const x of scored) n.set(key(x), (n.get(key(x)) ?? 0) + 1);
    return scored.filter((x) => n.get(key(x)) > 1).length;
  };
  return { order: [...scored.map((x) => x.id), ...rest], scored: scored.length, tied_distance: tied((x) => x.d), tied_both: tied((x) => `${x.d}:${x.pop}`) };
}

/** MRR point value over a subset of units: room means, then cluster means, then clusters with equal weight. */
function subsetMrr(rr, clusterOf) {
  const cm = Object.values(clusterMeans(rr, clusterOf)).map((x) => x[0]);
  return cm.length ? round(cm.reduce((t, x) => t + x, 0) / cm.length) : null;
}

/**
 * Counts that need no Qloo call: rows per room and period, coverage (§4 with Amendment 4), compile drops, the placebo
 * assignment, and pool candidates per metro window before the headliner rule.
 * @param {{ venues: object[], shows: object[], capped?: object }} data output of checkData2
 */
export function dryRun2({ venues, shows, capped = { clusters: 0, test_rooms: 0 } }) {
  const byId = new Map(venues.map((v) => [v.venue_id, v]));
  const coverage = roomCoverage(venues, shows);
  const rooms = venues.map((v) => {
    const mine = shows.filter((s) => s.venue_id === v.venue_id);
    const inP = (p) => mine.filter((s) => periodOf(s.date) === p);
    const cov = coverage.get(v.venue_id);
    const by = (p, f) => inP(p).filter(f).length;
    const seen = new Set();
    let repeats = 0;
    for (const s of mine.filter((x) => rowState(x) === 'live')) {
      const k = `${s.date}|${normalizeName(s.title)}`;
      if (seen.has(k)) repeats++;
      seen.add(k);
    }
    return {
      venue_id: v.venue_id,
      role: v.role,
      capped: Boolean(v.capped),
      cluster: v.cluster,
      metro: v.metro,
      size: sizeGroup(v),
      rows: { S1: inP('S1').length, S2: inP('S2').length },
      coverage: cov,
      meets_coverage: cov.S1 >= MIN_COVERAGE && cov.S2 >= MIN_COVERAGE,
      canceled: { S1: by('S1', (s) => s.canceled === '1'), S2: by('S2', (s) => s.canceled === '1') },
      off_site: { S1: by('S1', (s) => s.drop_reason === 'off-site'), S2: by('S2', (s) => s.drop_reason === 'off-site') },
      untitled: { S1: by('S1', (s) => rowState(s) === 'untitled'), S2: by('S2', (s) => rowState(s) === 'untitled') },
      with_non_music_word: { S1: by('S1', (s) => rowState(s) === 'live' && nonMusicWords(s.title).length > 0), S2: by('S2', (s) => rowState(s) === 'live' && nonMusicWords(s.title).length > 0) },
      performer_field: mine.filter((s) => parsePerformers(s.performers).length > 0).length,
      same_night_same_title: repeats,
    };
  });
  const tests = venues.filter((v) => v.role === 'test');
  const live = shows.filter((s) => rowState(s) === 'live' && byId.has(s.venue_id));
  const windows = new Map();
  for (const s of live.filter((x) => periodOf(x.date) === 'S2' && byId.get(x.venue_id).role === 'test')) {
    const metro = byId.get(s.venue_id).metro;
    const w = backtestWindow(s.date);
    const key = `${metro}|${windowKey(w)}`;
    if (!windows.has(key)) {
      const titles = new Set(live.filter((x) => byId.get(x.venue_id).metro === metro && x.date >= w.from && x.date <= w.to).map((x) => normalizeName(x.title)));
      windows.set(key, { metro, ...w, candidates: titles.size, test_shows: 0 });
    }
    windows.get(key).test_shows++;
  }
  const perWindow = [...windows.values()].sort((a, b) => a.metro.localeCompare(b.metro) || (a.from < b.from ? -1 : 1));
  const testRooms = rooms.filter((r) => r.role === 'test');
  const chains = placeboChains(venues);
  return {
    kind: 'dry-run',
    protocol: PROTOCOL2,
    note: 'No Qloo call. Pool candidates are distinct titles in each metro window before the headliner rule, so the real pools are smaller.',
    periods: { S1, S2 },
    clusters: new Set(tests.map((v) => v.cluster)).size,
    test_rooms: tests.length,
    metros: [...new Set(venues.map((v) => v.metro))].sort(),
    capped,
    placebo: { seed: PLACEBO_SEED, assignment: Object.fromEntries(Object.entries(chains).map(([id, c]) => [id, c[0]])), candidates: chains },
    rooms,
    coverage_problems: coverageProblems(venues, shows),
    test_rows_S2: testRooms.reduce((t, r) => t + r.rows.S2, 0),
    test_rows_S2_live: live.filter((s) => periodOf(s.date) === 'S2' && byId.get(s.venue_id).role === 'test').length,
    test_rooms_below_coverage: testRooms.filter((r) => !r.meets_coverage).map((r) => r.venue_id),
    window_days: WINDOW_DAYS,
    window_rule: WINDOW_RULE,
    pool_candidates_by_window: perWindow,
    windows_cut: perWindow.filter((w) => w.cut).length,
    windows_below_min_pool_before_resolution: perWindow.filter((w) => w.candidates < MIN_POOL).length,
    min_pool: MIN_POOL,
    check_sample_rows: checkSample(shows.map((s) => s.row ?? 0)).length,
  };
}

/**
 * @param {{
 *   client: { search: Function, insights: Function },
 *   data: { venues: object[], shows: object[], capped?: object },
 *   restrict: 'filter' | 'take500',
 *   llm?: { rank: Function, model: string, sampling: string, draw?: string } | null, llmSkipReason?: string,
 *   seed?: number, reps?: number, concurrency?: number, log?: (event: object) => void, now?: () => number,
 *   minCoverage?: number,
 * }} args minCoverage is the protocol's 20; synthetic tests with small rooms pass 0.
 */
export async function runStudy2({
  client: rawClient, data, restrict, llm = null, llmSkipReason = 'no Claude key', seed = DEFAULT_SEED2, reps = DEFAULT_REPS2,
  concurrency = 4, log = () => {}, now = Date.now, minCoverage = MIN_COVERAGE,
}) {
  const client = countingClient(rawClient);
  const { venues, shows } = data;
  const byId = new Map(venues.map((v) => [v.venue_id, v]));
  const clusterOf = (venueId) => byId.get(venueId).cluster;
  const tests = venues.filter((v) => v.role === 'test');
  if (!tests.length) throw new BacktestError('no_test_rooms', 'venues.csv has no test room');
  const problems = minCoverage > 0 ? coverageProblems(venues, shows, minCoverage) : [];
  if (problems.length) throw new BacktestError('coverage', `venues.csv roles do not match shows.csv (Amendment 12): ${problems.join('; ')}`);

  // 0. Placebo rooms, before any Qloo call.
  const chains = placeboChains(venues);
  const placeboOf = Object.fromEntries(Object.entries(chains).map(([id, c]) => [id, c[0]]));
  log({ event: 'placebo', seed: PLACEBO_SEED, assignment: placeboOf, candidates: chains });

  // 1. Headliner rule for every live row that can matter: S1 and S2 rows of test rooms, and rows of any room inside a pool window.
  const rows = shows.map((s) => ({ s, venue: byId.get(s.venue_id), period: periodOf(s.date), state: rowState(s) }));
  const needed = rows.filter((r) => r.state === 'live' && r.period && (r.venue.role === 'test' || r.s.date >= FIRST_WINDOW_DAY));
  const tops = new Map();
  const topOf = (query) => {
    if (!tops.has(query)) {
      tops.set(query, client.search(query, { types: [ARTIST], take: SEARCH_TAKE }).then((r) => (r.status === 'error' ? { error: r.error ?? { code: 'error' } } : entitiesOf(r.data)[0] ?? null)));
    }
    return tops.get(query);
  };
  const resolution = { rows: needed.length, performer: 0, title: 0, split: 0, unresolved: 0, non_music: 0 };
  const bySize = {};
  await mapLimit(needed, concurrency, async (r) => {
    const candidate = performerCandidate(parsePerformers(r.s.performers), r.venue);
    const res = await resolveHeadliner2(topOf, { title: r.s.title, candidate });
    if (res.status === 'error') throw new BacktestError(res.error.code ?? 'qloo_error', `headliner search failed: ${res.error.message ?? res.error.code}`);
    // Amendment 8's resolution rate by size: test rooms' S1 and S2 rows only, so every room counts the same periods.
    const g = r.venue.role === 'test' ? (bySize[sizeGroup(r.venue)] ??= { rows: 0, resolved: 0 }) : { rows: 0, resolved: 0 };
    g.rows++;
    if (res.status !== 'resolved') {
      r.state = 'unresolved';
      resolution.unresolved++;
      return;
    }
    g.resolved++;
    resolution[res.step]++;
    if (nonMusicOutside(r.s.title, res.query).length) {
      r.state = 'non-music';
      resolution.non_music++;
      return;
    }
    r.state = 'counted';
    r.entity = res.entity;
  });
  log({ event: 'resolved', ...resolution, qloo: { ...client.stats } });

  const counted = rows.filter((r) => r.state === 'counted');
  const s1Headliners = (venueId) => {
    const out = new Map();
    for (const r of counted) if (r.s.venue_id === venueId && r.period === 'S1' && !out.has(r.entity.entity_id)) out.set(r.entity.entity_id, r.entity);
    return [...out.values()];
  };
  const pools = new Map(); // metro|window -> { pool: Map(id -> entity), rooms: Map(id -> Set(venue_id)) }
  const windowPool = (metro, w) => {
    const key = `${metro}|${windowKey(w)}`;
    if (!pools.has(key)) {
      const pool = new Map();
      const where = new Map();
      for (const r of counted) {
        if (r.venue.metro !== metro || r.s.date < w.from || r.s.date > w.to) continue;
        const id = r.entity.entity_id;
        if (!pool.has(id)) pool.set(id, r.entity);
        if (!where.has(id)) where.set(id, new Set());
        where.get(id).add(r.s.venue_id);
      }
      pools.set(key, { pool, where });
    }
    return pools.get(key);
  };

  // 2. Units and drops, per test room. A room with no resolved S1 headliner has no signal: its shows are dropped (no_signal)
  // and it is no placebo candidate (Amendment 12). The same headliner twice on one night at one room is one unit (duplicate).
  const rooms = [];
  const cutWindows = new Set();
  for (const v of tests) {
    const signal = s1Headliners(v.venue_id);
    const signalIds = new Set(signal.map((e) => e.entity_id));
    const drops = Object.fromEntries(DROP_REASONS2.map((d) => [d, 0]));
    const cut = { reached_pool: 0, small_pool: 0, units: 0 };
    const units = [];
    const seenNight = new Set();
    for (const r of rows.filter((x) => x.s.venue_id === v.venue_id && x.period === 'S2')) {
      if (r.state !== 'counted') {
        drops[r.state]++;
        continue;
      }
      if (!signal.length) {
        drops.no_signal++;
        continue;
      }
      const positive = r.entity.entity_id;
      if (signalIds.has(positive)) {
        drops.repeat_headliner++;
        continue;
      }
      const nightKey = `${r.s.date}|${positive}`;
      if (seenNight.has(nightKey)) {
        drops.duplicate++;
        continue;
      }
      seenNight.add(nightKey);
      const win = backtestWindow(r.s.date);
      const { pool: wp, where } = windowPool(v.metro, win);
      const pool = poolOrder([...wp.values()].filter((e) => !signalIds.has(e.entity_id)));
      if (win.cut) {
        cut.reached_pool++;
        cutWindows.add(`${v.metro}|${windowKey(win)}`);
      }
      if (pool.length < MIN_POOL) {
        drops.small_pool++;
        if (win.cut) cut.small_pool++;
        continue;
      }
      if (win.cut) cut.units++;
      const others = pool.filter((e) => e.entity_id !== positive).map((e) => where.get(e.entity_id));
      units.push({
        window: windowKey(win),
        positive,
        pool,
        weekday: weekdayGroup(r.s.date),
        same_room: others.filter((set) => set.has(v.venue_id)).length,
        same_cluster: others.filter((set) => [...set].some((id) => clusterOf(id) === v.cluster)).length,
      });
    }
    rooms.push({ venue: v, signal, drops, units, cut });
    log({ event: 'units', venue_id: v.venue_id, signal: signal.length, units: units.length, drops, cut_windows: cut });
  }
  const placeboSignal = new Map(tests.map((v) => [v.venue_id, s1Headliners(v.venue_id).map((e) => e.entity_id)]));
  // Amendment 12: per window, the placebo signal is the candidate's S1 headliners minus that pool (Q's signal never overlaps
  // the pool either). The first candidate with anything left is used; moving down the list and removed acts are counted.
  const placeboFor = (venueId, pool) => {
    const inPool = new Set(pool.map((e) => e.entity_id));
    for (const [k, cand] of chains[venueId].entries()) {
      const all = placeboSignal.get(cand) ?? [];
      const ids = all.filter((id) => !inPool.has(id));
      if (ids.length) return { room: cand, ids, removed: all.length - ids.length, fallback: k > 0 };
    }
    return null;
  };

  // 3. Rank, once per (room, window).
  const llmState = { status: llm ? 'run' : 'not run', reason: llm ? null : llmSkipReason, usd: 0, incomplete_answers: 0 };
  const p2Ties = { scored: 0, tied_distance: 0, tied_both: 0 };
  const placeboStats = { windows: 0, fallback_windows: 0, no_placebo_windows: 0, signal_acts_removed: 0 };
  for (const room of rooms) {
    const signalIds = room.signal.map((e) => e.entity_id);
    const target = median(room.signal.map((e) => e.popularity).filter((x) => typeof x === 'number' && Number.isFinite(x)));
    room.placeboFallbacks = 0;
    room.tags = signalIds.length && room.units.length ? await topGenreTags(client, room.signal) : [];
    room.venueEntity = room.units.length ? await resolveVenueEntity(client, room.venue.name) : null;
    const byWindow = new Map();
    for (const u of room.units) if (!byWindow.has(u.window)) byWindow.set(u.window, u.pool);
    room.rankings = new Map();
    await mapLimit([...byWindow], concurrency, async ([win, pool]) => {
      const rk = {};
      const where = `${room.venue.venue_id} ${win}`;
      rk.Q = signalIds.length ? await rankBySignal(client, { pool, entityIds: signalIds, restrict, what: `Q ${where}` }) : null;
      rk.P = rankByPopularity(pool);
      const p2 = rankByPopularityFit(pool, target);
      rk.P2 = p2?.order ?? null;
      if (p2) for (const k of Object.keys(p2Ties)) p2Ties[k] += p2[k];
      rk.T = room.tags.length ? await rankBySignal(client, { pool, tagIds: room.tags, restrict, what: `T ${where}` }) : null;
      rk.Qvenue = room.venueEntity && signalIds.length
        ? await rankBySignal(client, { pool, entityIds: [...signalIds, room.venueEntity], restrict, what: `Q+venue ${where}` })
        : null;
      const pl = placeboFor(room.venue.venue_id, pool);
      placeboStats.windows++;
      if (pl) {
        placeboStats.signal_acts_removed += pl.removed;
        if (pl.fallback) {
          placeboStats.fallback_windows++;
          room.placeboFallbacks++;
        }
      } else placeboStats.no_placebo_windows++;
      rk.placebo = pl ? await rankBySignal(client, { pool, entityIds: pl.ids, restrict, what: `placebo ${where}` }) : null;
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
          llmState.status = 'not run';
          llmState.reason = `${err.message}; stopped part-way, so no L numbers are reported`;
          break;
        }
      }
    }
    log({ event: 'ranked', venue_id: room.venue.venue_id, windows: byWindow.size, tags: room.tags.length, venue_entity: Boolean(room.venueEntity), qloo: { ...client.stats } });
  }

  // 4. Metrics per show, grouped by room.
  const rankerNames = ['Q', 'P', 'P2', 'T', 'L', 'Qvenue', 'placebo'];
  const values = {};
  const top5Pop = {};
  for (const name of [...rankerNames, 'R']) values[name] = { rr: {}, hit: {}, pct: {} };
  for (const room of rooms) {
    const id = room.venue.venue_id;
    const popOf = new Map();
    for (const u of room.units) for (const e of u.pool) popOf.set(e.entity_id, e.popularity);
    for (const u of room.units) {
      const rk = room.rankings.get(u.window);
      for (const name of rankerNames) {
        const order = name === 'L' && llmState.status !== 'run' ? null : rk[name];
        if (!order) continue;
        for (const [m, f] of [['rr', reciprocalRank], ['hit', (o, p) => hitAt(o, p, HIT_K)], ['pct', percentileRank]]) (values[name][m][id] ??= []).push(f(order, u.positive));
        for (const e of order.slice(0, HIT_K)) {
          const p = popOf.get(e);
          if (typeof p === 'number' && Number.isFinite(p)) (top5Pop[name] ??= []).push(p);
        }
      }
      const r = randomExpectation(u.pool.length, HIT_K);
      (values.R.rr[id] ??= []).push(r.rr);
      (values.R.hit[id] ??= []).push(r.hit);
      (values.R.pct[id] ??= []).push(r.percentile);
    }
  }

  const testedRooms = rooms.filter((r) => r.units.length);
  const R = testedRooms.length;
  const N = new Set(testedRooms.map((r) => r.venue.cluster)).size;
  const n = testedRooms.reduce((t, r) => t + r.units.length, 0);
  const opts = { reps, seed };
  // Q, P, placebo, L and R must cover every tested room. T, P2 and Qvenue are reported over the rooms where they are
  // defined (Amendment 12), with the room count, and their differences use those rooms only.
  const SUBSET = new Set(['T', 'P2', 'Qvenue']);
  const byRoomUnits = new Map(testedRooms.map((r) => [r.venue.venue_id, r.units.length]));
  const roomsWith = (name) => Object.keys(values[name].rr).filter((id) => values[name].rr[id].length === byRoomUnits.get(id));
  const complete = (name) => {
    if (R === 0 || (name === 'L' && llmState.status !== 'run')) return false;
    const k = roomsWith(name).length;
    return SUBSET.has(name) ? k > 0 : k === R;
  };
  const only = (v, ids) => Object.fromEntries(ids.map((id) => [id, v[id]]));
  for (const name of SUBSET) {
    const ids = roomsWith(name);
    for (const m of ['rr', 'hit', 'pct']) values[name][m] = only(values[name][m], ids);
  }

  const rankers = {};
  const notRun = {
    L: llmState.reason,
    T: 'no test room had genre tags for its S1 headliners',
    Q: 'a test room had no Q ranking',
    P2: "no test room had a popularity value for its S1 headliners",
    Qvenue: "no test room's own place entity resolved",
    placebo: 'a test room had no placebo room with an S1 headliner outside its pool',
  };
  for (const name of [...rankerNames, 'R']) {
    if (!complete(name)) {
      rankers[name] = { status: 'not run', reason: notRun[name] ?? 'missing' };
      continue;
    }
    const v = values[name];
    const flat = Object.values(v.rr).flat();
    rankers[name] = {
      status: 'run',
      rooms: Object.keys(v.rr).length,
      clusters: new Set(Object.keys(v.rr).map(clusterOf)).size,
      mrr: roundIv(clusterBootstrap2(v.rr, clusterOf, opts)),
      mrr_within_rooms: roundIv(nestedStratifiedBootstrap(v.rr, clusterOf, opts)),
      hit_at_5: roundIv(clusterBootstrap2(v.hit, clusterOf, opts)),
      percentile_rank: roundIv(clusterBootstrap2(v.pct, clusterOf, opts)),
      rr_median: round(spread(flat).median),
      rr_iqr: spread(flat).iqr.map((x) => round(x)),
      top5_popularity_median: name === 'R' ? null : round(median(top5Pop[name] ?? [])),
    };
  }
  if (rankers.L.status === 'run') {
    Object.assign(rankers.L, { model: llm.model, sampling: llm.sampling, usd: round(llmState.usd, 4), incomplete_answers: llmState.incomplete_answers });
    if (llm.draw) rankers.L.draw = llm.draw;
  }
  if (rankers.R.status === 'run') rankers.R.note = 'analytic expectation for each pool size';
  if (rankers.Qvenue.status === 'run') rankers.Qvenue.note = "Q with the room's own place entity added: a leakage size, never the headline number";
  if (rankers.P2.status === 'run') {
    rankers.P2.note = "descriptive (Amendment 5): distance from the median popularity of the room's S1 headliners";
    rankers.P2.ties = {
      scored: p2Ties.scored,
      share_tied_distance: round(p2Ties.scored ? p2Ties.tied_distance / p2Ties.scored : null),
      share_tied_distance_and_popularity: round(p2Ties.scored ? p2Ties.tied_both / p2Ties.scored : null),
    };
  }
  if (rankers.placebo.status === 'run') rankers.placebo.note = "each test room ranked with its placebo room's S1 headliners as the signal";

  const differences = {};
  const diff = (a, b, label = `${a}-${b}`) => {
    if (!complete(a) || !complete(b)) {
      differences[label] = { status: 'not run' };
      return;
    }
    const ids = Object.keys(values[a].rr).filter((id) => id in values[b].rr);
    const [va, vb] = [only(values[a].rr, ids), only(values[b].rr, ids)];
    differences[label] = {
      ...roundIv(clusterBootstrap2Diff(va, vb, clusterOf, opts)),
      within_rooms: roundIv(nestedStratifiedBootstrapDiff(va, vb, clusterOf, opts)),
      rooms: ids.length,
      clusters: new Set(ids.map(clusterOf)).size,
    };
  };
  for (const b of ['P', 'P2', 'T', 'L', 'placebo']) diff('Q', b);
  diff('Qvenue', 'Q');
  const above = (d) => Number.isFinite(d?.lo) && d.lo > 0;

  const claim = claimRule({ rooms: N, shows: n, qMinusP: differences['Q-P'], qMinusPlacebo: { placebo: differences['Q-placebo'] } });
  const status = claim.used ? 'full' : claim.checks.rooms_and_shows ? 'study 2' : 'pilot 2';
  const sumCut = (k) => rooms.reduce((t, x) => t + x.cut[k], 0);
  // P's input (Amendment 12): popularity is the value in the resolving /search result, as in Study 1. Acts without one go
  // to the bottom of P and P2, so the shares are reported.
  const hasPop = (e) => typeof e.popularity === 'number' && Number.isFinite(e.popularity);
  const posNoPop = testedRooms.reduce((t, r) => t + r.units.filter((u) => !hasPop(u.pool.find((e) => e.entity_id === u.positive))).length, 0);
  const windowMembers = new Map();
  for (const r of testedRooms) for (const u of r.units) for (const e of u.pool) windowMembers.set(`${r.venue.metro}|${u.window}|${e.entity_id}`, e);
  const memberNoPop = [...windowMembers.values()].filter((e) => !hasPop(e)).length;
  const dropped = Object.fromEntries(DROP_REASONS2.map((d) => [d, rooms.reduce((t, x) => t + x.drops[d], 0)]));

  // Amendment 8 splits, descriptive: point MRR only, cluster-weighted like the headline.
  const splitOf = (pickRoom, pickUnit) => {
    const out = {};
    for (const name of ['Q', 'P', 'P2']) {
      if (!complete(name)) {
        out[name] = null;
        continue;
      }
      const rr = {};
      for (const room of testedRooms) {
        if (!pickRoom(room.venue)) continue;
        const vals = (values[name].rr[room.venue.venue_id] ?? []).filter((_, k) => pickUnit(room.units[k]));
        if (vals.length) rr[room.venue.venue_id] = vals;
      }
      out[name] = subsetMrr(rr, clusterOf);
    }
    const inRooms = testedRooms.filter((r) => pickRoom(r.venue));
    out.rooms = inRooms.filter((r) => r.units.some(pickUnit)).length;
    out.shows = inRooms.reduce((t, r) => t + r.units.filter(pickUnit).length, 0);
    return out;
  };
  const splits = {
    size_limit: SIZE_SPLIT,
    small: splitOf((v) => sizeGroup(v) === 'small', () => true),
    large: splitOf((v) => sizeGroup(v) === 'large', () => true),
    size_unknown_rooms: testedRooms.filter((r) => sizeGroup(r.venue) === 'unknown').length,
    mon_wed: splitOf(() => true, (u) => u.weekday === 'mon_wed'),
    thu_sun: splitOf(() => true, (u) => u.weekday === 'thu_sun'),
    resolution_by_size: Object.fromEntries(Object.entries(bySize).sort().map(([k, g]) => [k, { rows: g.rows, resolved: g.resolved, rate: round(g.rows ? g.resolved / g.rows : null) }])),
    note: 'descriptive only (Amendment 8); never part of the claim',
  };

  return {
    status,
    label: `${claim.used ? 'full' : status} (N = ${N} clusters, ${R} rooms, n = ${n} shows)`,
    protocol: PROTOCOL2,
    split: 'test',
    run_at: new Date(now()).toISOString(),
    clusters: N,
    rooms: R,
    shows: n,
    periods: { S1, S2 },
    pool_restriction: restrict === 'filter' ? 'filter.results.entities' : 'take=500, pool members kept',
    pool_window: {
      days: WINDOW_DAYS, rule: WINDOW_RULE, scope: 'eligible venues of the same metro', cut_windows: cutWindows.size,
      cut_shows: sumCut('reached_pool'), cut_shows_dropped_small_pool: sumCut('small_pool'), cut_shows_scored: sumCut('units'),
    },
    placebo: {
      seed: PLACEBO_SEED,
      rule: "one shuffle of the test rooms; each takes the next room in another metro and another cluster; per window the signal is that room's S1 headliners minus the pool, and the next candidate is used only when nothing is left (Amendment 12)",
      assignment: placeboOf,
      ...placeboStats,
    },
    popularity_missing: {
      positives: posNoPop,
      positives_share: round(n ? posNoPop / n : null),
      pool_members: memberNoPop,
      pool_members_share: round(windowMembers.size ? memberNoPop / windowMembers.size : null),
      note: "popularity comes from the resolving /search result, as in Study 1; acts without it go to the bottom of P and P2",
    },
    interval: {
      method: 'bootstrap over clusters (rooms averaged within a cluster, clusters weighted equally)',
      level: 0.95,
      reps,
      seed,
      within_rooms: 'shows resampled within each room: printed for reference, too narrow because shows in a room are not independent',
      caveat: N < 8 ? `Only ${N} clusters: the cluster bootstrap is rough at this size.` : null,
    },
    metric_note: 'MRR: reciprocal rank of the actual headliner, averaged per room, per cluster, then across clusters with equal weight. Percentile rank: 0 = top, 1 = bottom.',
    rankers,
    differences,
    claim: { sentence: CLAIM_SENTENCE, used: claim.used, checks: claim.checks },
    other_sentences: {
      q_beats_p2: above(differences['Q-P2']),
      q_beats_l: above(differences['Q-L']),
      note: 'Amendments 5 and 6: written only when the lower bound is above 0, and always apart from the claim sentence',
    },
    gain_reading: claim.checks.q_minus_p_above_0 && !claim.checks.q_minus_placebo_above_0
      ? "Q beat P but not the placebo: the gain looks like general taste-graph structure, not this room's crowd"
      : null,
    dropped,
    resolution,
    splits,
    capped: data.capped ?? { clusters: 0, test_rooms: 0 },
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
        cluster: r.venue.cluster,
        metro: r.venue.metro,
        capacity: r.venue.capacity ? Number(r.venue.capacity) : null,
        placebo: placeboOf[r.venue.venue_id],
        placebo_fallback_windows: r.placeboFallbacks ?? 0,
        signal_size: r.signal.length,
        shows: r.units.length,
        dropped: r.drops,
        pool_size: ps ? { median: ps.median, min: Math.min(...sizes), max: Math.max(...sizes) } : null,
        same_room_acts_median: r.units.length ? median(r.units.map((u) => u.same_room)) : null,
        same_cluster_acts_median: r.units.length ? median(r.units.map((u) => u.same_cluster)) : null,
        mrr: Object.fromEntries([...rankerNames, 'R'].map((name) => [name, mrrOf(name)])),
      };
    }),
    same_room_note: 'Amendment 7, descriptive: pool acts other than the show\'s own headliner with a counted show at the same room (or the same cluster) in the window',
    qloo: { ...client.stats },
  };
}
