// Study 2 tests (BACKTEST-2.md with Amendments 1-14). Synthetic data only: rows are generated here, Qloo is a hand-written stand-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseCsv } from '../server/backtest/data.js';
import { clusterBootstrap2, clusterMeans, nestedStratifiedBootstrap } from '../server/backtest/metrics.js';
import {
  MAX_CLUSTERS, assignPlacebos, checkData2, checkLnAeg, checkSample, countsForCoverage, coverageProblems, houseBookers, literalReading, localNight,
  nonMusicOutside, nonMusicWords, parsePerformers, parsePresenters, performerCandidate, placeboChains, sizeGroup, weekdayGroup,
} from '../server/backtest/study2-data.js';
import { dryRun2, literalStudy2, rankByPopularityFit, resolveHeadliner2, runStudy2 } from '../server/backtest/study2.js';
import { LOCK_NAME2, main2, parseArgs2 } from '../scripts/backtest2.js';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'dnd-bt2-'));
test.after(() => rm(tmp, { recursive: true, force: true }));

// ---------- local night (Amendment 3) ----------
test('local night: early-morning starts belong to the previous night, 00:00 and date-only keep the listed date', () => {
  const ny = 'America/New_York';
  assert.equal(localNight('2026-07-10', ny), '2026-07-10');
  assert.equal(localNight('2026-07-10T21:00', ny), '2026-07-10');
  assert.equal(localNight('2026-07-10 21:00:00', ny), '2026-07-10');
  assert.equal(localNight('2026-07-11T00:00', ny), '2026-07-11');
  assert.equal(localNight('2026-07-11T00:01', ny), '2026-07-10');
  assert.equal(localNight('2026-07-11T04:59', ny), '2026-07-10');
  assert.equal(localNight('2026-07-11T05:00', ny), '2026-07-11');
  assert.equal(localNight('2026-07-01T01:00', ny), '2026-06-30'); // crosses the S1/S2 line
  // UTC and offset times are converted to the venue's zone first
  assert.equal(localNight('2026-07-11T02:00:00Z', ny), '2026-07-10'); // 22:00 EDT
  assert.equal(localNight('2026-07-11T05:30:00Z', ny), '2026-07-10'); // 01:30 EDT
  assert.equal(localNight('2026-07-11T09:30:00Z', ny), '2026-07-11'); // 05:30 EDT
  assert.equal(localNight('2026-07-11T04:00:00Z', ny), '2026-07-11'); // exactly 00:00 EDT
  assert.equal(localNight('2026-07-10T20:00:00+0200', 'Europe/Amsterdam'), '2026-07-10');
  assert.equal(localNight('2026-07-11T01:30:00+02:00', 'Europe/London'), '2026-07-10'); // 00:30 BST
  assert.equal(localNight('2026-07-11T01:00:00+02:00', 'Europe/London'), '2026-07-11'); // exactly 00:00 BST
  // Amendment 12: written as exactly 00:00 with Z or an offset is a date with no time; the written date stays
  assert.equal(localNight('2026-07-01T00:00:00Z', ny), '2026-07-01');
  assert.equal(localNight('2026-07-01T00:00:00.000Z', ny), '2026-07-01');
  assert.equal(localNight('2026-07-11T00:00-04:00', ny), '2026-07-11');
  assert.equal(localNight('2026-07-01T00:00:01Z', ny), '2026-06-30'); // a real time: 20:00 EDT the day before
  assert.throws(() => localNight('July 10', ny), /unreadable/);
  assert.throws(() => localNight('2026-02-30', ny), /unreadable/);
  assert.throws(() => localNight('2026-07-10T25:00', ny), /unreadable/);
  assert.throws(() => localNight('2026-06-31T00:00:00Z', ny), /unreadable/);
  assert.throws(() => localNight('2026-07-10T20:00:00Z', 'Mars/Base'), /time zone/);
});

// ---------- words (Amendment 4) ----------
test('non-music words: whole words after normalization; coverage needs a title without them', () => {
  assert.deepEqual(nonMusicWords('Open-Mic Night'), ['open mic']);
  assert.deepEqual(nonMusicWords('COMEDY bang'), ['comedy']);
  assert.deepEqual(nonMusicWords('Classical Guitar Classics'), []);
  assert.deepEqual(nonMusicWords('Movie Night: Watch Party'), ['movie night', 'watch party']);
  assert.equal(countsForCoverage(''), false);
  assert.equal(countsForCoverage(' -- '), false);
  assert.equal(countsForCoverage('Karaoke'), false);
  assert.equal(countsForCoverage('Synthetic Act 1'), true);
  // run rule: only words outside the resolved name drop a row
  assert.deepEqual(nonMusicOutside('Synthetic Act 5 with Trivia Night', 'Synthetic Act 5'), ['trivia']);
  assert.deepEqual(nonMusicOutside('Class Actress', 'Class Actress'), []);
  assert.deepEqual(nonMusicOutside('Comedy Night', 'Synthetic Act 2'), ['comedy']); // a performer not in the title
});

test('performers: JSON list, first name that is not the venue, operator or building', () => {
  assert.deepEqual(parsePerformers(''), []);
  assert.deepEqual(parsePerformers('["A", " B "]'), ['A', 'B']);
  assert.throws(() => parsePerformers('A, B'), /JSON array/);
  assert.throws(() => parsePerformers('[1]'), /JSON array/);
  const venue = { name: 'The Synthetic Room', operator: 'Synthetic Presents', building: '' };
  assert.equal(performerCandidate(['Synthetic Room', 'synthetic presents!', 'Synthetic Act 9'], venue), 'Synthetic Act 9');
  assert.equal(performerCandidate(['Synthetic Room'], venue), null);
});

// ---------- venues and shows ----------
const VENUES_CSV = [
  'venue_id,name,operator,cluster,metro,tz,capacity,role,building,calendar_source',
  'room-a,Synthetic Room A,Operator A,op-a,Exampleville,America/New_York,300,test,,',
  'stage-a2,Synthetic Stage A2,Operator A,op-a,Exampleville,America/New_York,,test,,',
  'hall-p,Synthetic Room P,Operator P,op-p,Exampleville,America/New_York,1200,pool,,',
  'room-b,Synthetic Room B,Operator B,op-b,Otherville,America/Chicago,900,test,,',
  'hall-q,Synthetic Room Q,Operator Q,op-q,Otherville,America/Chicago,,pool,,',
].join('\n');
const TZ = {
  'room-a': 'America/New_York', 'stage-a2': 'America/New_York', 'hall-p': 'America/New_York', 'room-b': 'America/Chicago', 'hall-q': 'America/Chicago',
  'room-c': 'America/Chicago',
};
// The extra room of the "no signal" world: a test room with S2 shows and no S1 show.
const ROOM_C = 'room-c,Synthetic Room C,Operator C,op-c,Otherville,America/Chicago,,test,,';

const csvField = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
function showsCsv({ late = true, extra } = {}) {
  const rows = ['venue_id,start,date,title,performers,canceled,drop_reason,source_url,fetched_at,compiled_by,checked_by'];
  const add = (venue, start, title, { performers = '', canceled = 0, drop = '' } = {}) =>
    rows.push([venue, start, localNight(start, TZ[venue]), title, performers, String(canceled), drop, `https://example.org/${rows.length}`, '2026-10-14', 'test', ''].map(csvField).join(','));
  // S1 signals
  for (const n of [101, 102, 103]) add('room-a', '2026-04-10T20:00', `Synthetic Act ${n}`);
  for (const n of [104, 105]) add('stage-a2', '2026-05-02T20:00', `Synthetic Act ${n}`);
  for (const n of [106, 107, 108]) add('room-b', '2026-05-12T20:00', `Synthetic Act ${n}`);
  // Exampleville, week of Mon 2026-07-06
  for (let n = 1; n <= 12; n++) add('hall-p', '2026-07-10T20:00', `Synthetic Act ${n}`);
  add('room-a', '2026-07-07T20:00', 'Synthetic Act 1');
  add('room-a', '2026-07-08T21:00', 'Synthetic Act 2 with Guests'); // split
  add('room-a', '2026-07-09T01:30', 'Synthetic Act 3'); // night of 07-08
  add('room-a', '2026-07-09T20:00', 'A Night Of Synthetic Comedy'); // unresolved (the word does not matter then)
  add('room-a', '2026-07-11T20:00', 'Synthetic Act 101'); // repeat headliner
  add('room-a', '2026-07-12T20:00', 'Synthetic Act 4', { canceled: 1 });
  add('room-a', '2026-07-13T20:00', ''); // untitled
  add('room-a', '2026-07-14T20:00', 'Synthetic Act 5 with Trivia Night'); // non-music
  add('room-a', '2026-07-15T20:00', 'Synthetic Act 6', { drop: 'off-site' });
  add('room-a', '2026-07-16T20:00', 'Summer Kickoff Party', { performers: JSON.stringify(['Synthetic Room A', 'Synthetic Act 7']) }); // performer
  add('stage-a2', '2026-07-09T20:00', 'Synthetic Act 8');
  // Exampleville, late August: too few acts
  add('stage-a2', '2026-08-25T20:00', 'Synthetic Act 20');
  add('hall-p', '2026-08-26T20:00', 'Synthetic Act 21');
  // Otherville: its own pool, never mixed with Exampleville
  for (let n = 30; n <= 41; n++) add('hall-q', '2026-07-10T20:00', `Synthetic Act ${n}`);
  add('room-b', '2026-07-10T04:30:00Z', 'Synthetic Act 30'); // 23:30 CDT on 07-09
  if (late) {
    add('room-b', '2026-09-29T20:00', 'Synthetic Act 42'); // window cut at 09-30
    for (let n = 43; n <= 52; n++) add('hall-q', '2026-09-30T20:00', `Synthetic Act ${n}`);
    for (let n = 53; n <= 57; n++) add('hall-q', '2026-10-02T20:00', `Synthetic Act ${n}`); // after the cut
  }
  extra?.(add);
  return rows.join('\n');
}
const syntheticData = (opts, venuesCsv = VENUES_CSV) => checkData2({ venues: parseCsv(venuesCsv), shows: parseCsv(showsCsv(opts)) });

async function syntheticDir(name) {
  const dir = path.join(tmp, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'venues.csv'), VENUES_CSV);
  await writeFile(path.join(dir, 'shows.csv'), showsCsv());
  return dir;
}

test('data check: schema, Minneapolis-St Paul out, another cluster in the metro, local night matches start', () => {
  const venues = parseCsv(VENUES_CSV);
  const ok = checkData2({ venues, shows: [] });
  assert.equal(ok.venues.length, 5);
  const bad = (patch, re) => assert.throws(() => checkData2({ venues: venues.map((v, i) => (i === 0 ? { ...v, ...patch } : v)), shows: [] }), re);
  bad({ tz: 'Nowhere/City' }, /IANA/);
  bad({ role: 'placebo' }, /role/);
  bad({ capacity: '3,000' }, /capacity/);
  bad({ metro: 'Minneapolis-St Paul' }, /excluded/);
  bad({ metro: 'Saint Paul' }, /excluded/);
  bad({ name: 'The Hideout', metro: 'Chicago' }, /Study 1 room/);
  bad({ name: 'Black Cat', metro: 'Washington, DC' }, /Study 1 room/);
  bad({ cluster: '' }, /cluster is required/);
  // a test room whose metro has only its own cluster
  assert.throws(() => checkData2({ venues: venues.filter((v) => v.venue_id !== 'hall-q'), shows: [] }), /room-b has no eligible venue of another cluster/);
  const row = { venue_id: 'room-a', start: '2026-07-09T01:30', date: '2026-07-09', title: 'x', performers: '', canceled: '0', drop_reason: '' };
  assert.throws(() => checkData2({ venues, shows: [row] }), /not the local night/);
  assert.equal(checkData2({ venues, shows: [{ ...row, date: '2026-07-08' }] }).shows[0].row, 2);
  assert.throws(() => checkData2({ venues, shows: [{ ...row, date: '2026-07-08', drop_reason: 'duplicate' }] }), /drop_reason/);
  assert.throws(() => checkData2({ venues, shows: [{ ...row, start: '2026-02-30', date: '2026-02-30' }] }), /real YYYY-MM-DD/);
  assert.throws(() => checkData2({ venues, shows: [{ ...row, date: '2026-07-08', performers: 'x' }] }), /performers/);
  assert.throws(() => checkData2({ venues, shows: [{ ...row, venue_id: 'nope' }] }), /unknown venue/);
});

test('data check: the cap counts clusters with a test room, in file order; capped rooms stay in the pools', () => {
  const venues = [{ venue_id: 'pool-first', name: 'Synthetic Pool First', operator: 'op-z', cluster: 'cz', metro: 'M0', tz: 'UTC', capacity: '', role: 'pool' }];
  for (let c = 0; c < MAX_CLUSTERS + 2; c++) {
    for (const [k, role] of [['t', 'test'], ['p', 'pool']]) {
      venues.push({ venue_id: `${k}${c}`, name: `Synthetic ${k}${c}`, operator: `op${c}${k}`, cluster: `c${c}${k}`, metro: `M${c % 2}`, tz: 'UTC', capacity: '', role });
    }
  }
  const out = checkData2({ venues, shows: [] });
  assert.equal(out.venues.length, venues.length, 'every listed venue is kept for the pools');
  const tests = out.venues.filter((v) => v.role === 'test');
  assert.equal(new Set(tests.map((v) => v.cluster)).size, MAX_CLUSTERS, 'a pool-only cluster listed first does not use up the cap');
  assert.deepEqual(out.capped, { clusters: 2, test_rooms: 2 });
  assert.deepEqual(out.venues.filter((v) => v.capped).map((v) => [v.venue_id, v.role]), [[`t${MAX_CLUSTERS}`, 'pool'], [`t${MAX_CLUSTERS + 1}`, 'pool']]);
  // a capped room's shows are still read and checked
  const row = { venue_id: `t${MAX_CLUSTERS}`, start: '2026-07-10T20:00', date: '2026-07-10', title: 'x', performers: '', canceled: '0', drop_reason: '' };
  assert.equal(checkData2({ venues, shows: [row] }).shows.length, 1);
});

test('coverage (Amendment 12): roles must match shows.csv; a venue is eligible when its rooms together meet coverage', () => {
  const venues = [
    { venue_id: 'main', role: 'test', building: 'Synthetic Hall', metro: 'M' },
    { venue_id: 'side', role: 'pool', building: 'Synthetic Hall', metro: 'M' },
    { venue_id: 'two-a', role: 'pool', building: 'Synthetic Two', metro: 'M' },
    { venue_id: 'two-b', role: 'pool', building: 'Synthetic Two', metro: 'M' },
    { venue_id: 'lone', role: 'pool', building: '', metro: 'M' },
  ];
  const shows = [];
  const add = (id, period, n, extra = {}) => {
    for (let i = 0; i < n; i++) shows.push({ venue_id: id, date: period === 'S1' ? '2026-05-01' : '2026-08-01', title: `Synthetic Act ${i}`, canceled: '0', drop_reason: '', ...extra });
  };
  add('main', 'S1', 20);
  add('main', 'S2', 19);
  add('main', 'S2', 3, { canceled: '1' }); // canceled rows do not count
  add('main', 'S2', 2, { drop_reason: 'off-site' });
  add('side', 'S1', 5);
  add('side', 'S2', 5);
  add('two-a', 'S1', 12);
  add('two-a', 'S2', 12);
  add('two-b', 'S1', 9);
  add('two-b', 'S2', 9);
  add('lone', 'S1', 25);
  add('lone', 'S2', 25);
  const p = coverageProblems(venues, shows);
  assert.equal(p.length, 2, p.join('\n'));
  assert.match(p[0], /test room main is below coverage .*S2 19/);
  assert.match(p[1], /pool room lone meets coverage by itself/);
  add('main', 'S2', 1, { title: 'Synthetic Karaoke' }); // a word row does not count either
  assert.equal(coverageProblems(venues, shows).length, 2);
  add('main', 'S2', 1);
  assert.deepEqual(coverageProblems(venues, shows).map((x) => x.split(' ')[2]), ['lone']);
  // two-a and two-b are below 20 each but their venue has 21 and 21: both may stay pool rooms; a venue below 20 is out
  assert.match(coverageProblems(venues.filter((v) => v.venue_id !== 'two-b'), shows)[1], /venue of two-a is below coverage/);
});

test('placebo rooms: seeded, from another metro and another cluster, refused when there is none', () => {
  const venues = parseCsv(VENUES_CSV);
  const a = assignPlacebos(venues);
  assert.deepEqual(a, assignPlacebos(venues));
  assert.deepEqual(Object.keys(a).sort(), ['room-a', 'room-b', 'stage-a2']);
  assert.equal(a['room-a'], 'room-b');
  assert.equal(a['stage-a2'], 'room-b');
  assert.ok(['room-a', 'stage-a2'].includes(a['room-b']));
  const many = Array.from({ length: 9 }, (_, i) => ({ venue_id: `v${i}`, metro: `M${i % 3}`, cluster: `c${i}`, role: 'test' }));
  const m = assignPlacebos(many);
  for (const [t, p] of Object.entries(m)) {
    const [tv, pv] = [many.find((v) => v.venue_id === t), many.find((v) => v.venue_id === p)];
    assert.notEqual(tv.metro, pv.metro);
  }
  assert.ok(new Set(Object.values(m)).size > 1, 'placebos spread over rooms');
  assert.throws(() => assignPlacebos(venues.filter((v) => v.metro === 'Exampleville')), /no placebo room/);
  // a cluster that spans two metros: its other room is never a candidate, nor is a room of the same metro
  const span = [
    { venue_id: 'a1', metro: 'M1', cluster: 'A', role: 'test' }, { venue_id: 'a2', metro: 'M2', cluster: 'A', role: 'test' },
    { venue_id: 'b2', metro: 'M2', cluster: 'B', role: 'test' }, { venue_id: 'c1', metro: 'M1', cluster: 'C', role: 'test' },
    { venue_id: 'd3', metro: 'M3', cluster: 'D', role: 'test' }, { venue_id: 'p3', metro: 'M3', cluster: 'E', role: 'pool' },
  ];
  const chains = placeboChains(span);
  assert.deepEqual(chains['a1'].slice().sort(), ['b2', 'd3']);
  assert.deepEqual(chains['a2'].slice().sort(), ['c1', 'd3']);
  assert.deepEqual(chains['d3'].slice().sort(), ['a1', 'a2', 'b2', 'c1']);
  assert.ok(Object.values(chains).every((c) => !c.includes('p3')), 'pool rooms are never placebos');
  assert.deepEqual(assignPlacebos(span), Object.fromEntries(Object.entries(chains).map(([k, c]) => [k, c[0]])));
});

test('check sample: 10% of the rows, seed 3, sorted line numbers, stable', () => {
  const s = checkSample(95);
  assert.equal(s.length, 10);
  assert.deepEqual(s, checkSample(95));
  assert.deepEqual(s, [...s].sort((x, y) => x - y));
  assert.ok(s.every((x) => x >= 2 && x <= 96));
  assert.notDeepEqual(s, checkSample(95, { seed: 4 }));
  assert.deepEqual(checkSample([5, 9, 12]), checkSample([5, 9, 12]));
  assert.equal(checkSample([5, 9, 12]).length, 1);
});

test('size and weekday groups', () => {
  assert.equal(sizeGroup({ capacity: '650' }), 'small');
  assert.equal(sizeGroup({ capacity: '651' }), 'large');
  assert.equal(sizeGroup({ capacity: '' }), 'unknown');
  assert.equal(weekdayGroup('2026-07-06'), 'mon_wed'); // Monday
  assert.equal(weekdayGroup('2026-07-08'), 'mon_wed'); // Wednesday
  assert.equal(weekdayGroup('2026-07-09'), 'thu_sun'); // Thursday
  assert.equal(weekdayGroup('2026-07-12'), 'thu_sun'); // Sunday
});

// ---------- metrics with clusters (Amendment 1) ----------
test('cluster metrics: rooms averaged inside a cluster, clusters weighted equally', () => {
  const v = { a1: [1, 1], a2: [0], b: [0.5] };
  const clusterOf = (r) => (r.startsWith('a') ? 'A' : 'B');
  assert.deepEqual(clusterMeans(v, clusterOf), { A: [0.5], B: [0.5] });
  const iv = clusterBootstrap2(v, clusterOf, { reps: 300, seed: 1 });
  assert.deepEqual(iv, { mean: 0.5, lo: 0.5, hi: 0.5 });
  const nested = nestedStratifiedBootstrap({ a1: [1, 0], a2: [0.5], b: [0.25] }, clusterOf, { reps: 300, seed: 1 });
  assert.equal(nested.mean, (0.5 + 0.25) / 2);
  assert.ok(nested.lo <= nested.mean && nested.mean <= nested.hi);
});

// ---------- headliner rule with a performer field (Amendment 2) and P2 (Amendment 5) ----------
test('headliner rule: performer, then title, then split; first exact match wins', async () => {
  const known = { 'Synthetic Act 7': { entity_id: 'synthetic-artist-7', name: 'Synthetic Act 7', popularity: 0.1 }, 'Synthetic Act 2': { entity_id: 'synthetic-artist-2', name: 'Synthetic Act 2' } };
  const asked = [];
  const topOf = async (q) => {
    asked.push(q);
    return known[q] ?? (q === 'boom' ? { error: { code: 'http_500' } } : null);
  };
  const p = await resolveHeadliner2(topOf, { title: 'Summer Party', candidate: 'Synthetic Act 7' });
  assert.deepEqual([p.status, p.step, p.query, p.entity.popularity], ['resolved', 'performer', 'Synthetic Act 7', 0.1]);
  const s = await resolveHeadliner2(topOf, { title: 'Synthetic Act 2 with Guests', candidate: 'Unknown Act' });
  assert.deepEqual([s.step, s.query], ['split', 'Synthetic Act 2']);
  assert.deepEqual(asked.slice(-3), ['Unknown Act', 'Synthetic Act 2 with Guests', 'Synthetic Act 2']);
  assert.equal((await resolveHeadliner2(topOf, { title: 'Nobody' })).status, 'unresolved');
  assert.equal((await resolveHeadliner2(topOf, { title: 'boom' })).status, 'error');
});

test('P2: closest to the room median first, ties to the more popular act, no popularity last', () => {
  const pool = [
    { entity_id: 'a', popularity: 0.3 }, { entity_id: 'b', popularity: 0.7 }, { entity_id: 'c', popularity: 0.5 },
    { entity_id: 'd', popularity: null }, { entity_id: 'e', popularity: 0.9 }, { entity_id: 'f', popularity: 0.7 },
  ];
  const r = rankByPopularityFit(pool, 0.5);
  assert.deepEqual(r.order, ['c', 'b', 'f', 'a', 'e', 'd']);
  assert.deepEqual([r.scored, r.tied_distance, r.tied_both], [5, 3, 2]);
  assert.equal(rankByPopularityFit(pool, NaN), null);
});

// ---------- the run ----------
const ARTIST_RE = /^Synthetic Act (\d+)$/i;
function fakeClient({ affinity = () => 0.5, failOn, popularity = (n) => (n % 50) / 50 } = {}) {
  const calls = [];
  const env = (entities) => ({ status: entities.length ? 'ok' : 'empty', data: { results: { entities } }, call: { cache: 'miss' } });
  const entity = (n) => ({
    entity_id: `synthetic-artist-${n}`, name: `Synthetic Act ${n}`, popularity: popularity(Number(n)),
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
      return env([]);
    },
    async insights(params) {
      calls.push({ endpoint: '/v2/insights', params });
      const only = params['filter.results.entities'];
      const ids = only ? [...only] : Array.from({ length: 60 }, (_, i) => `synthetic-artist-${i + 1}`);
      return env(ids.map((id) => ({ ...entity(id.split('-').pop()), query: { affinity: affinity(id, params) } })));
    },
  };
}
const byNumber = (id) => 1 - Number(id.split('-').pop()) / 100; // act 1 first, then 2, 3, ...

test('dry run: coverage after the word rule, compile drops and the placebo assignment, with no Qloo call', () => {
  const out = dryRun2(syntheticData());
  const a = out.rooms.find((r) => r.venue_id === 'room-a');
  assert.deepEqual(a.coverage, { S1: 3, S2: 5 });
  assert.equal(a.meets_coverage, false);
  assert.deepEqual([a.canceled.S2, a.off_site.S2, a.untitled.S2, a.with_non_music_word.S2, a.performer_field], [1, 1, 1, 2, 1]);
  assert.equal(out.clusters, 2);
  assert.equal(out.test_rooms, 3);
  assert.deepEqual(out.metros, ['Exampleville', 'Otherville']);
  assert.equal(out.placebo.seed, 2);
  assert.equal(out.placebo.assignment['room-a'], 'room-b');
  assert.ok(out.pool_candidates_by_window.every((w) => w.metro === 'Exampleville' || w.metro === 'Otherville'));
  assert.ok(out.test_rooms_below_coverage.includes('room-a'));
  assert.ok(out.coverage_problems.some((x) => /test room room-a is below coverage/.test(x)));
  assert.equal(out.windows_cut, 1);
  assert.equal(a.same_night_same_title, 0);
  assert.equal(out.check_sample_rows, Math.ceil(syntheticData().shows.length / 10));
});

test('run: metro pools, clusters, every drop by reason, pilot 2 label, totals only in the output', async () => {
  const c = fakeClient({ affinity: byNumber });
  const events = [];
  await assert.rejects(runStudy2({ client: c, data: syntheticData(), restrict: 'filter' }), (err) => err.code === 'coverage' && /room-a/.test(err.message));
  assert.equal(c.calls.length, 0, 'the coverage check comes before any Qloo call');
  const out = await runStudy2({ client: c, data: syntheticData(), restrict: 'filter', reps: 300, log: (e) => events.push(e), now: () => 0, minCoverage: 0 });
  assert.equal(out.status, 'pilot 2');
  assert.equal(out.label, 'pilot 2 (N = 2 clusters, 3 rooms, n = 7 shows)');
  assert.deepEqual(out.dropped, {
    canceled: 1, 'off-site': 1, untitled: 1, unresolved: 1, 'non-music': 1, no_signal: 0, repeat_headliner: 1, duplicate: 0, small_pool: 1,
  });
  assert.equal(out.resolution.performer, 1);
  assert.equal(out.resolution.split >= 1, true);
  // cluster op-a: room A (acts 1, 2, 3, 7 at ranks 1, 2, 3, 7) and stage A2 (act 8 at rank 8); cluster op-b: both shows at rank 1
  const roomA = (1 + 1 / 2 + 1 / 3 + 1 / 7) / 4;
  assert.equal(out.rankers.Q.mrr.mean, Math.round((((roomA + 1 / 8) / 2 + 1) / 2) * 1e4) / 1e4);
  assert.match(out.interval.caveat, /Only 2 clusters/);
  assert.ok(out.rankers.Q.mrr_within_rooms);
  // pools stay inside the metro: Exampleville pools hold acts 1-12 only, Otherville 30-41 and 42-52
  const per = Object.fromEntries(out.per_room.map((r) => [r.venue_id, r]));
  assert.equal(per['room-a'].pool_size.max, 12);
  assert.deepEqual([per['room-b'].pool_size.min, per['room-b'].pool_size.max], [11, 12]);
  assert.equal(out.pool_window.cut_shows_scored, 1);
  assert.equal(out.pool_window.cut_windows, 1);
  assert.deepEqual([out.popularity_missing.positives, out.popularity_missing.pool_members], [0, 0]);
  // Amendment 7: other pool acts at the same room, then at the same cluster (stage A2's act 8)
  assert.deepEqual([per['room-a'].same_room_acts_median, per['room-a'].same_cluster_acts_median], [3, 4]);
  // placebo from the other metro; with this stand-in the signal changes nothing, so Q - placebo is 0
  assert.equal(per['room-a'].placebo, 'room-b');
  assert.deepEqual([out.differences['Q-placebo'].lo, out.differences['Q-placebo'].hi], [0, 0]);
  assert.equal(out.claim.used, false);
  assert.deepEqual(out.claim.checks, { rooms_and_shows: false, q_minus_p_above_0: out.claim.checks.q_minus_p_above_0, q_minus_placebo_above_0: false });
  // P2 runs and reports ties; the stage has no place entity, so the venue variant covers the two other rooms only
  assert.equal(out.rankers.P2.status, 'run');
  assert.ok('share_tied_distance' in out.rankers.P2.ties);
  assert.deepEqual([out.rankers.Qvenue.status, out.rankers.Qvenue.rooms], ['run', 2]);
  assert.deepEqual([out.differences['Qvenue-Q'].rooms, out.differences['Q-P'].rooms], [2, 3]);
  assert.equal(out.rankers.L.status, 'not run');
  assert.deepEqual(out.differences['Q-L'], { status: 'not run' });
  assert.equal(out.other_sentences.q_beats_l, false);
  assert.equal(typeof out.rankers.Q.top5_popularity_median, 'number');
  // Amendment 8 splits
  assert.deepEqual([out.splits.small.rooms, out.splits.large.rooms, out.splits.size_unknown_rooms], [1, 1, 1]);
  assert.deepEqual([out.splits.mon_wed.shows, out.splits.thu_sun.shows], [4, 3]);
  assert.ok(out.splits.resolution_by_size.small.rows > 0);
  // the stand-in Qloo never saw an Otherville act in an Exampleville request
  const ranked = (x) => x.endpoint === '/v2/insights' && x.params['filter.results.entities'] && (x.params['signal.interests.entities'] || x.params['signal.interests.tags']);
  for (const call of c.calls.filter(ranked)) {
    const nums = call.params['filter.results.entities'].map((id) => Number(id.split('-').pop()));
    const otherville = (n) => n >= 30 && n < 100; // Exampleville acts are 1-21 and its rooms' repeat bookings (101)
    assert.ok(nums.every(otherville) || !nums.some(otherville), 'one metro per pool');
  }
  // nothing from Qloo or about single acts in the output or the log
  for (const text of [JSON.stringify(out), JSON.stringify(events)]) {
    assert.doesNotMatch(text, /synthetic-artist|Synthetic Act|synthetic-place|synthetic-genre/);
  }
  assert.equal(events[0].event, 'placebo');
  const again = await runStudy2({ client: fakeClient({ affinity: byNumber }), data: syntheticData(), restrict: 'filter', reps: 300, now: () => 0, minCoverage: 0 });
  assert.deepEqual(again, out);
});

test('run: L once per room and window; a Qloo error stops the run', async () => {
  const llm = {
    model: 'stand-in', sampling: 'stand-in',
    async rank({ poolNames }) {
      return { order: poolNames.map((_, i) => i), complete: true, usd: 0.01 };
    },
  };
  const ok = await runStudy2({ client: fakeClient(), data: syntheticData(), restrict: 'take500', llm, reps: 200, minCoverage: 0 });
  assert.equal(ok.rankers.L.status, 'run');
  assert.equal(ok.rankers.L.usd, 0.05); // room A: 2 windows, stage A2: 1, room B: 2
  assert.equal(typeof ok.differences['Q-L'].mean, 'number');
  await assert.rejects(runStudy2({ client: fakeClient({ failOn: 'Synthetic Act 5' }), data: syntheticData(), restrict: 'filter', minCoverage: 0 }), /headliner search failed/);
});

test('run: a room with no signal, a placebo signal kept outside the pool, one unit per act and night (Amendment 12)', async () => {
  const extra = (add) => {
    add('room-c', '2026-07-10T20:00', 'Synthetic Act 60'); // test room with no S1 show
    add('room-c', '2026-07-11T20:00', 'Synthetic Act 61');
    add('hall-p', '2026-07-10T21:00', 'Synthetic Act 106'); // room B's S1 headliner plays the Exampleville pool
    add('room-a', '2026-07-07T23:00', 'Synthetic Act 1'); // the late set of the same act on the same night
  };
  const data = syntheticData({ extra }, `${VENUES_CSV}\n${ROOM_C}`);
  assert.deepEqual(placeboChains(data.venues)['stage-a2'], ['room-c', 'room-b']);
  const c = fakeClient({ affinity: byNumber });
  const out = await runStudy2({ client: c, data, restrict: 'filter', reps: 200, now: () => 0, minCoverage: 0 });
  assert.equal(out.label, 'pilot 2 (N = 2 clusters, 3 rooms, n = 7 shows)');
  assert.deepEqual([out.dropped.no_signal, out.dropped.duplicate], [2, 1]);
  // Q and the placebo still run for every tested room
  assert.deepEqual([out.rankers.Q.status, out.rankers.placebo.status, out.rankers.placebo.rooms], ['run', 'run', 3]);
  // stage A2's first candidate has no signal, so its one window moves to room B
  const per = Object.fromEntries(out.per_room.map((r) => [r.venue_id, r]));
  assert.deepEqual([per['stage-a2'].placebo, per['stage-a2'].placebo_fallback_windows, per['room-c'].shows], ['room-c', 1, 0]);
  assert.equal(out.placebo.fallback_windows, 1);
  assert.equal(out.placebo.no_placebo_windows, 0);
  // act 106 left room B's signal in the three Exampleville windows that hold it (room A: 2, stage A2: 1)
  assert.equal(out.placebo.signal_acts_removed, 3);
  // no ranking call ever had a pool member in its signal
  for (const call of c.calls.filter((x) => x.endpoint === '/v2/insights' && x.params['signal.interests.entities'] && x.params['filter.results.entities'])) {
    const pool = new Set(call.params['filter.results.entities']);
    assert.ok(call.params['signal.interests.entities'].every((id) => !pool.has(id)), 'signal and pool overlap');
  }
});

// ---------- a world big enough for the claim thresholds ----------
// 8 metros. Each has two one-room venues of their own clusters (test rooms, 22 S1 and 46 S2 shows) and one venue with two
// stages of a third cluster (pool rooms, 12 and 12 shows a period: below 20 each, 24 together). Act numbers say where an act
// plays: 1mrkk = S1 at test room r of metro m, 2mrkk = S2 at that room, 3mskk = stage s of metro m's pool venue.
const BIG_START = { S1: '2026-04-01', S2: '2026-07-01' };
const dayAfter = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const actNo = (kind, m, r, k) => kind * 10000 + m * 1000 + r * 500 + k;
const homeOf = (n) => ({ kind: Math.floor(n / 10000), room: Math.floor((n % 10000) / 500), k: n % 500 });
function bigWorld() {
  const venues = ['venue_id,name,operator,cluster,metro,tz,capacity,role,building,calendar_source'];
  const shows = ['venue_id,start,date,title,performers,canceled,drop_reason,source_url,fetched_at,compiled_by,checked_by'];
  const add = (venue, date, n) => shows.push([venue, `${date}T20:00`, date, `Synthetic Act ${n}`, '', '0', '', 'https://example.org/x', '2026-10-14', 'test', ''].join(','));
  for (let m = 0; m < 8; m++) {
    for (const r of [0, 1]) {
      venues.push(`t${m}${r},Synthetic Test ${m}${r},Operator ${m}${r},c${m}${r},Metro ${m},UTC,${r ? 900 : 300},test,,`);
      for (let k = 0; k < 22; k++) add(`t${m}${r}`, dayAfter(BIG_START.S1, 4 * k + r), actNo(1, m, r, k));
      for (let k = 0; k < 46; k++) add(`t${m}${r}`, dayAfter(BIG_START.S2, 2 * k + r), actNo(2, m, r, k));
    }
    for (const st of [0, 1]) {
      venues.push(`p${m}${st},Synthetic Pool ${m}${st},Operator P${m},c${m}p,Metro ${m},UTC,,pool,Synthetic Pool Hall ${m},`);
      for (let k = 0; k < 12; k++) add(`p${m}${st}`, dayAfter(BIG_START.S1, 7 * k + st * 3), actNo(3, m, st, k));
      for (let k = 0; k < 12; k++) add(`p${m}${st}`, dayAfter(BIG_START.S2, 7 * k + st * 3), actNo(3, m, st, 100 + k));
    }
  }
  return { venues: venues.join('\n'), shows: shows.join('\n') };
}
const big = bigWorld();
const bigData = () => checkData2({ venues: parseCsv(big.venues), shows: parseCsv(big.shows) });
const numOf = (id) => Number(id.split('-').pop());
const signalOf = (params) => params['signal.interests.entities'];

test('big world: data meets coverage; "full" when Q beats P and the placebo', async () => {
  const data = bigData();
  assert.deepEqual(coverageProblems(data.venues, data.shows), []);
  // Q: an act scores high when it plays the signal's own room in S2 (the room's crowd); the placebo's room is elsewhere
  const affinity = (id, params) => {
    const sig = signalOf(params);
    if (!sig) return 0.5;
    const a = homeOf(numOf(id));
    const room = homeOf(numOf(sig[0])).room;
    return a.kind === 2 && a.room === room ? 0.9 - a.k / 1000 : 0.1;
  };
  const out = await runStudy2({ client: fakeClient({ affinity }), data, restrict: 'filter', reps: 500, now: () => 0 });
  assert.ok(out.clusters >= 8 && out.shows >= 300, out.label);
  assert.equal(out.status, 'full', JSON.stringify(out.claim.checks));
  assert.match(out.label, /^full \(N = 16 clusters, 16 rooms, n = \d+ shows\)$/);
  assert.equal(out.claim.used, true);
  assert.equal(out.gain_reading, null);
  assert.equal(out.interval.caveat, null);
});

test('big world: "study 2" when the thresholds are met but the intervals are not', async () => {
  const out = await runStudy2({ client: fakeClient(), data: bigData(), restrict: 'filter', reps: 300, now: () => 0 });
  assert.equal(out.status, 'study 2');
  assert.match(out.label, /^study 2 \(N = 16 clusters/);
  assert.deepEqual([out.claim.checks.rooms_and_shows, out.claim.checks.q_minus_placebo_above_0], [true, false]);
  assert.equal(out.claim.used, false);
});

test('big world: Q beats P but not the placebo, and the write-up says the gain is not the room\'s crowd', async () => {
  // affinity ignores the signal (test rooms' S2 acts first), so Q and the placebo rank alike; P puts the pool stages first
  const affinity = (id) => {
    const a = homeOf(numOf(id));
    return a.kind === 2 ? 0.9 - a.k / 1000 : 0.1;
  };
  const popularity = (n) => (homeOf(n).kind === 3 ? 0.9 : 0.1);
  const out = await runStudy2({ client: fakeClient({ affinity, popularity }), data: bigData(), restrict: 'filter', reps: 500, now: () => 0 });
  assert.deepEqual([out.claim.checks.q_minus_p_above_0, out.claim.checks.q_minus_placebo_above_0], [true, false], JSON.stringify(out.differences));
  assert.equal(out.status, 'study 2');
  assert.match(out.gain_reading, /general taste-graph structure/);
});

// ---------- literal reading (Amendment 14) ----------
const LIT_VENUES = [
  'venue_id,name,operator,cluster,metro,tz,capacity,role,building,calendar_source',
  'x-room1,Synthetic X1,Operator X1,c-x1,Xville,America/New_York,,test,,',
  'x-room2,Synthetic X2,Operator X2,c-x2,Xville,America/New_York,,test,,',
  'x-hall,Synthetic X Hall,Operator X3,c-x3,Xville,America/New_York,,pool,,',
  'y-room1,Synthetic Y1,Operator Y1,c-y1,Yville,America/Chicago,,test,,',
  'y-room2,Synthetic Y2,Operator Y2,c-y2,Yville,America/Chicago,,test,,',
  'z-room1,Synthetic Z1,Operator Z1,c-z1,Zville,America/Denver,,test,Synthetic Building,',
  'z-room2,Synthetic Z2,Operator Z1,c-z1,Zville,America/Denver,,pool,Synthetic Building,',
  'z-room3,Synthetic Z3,Operator Z3,c-z3,Zville,America/Denver,,test,,',
].join('\n');
const LIT_TZ = { x: 'America/New_York', y: 'America/Chicago', z: 'America/Denver' };
function literalShows(extra = () => {}) {
  const rows = ['venue_id,start,date,title,performers,canceled,drop_reason,source_url,fetched_at,compiled_by,checked_by,presented_by'];
  const add = (venue, start, title, presentedBy = [], { canceled = 0, drop = '' } = {}) =>
    rows.push(
      [venue, start, localNight(start, LIT_TZ[venue[0]]), title, '', String(canceled), drop, `https://example.org/${rows.length}`, '2026-10-15', 'test', '', presentedBy.length ? JSON.stringify(presentedBy) : '']
        .map(csvField)
        .join(','),
    );
  for (const v of ['x-room1', 'x-room2', 'x-hall', 'y-room1', 'y-room2', 'z-room1', 'z-room2', 'z-room3']) {
    add(v, '2026-05-05T20:00', `Synthetic Act ${v} S1`);
    add(v, '2026-08-05T20:00', `Synthetic Act ${v} S2`);
  }
  add('y-room1', '2026-05-06T20:00', 'Synthetic Act 201', ['Shared Promotions']);
  add('y-room2', '2026-08-06T20:00', 'Synthetic Act 202', ['shared promotions!']); // same company after normalization
  add('x-room2', '2026-05-07T20:00', 'Synthetic Act 203', ['Synthetic Nation Clubs']);
  add('z-room2', '2026-08-07T20:00', 'Synthetic Act 204', ['Building Owner Group']);
  // presenters on rows that do not count make no operator: canceled, off-site, untitled, non-music, outside S1 and S2
  add('z-room1', '2026-05-08T20:00', 'Synthetic Act 205', ['Edge Presents'], { canceled: 1 });
  add('z-room1', '2026-05-09T20:00', 'Synthetic Act 206', ['Edge Presents'], { drop: 'off-site' });
  add('z-room1', '2026-05-10T20:00', '', ['Edge Presents']);
  add('z-room1', '2026-05-11T20:00', 'Comedy Night', ['Edge Presents']);
  add('z-room1', '2026-10-05T20:00', 'Synthetic Act 207', ['Edge Presents']);
  add('z-room3', '2026-05-12T20:00', 'Synthetic Act 208', ['Edge Presents']);
  extra(add);
  return rows.join('\n');
}
const literalData = (extra) => checkData2({ venues: parseCsv(LIT_VENUES), shows: parseCsv(literalShows(extra)) });

test('literal reading: presented_by and ln-aeg.csv are checked', () => {
  assert.deepEqual(parsePresenters(''), []);
  assert.deepEqual(parsePresenters('[" Synthetic Presents "]'), ['Synthetic Presents']);
  const bad = literalShows().replace('"[""Shared Promotions""]"', 'Shared Promotions');
  assert.throws(() => checkData2({ venues: parseCsv(LIT_VENUES), shows: parseCsv(bad) }), /row \d+: presented_by must be a JSON array/);
  assert.deepEqual(checkLnAeg([{ name: 'Synthetic Nation Clubs', group: 'live-nation', source_url: 'https://example.org/a' }]), ['Synthetic Nation Clubs']);
  assert.throws(() => checkLnAeg([{ name: 'X', group: 'other', source_url: 'https://example.org/a' }]), /row 2: group/);
  assert.throws(() => checkLnAeg([{ name: 'X', group: 'aeg', source_url: '' }]), /source_url/);
  assert.throws(() => checkLnAeg([{ name: ' ', group: 'aeg', source_url: 'https://example.org/a' }]), /name is required/);
});

test('literal reading: a shared presenter joins clusters, §5 drops a metro left with one, an LN/AEG presenter drops the venue', () => {
  const { data, report } = literalReading(literalData(), ['Synthetic Nation Clubs']);
  assert.equal(report.clusters_listed, 6);
  assert.equal(report.rooms_with_presenters, 5);
  assert.deepEqual(report.merged, [{ cluster: 'c-y1', listed_clusters: ['c-y1', 'c-y2'], rooms: ['y-room1', 'y-room2'], shared_presenters: 1 }]);
  assert.deepEqual(report.dropped_s1, ['x-room2']);
  assert.deepEqual(report.dropped_s5, ['y-room1', 'y-room2']);
  assert.equal(report.clusters, 3);
  assert.deepEqual(data.venues.map((v) => v.venue_id), ['x-room1', 'x-hall', 'z-room1', 'z-room2', 'z-room3']);
  assert.ok(data.shows.every((s) => !['x-room2', 'y-room1', 'y-room2'].includes(s.venue_id)));
  // Edge Presents is on counted rows of z-room3 only, so z-room1 keeps its own cluster
  assert.deepEqual(new Set(data.venues.map((v) => v.cluster)), new Set(['c-x1', 'c-x3', 'c-z1', 'c-z3']));
});

test('literal reading: §1 drops every room of a building, then §5 drops the room left alone in its metro', () => {
  const { data, report } = literalReading(literalData(), ['Synthetic Nation Clubs', 'building owner group']);
  assert.deepEqual(report.dropped_s1, ['x-room2', 'z-room1', 'z-room2']);
  assert.deepEqual(report.dropped_s5, ['y-room1', 'y-room2', 'z-room3']);
  assert.equal(report.clusters, 1);
  assert.deepEqual(data.venues.map((v) => v.venue_id), ['x-room1', 'x-hall']);
  const again = literalReading(literalData(), ['Synthetic Nation Clubs', 'Building Owner Group', 'Nobody Presents']);
  assert.deepEqual(again.report, report, 'a name that presents no counted show changes nothing');
});

test('house bookers (Amendment 14): a presenter of more than half the counted shows must be the listed operator', () => {
  const data = literalData((add) => {
    add('x-room1', '2026-05-13T20:00', 'Synthetic Act 210', ['Operator X1']);
    add('x-room1', '2026-08-13T20:00', 'Synthetic Act 211', ['operator x1', 'Edge Presents']);
    add('x-room1', '2026-10-13T20:00', 'Synthetic Act 212', ['Operator X1']); // outside S1 and S2: not counted
    for (let n = 0; n < 2; n++) add('x-hall', `2026-06-1${n}T20:00`, `Synthetic Act 22${n}`, ['Hall Partner']);
    add('x-hall', '2026-06-20T20:00', 'Synthetic Act 230', ['Hall Partner'], { canceled: 1 });
  });
  // x-room1: 4 counted rows, Operator X1 on 2 (not more than half); x-hall: 4 counted, Hall Partner on 2; y-room1, y-room2 and
  // z-room2: 3 counted, one presenter on 1. Then one more row each makes a majority.
  assert.deepEqual(houseBookers(data.venues, data.shows), []);
  const more = literalData((add) => {
    for (const t of ['2026-05-13', '2026-08-13', '2026-08-14']) add('x-room1', `${t}T20:00`, `Synthetic Act ${t}`, ['Operator X1']);
    for (const t of ['2026-06-10', '2026-06-11', '2026-06-12']) add('x-hall', `${t}T20:00`, `Synthetic Act ${t}`, ['Hall Partner']);
  });
  assert.deepEqual(houseBookers(more.venues, more.shows), [
    { venue_id: 'x-room1', share: 0.6, matches_operator: true },
    { venue_id: 'x-hall', share: 0.6, matches_operator: false },
  ]);
});

test('literal reading: without presented_by nothing changes; capped rooms are test rooms again', () => {
  const base = syntheticData();
  const { data, report } = literalReading(base, []);
  assert.deepEqual([report.merged, report.dropped_s1, report.dropped_s5, report.rooms_with_presenters], [[], [], [], 0]);
  assert.equal(report.clusters, report.clusters_listed);
  assert.deepEqual(data.venues.map((v) => [v.venue_id, v.cluster, v.role]), base.venues.map((v) => [v.venue_id, v.cluster, v.role]));
  const capped = { ...base, venues: base.venues.map((v) => (v.venue_id === 'room-b' ? { ...v, role: 'pool', capped: true } : v)) };
  const back = literalReading(capped, []);
  assert.equal(back.data.venues.find((v) => v.venue_id === 'room-b').role, 'test');
  assert.equal(back.report.clusters_listed, 2);
});

test('literal reading: the run reports clusters and intervals beside the result, or says why it did not run', async () => {
  const missing = await literalStudy2({ data: syntheticData(), lnAeg: null });
  assert.deepEqual([missing.status, missing.reason], ['not run', 'ln-aeg.csv is missing']);
  const out = await literalStudy2({ client: fakeClient(), data: syntheticData(), lnAeg: [], restrict: 'filter', reps: 200, now: () => 0, minCoverage: 0 });
  assert.equal(out.status, 'run');
  assert.equal(out.clusters, 2);
  assert.match(out.label, /\(N = 2 clusters/);
  assert.ok('lo' in out.differences['Q-P'] || out.differences['Q-P'].status === 'not run');
  assert.equal(typeof out.claim_checks.q_minus_p_above_0, 'boolean');
  assert.match(out.note, /never part of the claim/);
  // one metro left: no placebo room, so not run (and no Qloo call before that)
  let calls = 0;
  const counting = { search: async () => (calls++, { status: 'error', error: { code: 'x' } }), insights: async () => (calls++, { status: 'error', error: { code: 'x' } }) };
  const one = await literalStudy2({ client: counting, data: literalData(), lnAeg: ['Synthetic Nation Clubs', 'Building Owner Group'], restrict: 'filter', minCoverage: 0 });
  assert.equal(one.status, 'not run');
  assert.match(one.reason, /no placebo room/);
  assert.equal(calls, 0);
  const lastRoom = literalData((add) => add('x-room1', '2026-08-08T20:00', 'Synthetic Act 209', ['Synthetic Nation Clubs']));
  const empty = await literalStudy2({ data: lastRoom, lnAeg: ['Synthetic Nation Clubs', 'Building Owner Group'], restrict: 'filter' });
  assert.deepEqual([empty.status, empty.reason, empty.report.clusters], ['not run', 'no test room is left under the literal reading', 0]);
  // Qloo errors are not swallowed
  await assert.rejects(
    literalStudy2({ client: fakeClient({ failOn: 'Synthetic Act 5' }), data: syntheticData(), lnAeg: [], restrict: 'filter', minCoverage: 0 }),
    /headliner search failed/,
  );
});

// ---------- cli ----------
test('cli: options are checked', () => {
  assert.throws(() => parseArgs2([]), /--restrict/);
  assert.throws(() => parseArgs2(['--dry-run', '--check-sample']), /separate/);
  assert.equal(parseArgs2(['--dry-run']).dryRun, true);
  assert.equal(parseArgs2(['--restrict', 'take500']).seed, 1);
  assert.throws(() => parseArgs2(['--restrict', 'filter', '--placebo-seed', '5']), /unknown option/);
});

async function bigDir(name) {
  const dir = path.join(tmp, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'venues.csv'), big.venues);
  await writeFile(path.join(dir, 'shows.csv'), big.shows);
  await writeFile(path.join(dir, 'ln-aeg.csv'), 'name,group,source_url\n');
  return dir;
}

test('cli: the test run refuses another seed or resample count, and data whose roles do not match coverage', async () => {
  const lines = [];
  const print = (l) => lines.push(l);
  const dataDir = path.join(tmp, 'cli2-refuse-var');
  const live = { DATA_DIR: dataDir, QLOO_API_KEY: 'synthetic-not-a-key' };
  const bigData2 = await bigDir('cli2-big-refuse');
  assert.equal(await main2(['--restrict', 'filter', '--data', bigData2, '--seed', '7'], live, print), 1);
  assert.match(lines.at(-1), /seed 1 and 2000 resamples/);
  assert.equal(await main2(['--restrict', 'filter', '--data', bigData2, '--reps', '100'], live, print), 1);
  const small = await syntheticDir('cli2-small-refuse');
  assert.equal(await main2(['--restrict', 'filter', '--data', small], live, print), 1);
  assert.match(lines.at(-1), /roles do not match shows\.csv[\s\S]*room-a/);
  const noList = await bigDir('cli2-no-ln-aeg');
  await rm(path.join(noList, 'ln-aeg.csv'));
  assert.equal(await main2(['--restrict', 'filter', '--data', noList], live, print), 1);
  assert.match(lines.at(-1), /ln-aeg\.csv is missing[\s\S]*Amendment 14/);
  assert.ok(!existsSync(path.join(dataDir, LOCK_NAME2)), 'no lock before the checks pass');
});

test('cli: dry run and check sample need no key; one test run in fixture mode, then the lock refuses a second', async () => {
  const data = await bigDir('cli2');
  const out = path.join(tmp, 'cli2-out');
  const dataDir = path.join(tmp, 'cli2-var');
  const lines = [];
  const print = (l) => lines.push(l);
  assert.equal(await main2(['--dry-run', '--data', data, '--out', out], { DATA_DIR: dataDir }, print), 0, lines.join('\n'));
  const dry = JSON.parse(readFileSync(path.join(out, 'backtest2-dryrun.json'), 'utf8'));
  assert.equal(dry.literal_reading.status, 'counted');
  assert.deepEqual(dry.house_bookers.not_operator, []);
  assert.equal(dry.literal_reading.clusters, dry.clusters, 'no presented_by column: the literal reading keeps every cluster');
  assert.match(lines.at(-1), /literal reading: \d+ clusters/);
  assert.equal(await main2(['--check-sample', '--data', data, '--out', out], { DATA_DIR: dataDir }, print), 0);
  const sample = JSON.parse(readFileSync(path.join(out, 'backtest2-check-sample.json'), 'utf8'));
  assert.equal(sample.shows_csv_lines.length, Math.ceil(sample.of_rows / 10));

  assert.equal(await main2(['--restrict', 'filter', '--data', data, '--out', out], { DATA_DIR: dataDir }, print), 2);
  assert.match(lines.at(-1), /QLOO_API_KEY/);
  assert.ok(!existsSync(path.join(dataDir, LOCK_NAME2)));

  const env = { NODE_ENV: 'test', QLOO_MODE: 'fixture', DATA_DIR: dataDir };
  assert.equal(await main2(['--restrict', 'filter', '--data', data, '--out', out, '--reps', '200'], env, print), 0, lines.join('\n'));
  const summary = JSON.parse(readFileSync(path.join(out, 'backtest2-test.json'), 'utf8'));
  assert.match(summary.label, /^(pilot 2|study 2|full) \(N = \d+ clusters, \d+ rooms, n = \d+ shows\)$/);
  assert.equal(summary.literal_reading.status, 'run');
  assert.equal(summary.literal_reading.clusters, summary.clusters);
  assert.ok(summary.literal_reading.differences['Q-P'] && summary.literal_reading.differences['Q-placebo']);
  assert.match(lines.at(-1), /literal reading \(Amendment 14\)/);
  const log = readFileSync(path.join(out, 'backtest2-test.log'), 'utf8');
  assert.match(log, /"event":"done"/);
  const start = JSON.parse(log.split('\n')[0]);
  assert.match(start.data_sha256['shows.csv'], /^[0-9a-f]{64}$/);
  assert.match(start.data_sha256['ln-aeg.csv'], /^[0-9a-f]{64}$/);
  assert.match(log, /"reading":"literal","event":"done"/);
  assert.ok('commit' in start && 'dirty' in start);
  assert.doesNotMatch(log + JSON.stringify(summary), /synthetic-artist|Synthetic Act/);
  assert.ok(existsSync(path.join(dataDir, LOCK_NAME2)));
  assert.equal(await main2(['--restrict', 'filter', '--data', data, '--out', out], env, print), 2);
  assert.match(lines.at(-1), /refused/);
});
