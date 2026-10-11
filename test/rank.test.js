import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { REPO_ROOT } from '../server/config.js';
import { loadVenues } from '../server/calendar/venues.js';
import { createQlooClient } from '../server/qloo/client.js';
import { ablate } from '../server/rank/ablate.js';
import { alsoLoves, neutralSignal } from '../server/rank/lift.js';
import { buildPool, buildSignal, normalizeName, poolWindow, resolveName, splitHeadliner } from '../server/rank/pool.js';
import { contributions, rankByPopularity, rankByTags, rankPool, topN } from '../server/rank/rank.js';

const venues = await loadVenues(path.join(REPO_ROOT, 'test', 'fixtures', 'synthetic', 'venues'));
const room = venues.find((v) => v.id === 'example-room');
const hall = venues.find((v) => v.id === 'other-hall');
const NIGHT = '2026-11-04';
const fixtureClient = () => createQlooClient({ mode: 'fixture', fetchImpl: async () => assert.fail('no network in fixture mode') });

async function setup(client = fixtureClient()) {
  const sig = await buildSignal(client, room, { before: NIGHT });
  const signalIds = sig.signal.map((s) => s.entity_id);
  const pool = await buildPool(client, { venue: room, venues, date: NIGHT, excludeIds: signalIds });
  return { client, sig, signalIds, pool };
}

const sentAll = (calls) => calls.every((c) => c.sent !== false);

// ---- names and windows ----

test('normalizeName follows the back-test rule', () => {
  assert.equal(normalizeName('  The  Synthetic Act 1! '), 'synthetic act 1');
  assert.equal(normalizeName('Café Ensemble'), 'cafe ensemble');
  assert.equal(normalizeName('Theory Band'), 'theory band');
});

test('splitHeadliner cuts at the first billing separator', () => {
  assert.equal(splitHeadliner('Synthetic Act 3 with Synthetic Act 9'), 'Synthetic Act 3');
  assert.equal(splitHeadliner('Synthetic Act 3 ft. Someone & Others'), 'Synthetic Act 3');
  assert.equal(splitHeadliner('Synthetic Act 3'), null);
});

test('poolWindow: Monday-to-Sunday week and the 90/60 day season', () => {
  assert.deepEqual(poolWindow('2026-11-04', 'week'), { mode: 'week', from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(poolWindow('2026-11-08', 'week'), { mode: 'week', from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(poolWindow('2026-11-02', 'week'), { mode: 'week', from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(poolWindow('2026-11-04'), { mode: 'season', from: '2026-08-06', to: '2027-01-03' });
  assert.throws(() => poolWindow('2026-11-04', 'month'), RangeError);
});

test('resolveName: exact top match, split headliner, ambiguous and unknown', async () => {
  const c = fixtureClient();
  const exact = await resolveName(c, 'synthetic act 10');
  assert.equal(exact.status, 'resolved');
  assert.equal(exact.entity.entity_id, 'synthetic-artist-10');
  assert.equal(exact.step, 'title');
  const split = await resolveName(c, 'Synthetic Act 3 with Synthetic Act 9');
  assert.equal(split.status, 'resolved');
  assert.equal(split.entity.entity_id, 'synthetic-artist-3');
  assert.equal(split.step, 'split');
  const vague = await resolveName(c, 'Synthetic Act');
  assert.equal(vague.status, 'needs_input');
  assert.equal(vague.candidates.length, 3);
  const none = await resolveName(c, 'Nobody We Know');
  assert.equal(none.status, 'unresolved');
});

// ---- pool and signal ----

test('buildSignal: the room\'s own past headliners, most recent first, before the night', async () => {
  const { sig } = await setup();
  assert.equal(sig.signal.length, 6);
  assert.ok(sig.signal.every((s) => /^synthetic-artist-10[1-6]$/.test(s.entity_id)));
  assert.deepEqual(sig.counts, { shows: 52, names: 6, resolved: 6, needs_input: 0, unresolved: 0 });
  const early = await buildSignal(fixtureClient(), room, { before: '2026-07-03' });
  assert.equal(early.signal.length, 1);
});

test('buildPool: other rooms in the same city, season window, own past acts removed', async () => {
  const c = fixtureClient();
  const elsewhere = { ...hall, id: 'far-room', city: 'Otherville', shows: [{ date: NIGHT, headliner: 'Synthetic Act 5', source_url: 'https://example.org/x' }] };
  const { pool } = await setup(c);
  const again = await buildPool(c, { venue: room, venues: [...venues, elsewhere], date: NIGHT });
  assert.deepEqual(again.rooms, ['other-hall']);
  assert.deepEqual(pool.window, { mode: 'season', from: '2026-08-06', to: '2027-01-03' });
  assert.equal(pool.pool.length, 12);
  assert.ok(pool.pool.every((p) => /^synthetic-artist-([1-9]|1[0-2])$/.test(p.entity_id)), 'acts 101-106 played this room and are left out');
  assert.equal(pool.counts.excluded_own_past, 2);
  assert.equal(pool.counts.unresolved, 0);
  for (const p of pool.pool) {
    assert.ok(p.played.length > 0);
    assert.ok(p.played.every((x) => x.venue_id === 'other-hall' && x.date >= pool.window.from && x.date <= pool.window.to));
  }
  assert.ok(sentAll(pool.calls));
});

test('buildPool: week window keeps only that week\'s headliners', async () => {
  const week = await buildPool(fixtureClient(), { venue: room, venues, date: NIGHT, window: 'week' });
  assert.deepEqual(week.pool.map((p) => p.played.map((x) => x.date)).flat().sort(), ['2026-11-06', '2026-11-07']);
});

test('buildPool counts unresolved and ambiguous names', async () => {
  const odd = { ...hall, id: 'odd-hall', shows: [
    { date: NIGHT, headliner: 'Nobody We Know', source_url: 'https://example.org/1' },
    { date: NIGHT, headliner: 'Synthetic Act', source_url: 'https://example.org/2' },
    { date: NIGHT, headliner: 'Synthetic Act 4', source_url: 'https://example.org/3' },
  ], past_shows: [] };
  const r = await buildPool(fixtureClient(), { venue: room, venues: [room, odd], date: NIGHT });
  assert.equal(r.counts.unresolved, 1);
  assert.equal(r.counts.needs_input, 1);
  assert.equal(r.needs_input[0].candidates.length, 3);
  assert.deepEqual(r.pool.map((p) => p.entity_id), ['synthetic-artist-4']);
});

// ---- rankers ----

test('rankPool: one restricted insights call, sorted scores, explainability for every act', async () => {
  const { client, signalIds, pool } = await setup();
  const r = await rankPool(client, { signalIds, poolIds: pool.pool });
  assert.equal(r.method, 'filter.results.entities');
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].endpoint, '/v2/insights');
  assert.match(r.calls[0].params_masked['filter.results.entities'], /synthetic-artist-/);
  assert.equal(r.results.length, 12);
  r.results.forEach((x, i) => {
    assert.equal(x.rank, i + 1);
    assert.equal(typeof x.name, 'string');
    if (i) assert.ok(r.results[i - 1].score >= x.score);
  });
  for (const x of r.results) {
    const shares = r.explainability[x.entity_id];
    assert.ok(shares.every((s) => signalIds.includes(s.entity_id)));
    assert.ok(Math.abs(shares.reduce((t, s) => t + s.share, 0) - 1) < 0.01);
  }
});

test('rankPool falls back to take=200 + intersection when the restriction returns nothing', async () => {
  const { client, signalIds, pool } = await setup();
  const seen = [];
  const noRestrict = { ...client, insights: (p) => (seen.push(p), p['filter.results.entities'] ? client.insights({ ...p, 'filter.results.entities': 'synthetic-artist-999' }) : client.insights(p)) };
  const extra = [...pool.pool, { entity_id: 'synthetic-artist-404', name: 'Synthetic Act 404' }];
  const r = await rankPool(noRestrict, { signalIds, poolIds: extra });
  assert.equal(r.method, 'take-200-intersection');
  assert.equal(seen[1].take, 200);
  assert.equal(r.fallbacks.length, 1);
  assert.equal(r.results.length, 13);
  assert.deepEqual(r.results.at(-1), { entity_id: 'synthetic-artist-404', name: 'Synthetic Act 404', score: null, rank: 13 });
  assert.equal(topN(r.results, 20).length, 12, 'unscored members never reach the shortlist');
});

test('rankPool reports failure, an empty pool and a missing signal without throwing', async () => {
  const { client, signalIds, pool } = await setup();
  const broken = { ...client, insights: async () => ({ status: 'error', data: null, call: { endpoint: '/v2/insights', params_masked: {}, ms: 0, cache: 'miss' }, error: { code: 'http_503' } }) };
  const failed = await rankPool(broken, { signalIds, poolIds: pool.pool });
  assert.equal(failed.method, 'failed');
  assert.equal(failed.calls.length, 2);
  assert.equal((await rankPool(client, { signalIds, poolIds: [] })).method, 'empty-pool');
  assert.equal((await rankPool(client, { signalIds: [], poolIds: pool.pool })).error.code, 'no_signal');
});

test('rankPool passes the popularity ceiling and is answered from cache the second time', async () => {
  const { client, signalIds, pool } = await setup();
  const a = await rankPool(client, { signalIds, poolIds: pool.pool, popularityMax: 0.7 });
  assert.equal(a.calls[0].params_masked['filter.popularity.max'], '0.7');
  assert.ok(a.results.filter((x) => x.score !== null).length < 12);
  const b = await rankPool(client, { signalIds, poolIds: pool.pool, popularityMax: 0.7 });
  assert.equal(b.calls[0].cache, 'hit');
});

test('rankByPopularity orders the pool by popularity only', async () => {
  const { client, pool } = await setup();
  const r = await rankByPopularity(client, pool.pool);
  assert.equal(r.method, 'filter.results.entities');
  assert.deepEqual(topN(r.results, 3).map((x) => x.entity_id), ['synthetic-artist-5', 'synthetic-artist-10', 'synthetic-artist-3']);
  assert.equal(r.calls[0].params_masked['signal.interests.entities'], undefined);
});

test('rankByTags uses the tag signal and no entity signal', async () => {
  const { client, pool } = await setup();
  const r = await rankByTags(client, { tagIds: ['synthetic-tag-genre-a'], poolIds: pool.pool });
  assert.equal(r.results.length, 12);
  assert.equal(r.calls[0].params_masked['signal.interests.tags'], 'synthetic-tag-genre-a');
  assert.equal(r.calls[0].params_masked['signal.interests.entities'], undefined);
  assert.equal((await rankByTags(client, { tagIds: [], poolIds: pool.pool })).error.code, 'no_signal');
});

// ---- contributions ----

test('contributions: explainability field when present, leave-one-out otherwise', async () => {
  const { client, signalIds, pool } = await setup();
  const ranked = await rankPool(client, { signalIds, poolIds: pool.pool });
  const targets = topN(ranked.results).map((x) => x.entity_id);
  const ex = await contributions(client, { signalIds, poolIds: pool.pool, ranking: ranked, targetIds: targets });
  assert.equal(ex.method, 'explainability');
  assert.equal(ex.calls.length, 0);

  const plain = await rankPool(client, { signalIds, poolIds: pool.pool, explain: false });
  assert.deepEqual(plain.explainability, {});
  const loo = await contributions(client, { signalIds, poolIds: pool.pool, ranking: plain, targetIds: targets });
  assert.equal(loo.method, 'leave-one-out');
  assert.equal(loo.calls.length, signalIds.length, 'one call per signal act');
  for (const id of targets) {
    const c = loo.contributions[id];
    assert.ok(c.length > 0 && c.every((s) => signalIds.includes(s.entity_id) && s.share > 0));
    assert.ok(Math.abs(c.reduce((t, s) => t + s.share, 0) - 1) < 0.01);
  }
  // On the synthetic fixture both methods agree on the strongest contributor of the top act.
  assert.equal(loo.contributions[targets[0]][0].entity_id, ex.contributions[targets[0]][0].entity_id);
  const again = await contributions(client, { signalIds, poolIds: pool.pool, ranking: plain, targetIds: targets });
  assert.ok(again.calls.every((c) => c.cache === 'hit'), 'leave-one-out calls are cached');
  const capped = await contributions(client, { signalIds, poolIds: pool.pool, ranking: plain, targetIds: targets, maxSignals: 2 });
  assert.equal(capped.calls.length, 2);
  assert.match(capped.note, /2 most recent of 6/);
});

test('contributions with a single signal act give it the whole share', async () => {
  const { client, signalIds, pool } = await setup();
  const one = [signalIds[0]];
  const r = await rankPool(client, { signalIds: one, poolIds: pool.pool, explain: false });
  const c = await contributions(client, { signalIds: one, poolIds: pool.pool, ranking: r, targetIds: [r.results[0].entity_id] });
  assert.deepEqual(c.contributions[r.results[0].entity_id], [{ entity_id: one[0], share: 1 }]);
});

// ---- ablation ----

test('ablate: new top 5 and how many of 5 changed', async () => {
  const { client, signalIds, pool } = await setup();
  const base = await rankPool(client, { signalIds, poolIds: pool.pool, explain: false });
  const before = topN(base.results).map((x) => x.entity_id);
  let moved = 0;
  for (const sid of signalIds) {
    const a = await ablate(client, { signalIds, poolIds: pool.pool, removeIds: [sid, 'synthetic-artist-999'], baseline: base.results });
    assert.equal(a.of, 5);
    assert.equal(a.shortlist.length, 5);
    assert.deepEqual(a.removed, [sid]);
    assert.deepEqual(a.ignored, ['synthetic-artist-999']);
    assert.equal(a.changed, a.shortlist.filter((x) => !before.includes(x.entity_id)).length);
    assert.ok(!a.calls[0].params_masked['signal.interests.entities'].includes(sid));
    moved += a.changed;
  }
  assert.ok(moved > 0, 'switching off past shows moves the synthetic shortlist at least once');
  const self = await ablate(client, { signalIds, poolIds: pool.pool, removeIds: [] });
  assert.equal(self.changed, 0);
  const all = await ablate(client, { signalIds, poolIds: pool.pool, removeIds: signalIds });
  assert.equal(all.error.code, 'no_signal_left');
  assert.deepEqual(all.shortlist, []);
});

// ---- also loves ----

test('neutralSignal takes the same number of acts from each room', () => {
  assert.deepEqual(neutralSignal([['a', 'b', 'c'], ['d', 'e'], []]), ['a', 'b', 'd', 'e']);
  assert.deepEqual(neutralSignal([['a', 'b', 'c'], ['a', 'x', 'y']], { perRoom: 1 }), ['a']);
  assert.deepEqual(neutralSignal([]), []);
});

test('alsoLoves: category plus a lift range against the city average, never raw affinity', async () => {
  const { client, signalIds } = await setup();
  const hallSig = await buildSignal(client, hall, { before: NIGHT });
  const neutral = neutralSignal([signalIds, hallSig.signal.map((s) => s.entity_id)]);
  const r = await alsoLoves(client, { roomSignalIds: signalIds, neutralSignalIds: neutral });
  assert.equal(r.calls.length, 6, 'room and city call per type');
  assert.ok(r.also_loves.length >= 1);
  assert.equal(r.also_loves.length + r.fallbacks.length, 3);
  for (const row of r.also_loves) {
    assert.ok(['movie', 'place', 'brand'].includes(row.type));
    assert.match(row.category, /^Synthetic (Film|Place|Brand) Category \d$/);
    const [lo, hi] = row.lift_range;
    assert.ok(lo > 0 && lo <= hi && hi <= 1);
    assert.deepEqual(row.evidence.depths, [10, 20]);
    row.evidence.room_share.forEach((s, i) => assert.ok(s > row.evidence.city_share[i]));
  }
  assert.doesNotMatch(JSON.stringify(r.also_loves), /affinity/);
  assert.ok(sentAll(r.calls));
  const none = await alsoLoves(client, { roomSignalIds: signalIds, neutralSignalIds: signalIds });
  assert.deepEqual(none.also_loves, [], 'the same signal on both sides lifts nothing');
  assert.equal((await alsoLoves(client, { roomSignalIds: [], neutralSignalIds: neutral })).fallbacks.length, 1);
});
