// Back-test tests. Synthetic data only: CSV rows are generated here, Qloo is a hand-written stand-in or the fixture mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  claimRule, clusterBootstrap, clusterBootstrapDiff, hitAt, percentileRank, randomExpectation, reciprocalRank, roomMean,
  seededRandom, stratifiedBootstrap, stratifiedBootstrapDiff,
} from '../server/backtest/metrics.js';
import { resolveHeadliner, splitAtSeparator } from '../server/backtest/headliner.js';
import { checkData, parseCsv, periodOf, weekOf } from '../server/backtest/data.js';
import { orderByScore, rankBySignal, topGenreTags } from '../server/backtest/rankers.js';
import { SAMPLING_DEFAULT, SAMPLING_T0, SINGLE_DRAW, createLlmRanker, parseOrder } from '../server/backtest/llm.js';
import { backtestWindow } from '../server/rank/pool.js';
import { dryRun, runBacktest } from '../server/backtest/run.js';
import { LOCK_NAME, main, parseArgs } from '../scripts/backtest.js';
import { nothingListed } from '../scripts/nothing-listed.js';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'dnd-bt-'));
test.after(() => rm(tmp, { recursive: true, force: true }));

// ---------- metrics ----------
test('metrics: reciprocal rank, hit@k and percentile rank', () => {
  assert.equal(reciprocalRank(['a', 'b', 'c'], 'b'), 0.5);
  assert.equal(reciprocalRank(['a', 'b'], 'z'), 0);
  assert.equal(hitAt(['a', 'b', 'c', 'd', 'e', 'f'], 'e', 5), 1);
  assert.equal(hitAt(['a', 'b', 'c', 'd', 'e', 'f'], 'f', 5), 0);
  assert.equal(percentileRank(['a', 'b', 'c'], 'a'), 0);
  assert.equal(percentileRank(['a', 'b', 'c'], 'c'), 1);
  assert.equal(percentileRank(['a', 'b', 'c'], 'b'), 0.5);
  assert.equal(percentileRank(['a'], 'a'), 0);
  assert.equal(percentileRank(['a'], 'z'), 1);
});

test('metrics: random ranker is the analytic expectation', () => {
  const r = randomExpectation(4);
  assert.ok(Math.abs(r.rr - (1 + 1 / 2 + 1 / 3 + 1 / 4) / 4) < 1e-12);
  assert.equal(r.hit, 1);
  assert.equal(randomExpectation(10).hit, 0.5);
  assert.equal(randomExpectation(10).percentile, 0.5);
});

test('metrics: seeded random is deterministic and in [0, 1)', () => {
  const a = seededRandom(7);
  const b = seededRandom(7);
  const xs = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 1000 }, () => b()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs.slice(0, 5), Array.from({ length: 5 }, seededRandom(8)));
});

test('metrics: both bootstraps are deterministic for a seed and contain the point estimate', () => {
  const v = { v1: [1, 0.5, 0.2], v2: [0.1, 0.3], v3: [1, 1] };
  for (const f of [clusterBootstrap, stratifiedBootstrap]) {
    const a = f(v, { reps: 500, seed: 7 });
    assert.deepEqual(a, f(v, { reps: 500, seed: 7 }));
    assert.ok(a.lo <= a.mean && a.mean <= a.hi, `${f.name}: ${JSON.stringify(a)}`);
    assert.ok(Math.abs(a.mean - roomMean(v)) < 1e-12);
  }
  // rooms weigh equally, whatever their show count
  assert.ok(Math.abs(roomMean({ a: [1, 1, 1, 1], b: [0] }) - 0.5) < 1e-12);
});

test('metrics: stratified bootstrap keeps rooms apart; a room with one value never moves', () => {
  const iv = stratifiedBootstrap({ a: [0.25, 0.25, 0.25], b: [0.75] }, { reps: 300, seed: 1 });
  assert.deepEqual(iv, { mean: 0.5, lo: 0.5, hi: 0.5 });
});

test('metrics: paired differences are zero for identical rankers and need lined-up shows', () => {
  const a = { v1: [1, 0.5], v2: [0.2] };
  assert.deepEqual(stratifiedBootstrapDiff(a, a, { reps: 200, seed: 3 }), { mean: 0, lo: 0, hi: 0 });
  assert.deepEqual(clusterBootstrapDiff(a, a, { reps: 200, seed: 3 }), { mean: 0, lo: 0, hi: 0 });
  assert.throws(() => stratifiedBootstrapDiff(a, { v1: [1], v2: [0.2] }), /line up/);
});

test('claim rule: full only with 8+ rooms, 300+ shows and both intervals clear of zero', () => {
  const good = { lo: 0.01, hi: 0.2 };
  const zero = { lo: -0.01, hi: 0.2 };
  assert.equal(claimRule({ rooms: 3, shows: 176, qMinusP: good, qMinusPlacebo: { a: good } }).status, 'pilot');
  assert.equal(claimRule({ rooms: 8, shows: 299, qMinusP: good, qMinusPlacebo: { a: good } }).status, 'pilot');
  assert.equal(claimRule({ rooms: 8, shows: 300, qMinusP: zero, qMinusPlacebo: { a: good } }).status, 'pilot');
  assert.equal(claimRule({ rooms: 8, shows: 300, qMinusP: good, qMinusPlacebo: { a: good, b: zero } }).status, 'pilot');
  assert.equal(claimRule({ rooms: 8, shows: 300, qMinusP: good, qMinusPlacebo: {} }).status, 'pilot');
  const ok = claimRule({ rooms: 8, shows: 300, qMinusP: good, qMinusPlacebo: { a: good, b: { lo: -0.3, hi: -0.1 } } });
  assert.equal(ok.status, 'full');
  assert.equal(ok.used, true);
});

// ---------- headliner rule ----------
const ARTIST_RE = /^Synthetic Act (\d+)$/i;
function fakeClient({ affinity = () => 0.5, failOn } = {}) {
  const calls = [];
  const env = (entities) => ({ status: entities.length ? 'ok' : 'empty', data: { results: { entities } }, call: { cache: 'miss' } });
  const entity = (n) => ({
    entity_id: `synthetic-artist-${n}`, name: `Synthetic Act ${n}`, popularity: (Number(n) % 50) / 50,
    tags: Number(n) % 4 === 0 ? [] : [{ tag_id: `synthetic-genre-${Number(n) % 3}`, type: 'urn:tag:genre:music' }],
  });
  return {
    calls,
    async search(query, opts) {
      calls.push({ endpoint: '/search', query, opts });
      if (failOn && failOn === query) return { status: 'error', data: null, error: { code: 'http_500', message: 'boom' }, call: {} };
      const m = ARTIST_RE.exec(query.trim());
      if (m && opts.types.includes('urn:entity:artist')) return env([entity(m[1])]);
      if (opts.types.includes('urn:entity:place') && query.startsWith('Synthetic Room')) return env([{ entity_id: `synthetic-place-${query.slice(-1)}`, name: query }]);
      if (query === 'Near Miss') return env([entity(99)]);
      return env([]);
    },
    async insights(params) {
      calls.push({ endpoint: '/v2/insights', params });
      const only = params['filter.results.entities'];
      const ids = only ? [...only] : Array.from({ length: 30 }, (_, i) => `synthetic-artist-${i + 1}`);
      return env(ids.map((id) => ({ ...entity(id.split('-').pop()), query: { affinity: affinity(id, params) } })));
    },
  };
}

test('headliner rule: separators are tried in list order, case-insensitively', () => {
  assert.equal(splitAtSeparator('Synthetic Act 1 with Synthetic Act 2'), 'Synthetic Act 1');
  assert.equal(splitAtSeparator('A & B with C'), 'A & B'); // " with " comes before " & " in the list
  assert.equal(splitAtSeparator('Synthetic Act 1 FEAT. Someone'), 'Synthetic Act 1');
  assert.equal(splitAtSeparator('No separator here'), null);
});

test('headliner rule: whole title, then the split part, exact normalized match only', async () => {
  const c = fakeClient();
  assert.deepEqual(await resolveHeadliner(c, 'synthetic act 3'), {
    status: 'resolved', step: 'title',
    entity: { entity_id: 'synthetic-artist-3', name: 'Synthetic Act 3', popularity: 0.06, tags: [{ tag_id: 'synthetic-genre-0', type: 'urn:tag:genre:music' }] },
  });
  const split = await resolveHeadliner(c, 'Synthetic Act 5 w/ Opening Act');
  assert.equal(split.status, 'resolved');
  assert.equal(split.step, 'split');
  assert.equal((await resolveHeadliner(c, 'Near Miss')).status, 'unresolved'); // top result has another name
  assert.equal((await resolveHeadliner(c, 'Late Night Comedy')).status, 'unresolved');
  assert.equal((await resolveHeadliner(fakeClient({ failOn: 'Synthetic Act 1' }), 'Synthetic Act 1')).status, 'error');
});

// ---------- data ----------
test('data: CSV with quoted commas, weeks run Monday to Sunday, periods S1 and S2', () => {
  const rows = parseCsv('venue_id,name,city\r\nx,"Room, Upstairs","Washington, DC"\n"y","Say ""hi""",Z\n');
  assert.deepEqual(rows, [{ venue_id: 'x', name: 'Room, Upstairs', city: 'Washington, DC' }, { venue_id: 'y', name: 'Say "hi"', city: 'Z' }]);
  assert.equal(weekOf('2026-07-01'), '2026-06-29'); // Wednesday
  assert.equal(weekOf('2026-07-05'), '2026-06-29'); // Sunday
  assert.equal(weekOf('2026-07-06'), '2026-07-06'); // Monday
  assert.equal(periodOf('2026-06-30'), 'S1');
  assert.equal(periodOf('2026-07-01'), 'S2');
  assert.equal(periodOf('2026-10-01'), null);
  assert.throws(() => checkData({ venues: [{ venue_id: 'a', name: 'A', role: 'dev' }], shows: [] }), /role/);
  assert.throws(() => checkData({ venues: [{ venue_id: 'a', name: 'A', role: 'test' }], shows: [{ venue_id: 'b', date: '2026-07-01', title: 't', canceled: '0' }] }), /unknown venue/);
});

// ---------- synthetic back-test data ----------
const VENUES_CSV = [
  'venue_id,name,city,role,capacity,capacity_source,operator,operator_source,calendar_source',
  'room-a,Synthetic Room A,Exampleville,test,300,,,,',
  'room-b,Synthetic Room B,Exampleville,test,600,,,,',
  'placebo-x,Synthetic Room X,Otherville,placebo,,,,,',
  'hall-p,Synthetic Room P,Exampleville,pool,,,,,',
].join('\n');

function showsCsv({ late = false } = {}) {
  const rows = ['venue_id,room,date,title,canceled,source_url,list_page_url,fetched_at,compiled_by'];
  const add = (venue, date, title, canceled = 0) => rows.push(`${venue},x,${date},${title},${canceled},https://example.org/${rows.length},,2026-10-11T00:00:00Z,test`);
  // S1 signals
  for (const n of [101, 102, 103]) add('room-a', '2026-04-10', `Synthetic Act ${n}`);
  add('room-a', '2026-05-01', 'Synthetic Act 104', 1); // canceled, so not in the signal
  for (const n of [104, 105, 106]) add('room-b', '2026-05-12', `Synthetic Act ${n}`);
  for (const n of [7, 8]) add('placebo-x', '2026-06-01', `Synthetic Act ${n}`);
  // week of Mon 2026-07-06: twelve acts across the archive
  for (let n = 1; n <= 12; n++) add('hall-p', '2026-07-10', `Synthetic Act ${n}`);
  add('room-a', '2026-07-07', 'Synthetic Act 1');
  add('room-a', '2026-07-08', 'Synthetic Act 2 with Guests');
  add('room-a', '2026-07-09', 'A Night Of Synthetic Comedy'); // unresolved
  add('room-a', '2026-07-11', 'Synthetic Act 101'); // repeat headliner
  add('room-a', '2026-07-12', 'Synthetic Act 3', 1); // canceled
  add('room-b', '2026-07-09', 'Synthetic Act 4');
  // week of Mon 2026-07-20: too few acts
  add('room-b', '2026-07-21', 'Synthetic Act 20');
  add('hall-p', '2026-07-22', 'Synthetic Act 21');
  if (late) {
    // Tue 2026-09-29: its window runs 09-21 to 10-11 and is cut at the archive end (09-30)
    add('room-b', '2026-09-29', 'Synthetic Act 5');
    for (let n = 30; n <= 39; n++) add('hall-p', '2026-09-30', `Synthetic Act ${n}`);
    for (let n = 40; n <= 44; n++) add('hall-p', '2026-10-02', `Synthetic Act ${n}`); // after the cut: never in the pool
  }
  return rows.join('\n');
}

async function syntheticDir(name) {
  const dir = path.join(tmp, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'venues.csv'), VENUES_CSV);
  await writeFile(path.join(dir, 'shows.csv'), showsCsv());
  return dir;
}
const syntheticData = (opts) => checkData({ venues: parseCsv(VENUES_CSV), shows: parseCsv(showsCsv(opts)) });

// ---------- rankers ----------
test('rankers: score order, ties and unscored members keep pool order', () => {
  const pool = ['a', 'b', 'c', 'd'].map((entity_id) => ({ entity_id, name: entity_id }));
  const s = { a: 0.2, b: 0.9, c: 0.2 };
  assert.deepEqual(orderByScore(pool, (id) => s[id]), ['b', 'a', 'c', 'd']);
});

test('rankers: the pool restriction is fixed per run and no popularity limit is sent', async () => {
  const pool = [1, 2, 3].map((n) => ({ entity_id: `synthetic-artist-${n}`, name: `Synthetic Act ${n}` }));
  for (const [restrict, check] of [
    ['filter', (p) => assert.deepEqual(p['filter.results.entities'], pool.map((x) => x.entity_id))],
    ['take500', (p) => { assert.equal(p['filter.results.entities'], undefined); assert.equal(p.take, 500); }],
  ]) {
    const c = fakeClient({ affinity: (id) => (id === 'synthetic-artist-3' ? 0.9 : 0.1) });
    const order = await rankBySignal(c, { pool, entityIds: ['synthetic-artist-101'], restrict });
    assert.equal(order[0], 'synthetic-artist-3');
    assert.equal(order.length, 3);
    const p = c.calls.at(-1).params;
    check(p);
    assert.ok(!Object.keys(p).some((k) => k.startsWith('filter.popularity')));
  }
  await assert.rejects(rankBySignal(fakeClient(), { pool, entityIds: ['x'], restrict: 'loose' }), /restrict/);
});

test('rankers: genre tags for T, most frequent first, ties alphabetical, looked up when search had none', async () => {
  const c = fakeClient();
  const heads = [1, 2, 4, 5, 7].map((n) => ({ entity_id: `synthetic-artist-${n}`, tags: n === 4 ? [] : [{ tag_id: `synthetic-genre-${n % 3}`, type: 'urn:tag:genre:music' }] }));
  // genre-1: acts 1, 4 (looked up: 4 % 4 === 0 has none, so not counted), 7 -> 2; genre-2: acts 2, 5 -> 2
  assert.deepEqual(await topGenreTags(c, heads), ['synthetic-genre-1', 'synthetic-genre-2']);
  assert.equal(c.calls.filter((x) => x.endpoint === '/v2/insights').length, 1);
});

test('L ranker answer parsing: last integer array, unknown and repeated numbers skipped, the rest in pool order', () => {
  assert.deepEqual(parseOrder('thinking... [9]\nAnswer: [3, 1, 3, 7]', 4), { order: [2, 0, 1, 3], complete: false });
  assert.deepEqual(parseOrder('[2,1]', 2), { order: [1, 0], complete: true });
  assert.deepEqual(parseOrder('no list', 2), { order: [0, 1], complete: false });
});

// ---------- pool window (Amendment 1) ----------
test('pool window: the week of the date plus the week before and after, 21 days, cut at 2026-09-30', () => {
  assert.deepEqual(backtestWindow('2026-07-15'), { from: '2026-07-06', to: '2026-07-26', cut: false });
  assert.deepEqual(backtestWindow('2026-07-13'), { from: '2026-07-06', to: '2026-07-26', cut: false }); // Monday
  assert.deepEqual(backtestWindow('2026-07-19'), { from: '2026-07-06', to: '2026-07-26', cut: false }); // Sunday
  assert.deepEqual(backtestWindow('2026-07-01'), { from: '2026-06-22', to: '2026-07-12', cut: false }); // reaches into S1
  assert.deepEqual(backtestWindow('2026-09-20'), { from: '2026-09-07', to: '2026-09-27', cut: false });
  assert.deepEqual(backtestWindow('2026-09-21'), { from: '2026-09-14', to: '2026-09-30', cut: true });
  assert.deepEqual(backtestWindow('2026-09-29'), { from: '2026-09-21', to: '2026-09-30', cut: true });
});

// ---------- run ----------
test('dry run counts shows and candidates per 21-day window without any Qloo call', () => {
  const d = dryRun(syntheticData());
  assert.equal(d.test_shows_before_drops, 6);
  assert.equal(d.canceled_test_shows, 1);
  assert.equal(d.window_days, 21);
  assert.deepEqual(d.pool_candidates_by_window, [
    { from: '2026-06-29', to: '2026-07-19', cut: false, candidates: 15, test_shows: 5 },
    { from: '2026-07-13', to: '2026-08-02', cut: false, candidates: 2, test_shows: 1 },
  ]);
  assert.equal(d.windows_below_min_pool_before_resolution, 1);
  assert.equal(d.windows_cut, 0);
  const late = dryRun(syntheticData({ late: true }));
  assert.deepEqual(late.pool_candidates_by_window.at(-1), { from: '2026-09-21', to: '2026-09-30', cut: true, candidates: 11, test_shows: 1 });
  assert.equal(late.windows_cut, 1);
  assert.equal(late.test_shows_with_cut_window, 1);
});

test('run: a window cut at the archive end is counted and leaves later shows out of the pool', async () => {
  const out = await runBacktest({ client: fakeClient(), data: syntheticData({ late: true }), restrict: 'filter', reps: 200, now: () => 0 });
  assert.equal(out.pool_window.days, 21);
  assert.equal(out.pool_window.cut_shows, 1);
  assert.equal(out.pool_window.cut_shows_scored, 1);
  assert.equal(out.pool_window.cut_shows_dropped_small_pool, 0);
  const b = out.per_room.find((r) => r.venue_id === 'room-b');
  assert.equal(b.shows, 2);
  assert.equal(b.pool_size.min, 11); // acts 30-39 and act 5; the 2 Oct shows are past the cut
});

test('run: units, every drop counted by reason, pilot label, totals only in the output', async () => {
  const byNumber = (id) => 1 - Number(id.split('-').pop()) / 100; // act 1 first, then 2, 3, ...
  const c = fakeClient({ affinity: byNumber });
  const events = [];
  const out = await runBacktest({ client: c, data: syntheticData(), restrict: 'filter', reps: 300, log: (e) => events.push(e), now: () => 0 });
  assert.equal(out.status, 'pilot');
  assert.equal(out.rooms, 2);
  assert.equal(out.shows, 3);
  assert.equal(out.label, 'pilot (N = 2 rooms, n = 3 shows)');
  assert.deepEqual(out.dropped, { canceled: 1, unresolved: 1, repeat_headliner: 1, small_pool: 1 });
  assert.equal(out.rankers.Q.status, 'run');
  assert.equal(out.rankers.Q.mrr.mean, 0.5); // room A: acts 1 and 2 at ranks 1 and 2 (0.75); room B: act 4 at rank 4 (0.25)
  assert.equal(out.rankers.L.status, 'not run');
  assert.equal(out.rankers.R.status, 'run');
  assert.equal(out.rankers['placebo:placebo-x'].status, 'run');
  assert.equal(out.rankers.Qvenue.status, 'run');
  assert.ok('Q-P' in out.differences && 'Q-placebo:placebo-x' in out.differences && 'Qvenue-Q' in out.differences);
  assert.deepEqual(out.differences['Q-L'], { status: 'not run' });
  assert.equal(out.claim.used, false);
  assert.match(out.interval.caveat, /too narrow/);
  assert.deepEqual([out.pool_window.days, out.pool_window.cut_shows], [21, 0]);
  // the room's own place entity goes only into the variant
  const qCalls = c.calls.filter((x) => x.endpoint === '/v2/insights' && x.params['signal.interests.entities']);
  assert.ok(qCalls.some((x) => x.params['signal.interests.entities'].includes('synthetic-place-A')));
  assert.ok(qCalls.some((x) => !x.params['signal.interests.entities'].includes('synthetic-place-A')));
  // nothing from Qloo or about single acts in the output or the log
  for (const text of [JSON.stringify(out), JSON.stringify(events)]) {
    assert.doesNotMatch(text, /synthetic-artist|Synthetic Act|synthetic-place|synthetic-genre/);
  }
  // same data, same seed: same numbers
  const again = await runBacktest({ client: fakeClient({ affinity: byNumber }), data: syntheticData(), restrict: 'filter', reps: 300, now: () => 0 });
  assert.deepEqual(again, out);
});

test('run: L runs with a key and budget; a spend cap part-way drops L entirely', async () => {
  const llm = (failAfter = Infinity) => {
    let n = 0;
    return {
      model: 'stand-in', sampling: 'stand-in',
      async rank({ poolNames }) {
        if (++n > failAfter) {
          const { BacktestError } = await import('../server/backtest/rankers.js');
          throw new BacktestError('spend_cap', 'cap');
        }
        return { order: poolNames.map((_, i) => i), complete: true, usd: 0.01 };
      },
    };
  };
  const ok = await runBacktest({ client: fakeClient(), data: syntheticData(), restrict: 'take500', llm: llm(), reps: 200 });
  assert.equal(ok.rankers.L.status, 'run');
  assert.equal(ok.rankers.L.usd, 0.02); // one call per room and week, not per show
  assert.equal(typeof ok.differences['Q-L'].mean, 'number');
  const cut = await runBacktest({ client: fakeClient(), data: syntheticData(), restrict: 'take500', llm: llm(1), reps: 200 });
  assert.equal(cut.rankers.L.status, 'not run');
  assert.match(cut.rankers.L.reason, /part-way/);
});

// ---------- L sampling (Amendment 2) ----------
function standInClaude({ rejectTemperature }) {
  const requests = [];
  return {
    requests,
    messages: {
      async create(body) {
        requests.push(body);
        if (rejectTemperature && 'temperature' in body) throw Object.assign(new Error('temperature is not supported'), { status: 400 });
        return { content: [{ type: 'text', text: '[2, 1]' }], usage: { input_tokens: 10, output_tokens: 5 } };
      },
    },
  };
}
const openBudget = () => ({ canSpend: () => ({ ok: true }), record: () => ({ usd: 0.001 }) });

test('L sampling: temperature 0 when the model accepts it', async () => {
  const anthropic = standInClaude({ rejectTemperature: false });
  const events = [];
  const l = createLlmRanker({ anthropic, model: 'stand-in', budget: openBudget(), log: (e) => events.push(e) });
  assert.deepEqual((await l.rank({ signalNames: ['a'], poolNames: ['x', 'y'] })).order, [1, 0]);
  await l.rank({ signalNames: ['a'], poolNames: ['x', 'y'] });
  assert.deepEqual(anthropic.requests.map((r) => r.temperature), [0, 0]);
  assert.equal(l.sampling, SAMPLING_T0);
  assert.equal(l.draw, null);
  assert.deepEqual(events, [{ event: 'llm_sampling', sampling: 'sampling: temperature 0', draw: null }]);
});

test('L sampling: a 400 on temperature retries once at the default, logs it and labels a single draw', async () => {
  const anthropic = standInClaude({ rejectTemperature: true });
  const events = [];
  const l = createLlmRanker({ anthropic, model: 'stand-in', budget: openBudget(), log: (e) => events.push(e) });
  assert.deepEqual((await l.rank({ signalNames: ['a'], poolNames: ['x', 'y'] })).order, [1, 0]);
  await l.rank({ signalNames: ['a'], poolNames: ['x', 'y'] });
  // first request with temperature, its retry without, then never again
  assert.deepEqual(anthropic.requests.map((r) => 'temperature' in r), [true, false, false]);
  assert.equal(l.sampling, SAMPLING_DEFAULT);
  assert.equal(l.draw, SINGLE_DRAW);
  assert.deepEqual(events, [{ event: 'llm_sampling', sampling: 'sampling: default (temperature not accepted)', draw: 'single draw' }]);

  const out = await runBacktest({ client: fakeClient(), data: syntheticData(), restrict: 'filter', llm: createLlmRanker({ anthropic: standInClaude({ rejectTemperature: true }), model: 'stand-in', budget: openBudget() }), reps: 200 });
  assert.equal(out.rankers.L.status, 'run');
  assert.equal(out.rankers.L.sampling, SAMPLING_DEFAULT);
  assert.equal(out.rankers.L.draw, 'single draw');
});

test('L sampling: other failures are not retried', async () => {
  const anthropic = { messages: { create: async () => { throw Object.assign(new Error('overloaded'), { status: 529 }); } } };
  const l = createLlmRanker({ anthropic, model: 'stand-in', budget: openBudget() });
  await assert.rejects(l.rank({ signalNames: ['a'], poolNames: ['x'] }), /HTTP 529/);
  assert.equal(l.sampling, SAMPLING_T0);
});

test('run: a Qloo error stops the run instead of being scored', async () => {
  await assert.rejects(runBacktest({ client: fakeClient({ failOn: 'Synthetic Act 5' }), data: syntheticData(), restrict: 'filter' }), /headliner search failed/);
});

// ---------- CLI ----------
test('cli: options are checked; there is no dev split', () => {
  assert.throws(() => parseArgs(['--split', 'dev']), /no dev rooms/);
  assert.throws(() => parseArgs(['--split', 'test']), /--restrict/);
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.equal(parseArgs(['--restrict', 'take500']).restrict, 'take500');
});

test('cli: one test run in fixture mode, then a second run is refused by the lock', async () => {
  const data = await syntheticDir('cli');
  const out = path.join(tmp, 'cli-out');
  const dataDir = path.join(tmp, 'cli-var');
  const env = { NODE_ENV: 'test', QLOO_MODE: 'fixture', DATA_DIR: dataDir };
  const lines = [];
  const print = (l) => lines.push(l);

  assert.equal(await main(['--dry-run', '--data', data, '--out', out], env, print), 0);
  assert.ok(existsSync(path.join(out, 'backtest-dryrun.json')));

  assert.equal(await main(['--restrict', 'filter', '--data', data, '--out', out, '--reps', '200'], env, print), 0, lines.join('\n'));
  const summary = JSON.parse(readFileSync(path.join(out, 'backtest-test.json'), 'utf8'));
  assert.equal(summary.status, 'pilot');
  assert.match(summary.label, /^pilot \(N = \d+ rooms, n = \d+ shows\)$/);
  const log = readFileSync(path.join(out, 'backtest-test.log'), 'utf8');
  assert.match(log, /"event":"done"/);
  assert.doesNotMatch(log + JSON.stringify(summary), /synthetic-artist|Synthetic Act/);
  assert.ok(existsSync(path.join(dataDir, LOCK_NAME)));

  assert.equal(await main(['--restrict', 'filter', '--data', data, '--out', out], env, print), 2);
  assert.match(lines.at(-1), /refused/);
});

test('cli: without a Qloo key the test run is refused and no lock is written', async () => {
  const data = await syntheticDir('nokey');
  const dataDir = path.join(tmp, 'nokey-var');
  const lines = [];
  assert.equal(await main(['--restrict', 'filter', '--data', data, '--out', path.join(tmp, 'nokey-out')], { DATA_DIR: dataDir }, (l) => lines.push(l)), 2);
  assert.match(lines.at(-1), /QLOO_API_KEY/);
  assert.ok(!existsSync(path.join(dataDir, LOCK_NAME)));
});

test('nothing-listed: counts nights with no listed show per room, canceled rows do not count, Monday to Wednesday split', () => {
  const rows = [
    { venue_id: 'room-a', date: '2026-11-02', canceled: '0' },
    { venue_id: 'room-a', date: '2026-11-03', canceled: '1' },
    { venue_id: 'room-b', date: '2026-11-08', canceled: '0' },
    { venue_id: 'room-c', date: '2026-11-04', canceled: '0' },
  ];
  const r = nothingListed(rows, { rooms: ['room-a', 'room-b'], from: '2026-11-02', to: '2026-11-08' });
  assert.equal(r.nights, 14);
  assert.deepEqual(r.rooms, { 'room-a': { nothing_listed: 6, mon_to_wed: 2 }, 'room-b': { nothing_listed: 6, mon_to_wed: 3 } });
  assert.equal(r.nothing_listed, 12);
  assert.equal(r.mon_to_wed, 5);
});
