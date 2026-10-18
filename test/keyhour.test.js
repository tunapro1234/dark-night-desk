// Key hour tests. Fully offline: Qloo is a hand-written synthetic stand-in behind a fake fetch, Claude is a scripted
// stand-in, and every row of data below is synthetic ("Synthetic Act <n>", "synthetic-artist-<n>"). Nothing here is a
// Qloo response or a Qloo number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EXIT, STEPS, assertNoQlooContent, checkSampleState, createFetchGuard, decideRestrict, parseKeyhourArgs, runKeyhour } from '../scripts/keyhour.js';
import { LOCK_NAME } from '../scripts/backtest.js';
import { main2 } from '../scripts/backtest2.js';
import { loadStudy2Data } from '../server/backtest/study2-data.js';

// No real request can leave this file: every run passes its own fake fetch, and the global one throws in case one is missed.
globalThis.fetch = async (input) => {
  throw new Error(`test: real network blocked (${new URL(String(input?.url ?? input)).hostname})`);
};

// Test files stay in the OS temp dir (set TMPDIR to keep them elsewhere); the test removes nothing.
const tmp = await mkdtemp(path.join(os.tmpdir(), 'dnd-keyhour-'));
const KEY = 'synthetic-not-a-key';
const NOW = () => Date.parse('2026-10-11T12:00:00Z');
const LEAK = /Synthetic Act|Synthetic Room|synthetic-(artist|place|genre|tag)/;
const VENUES_DIR = 'test/fixtures/synthetic/venues';
const cleanGit = () => ({ ok: true, changed: 0 });

// ---------- synthetic Study 1 data (BACKTEST.md schema) ----------
const VENUES1 = [
  'venue_id,name,city,role,capacity,capacity_source,operator,operator_source,calendar_source',
  'room-a,Synthetic Room A,Exampleville,test,300,,,,',
  'room-b,Synthetic Room B,Exampleville,test,600,,,,',
  'placebo-x,Synthetic Room X,Otherville,placebo,,,,,',
  'hall-p,Synthetic Room P,Exampleville,pool,,,,,',
].join('\n');
function shows1() {
  const rows = ['venue_id,room,date,title,canceled,source_url,list_page_url,fetched_at,compiled_by'];
  const add = (venue, date, title, canceled = 0) => rows.push(`${venue},x,${date},${title},${canceled},https://example.org/${rows.length},,2026-10-11T00:00:00Z,test`);
  for (const n of [101, 102, 103]) add('room-a', '2026-04-10', `Synthetic Act ${n}`);
  for (const n of [104, 105, 106]) add('room-b', '2026-05-12', `Synthetic Act ${n}`);
  for (const n of [7, 8, 9, 10, 11]) add('placebo-x', '2026-06-01', `Synthetic Act ${n}`);
  for (const [i, n] of [201, 202, 203, 204, 205].entries()) add('hall-p', `2026-05-0${i + 1}`, `Synthetic Act ${n}`); // key-day signal
  for (let n = 1; n <= 12; n++) add('hall-p', '2026-07-10', `Synthetic Act ${n}`);
  add('room-a', '2026-07-07', 'Synthetic Act 1');
  add('room-a', '2026-07-08', 'Synthetic Act 2 with Guests');
  add('room-a', '2026-07-11', 'Synthetic Act 101');
  add('room-b', '2026-07-09', 'Synthetic Act 4');
  return rows.join('\n');
}

// ---------- synthetic Study 2 data (BACKTEST-2.md schema): two metros of test rooms and a two-stage pool venue ----------
const dayAfter = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const actNo = (kind, m, r, k) => kind * 10000 + m * 1000 + r * 500 + k;
function world2() {
  const venues = ['venue_id,name,operator,cluster,metro,tz,capacity,role,building,calendar_source'];
  const shows = ['venue_id,start,date,title,performers,canceled,drop_reason,source_url,fetched_at,compiled_by,checked_by'];
  const add = (venue, date, n) => shows.push([venue, `${date}T20:00`, date, `Synthetic Act ${n}`, '', '0', '', 'https://example.org/x', '2026-10-14', 'test', ''].join(','));
  for (let m = 0; m < 2; m++) {
    for (const r of [0, 1]) {
      venues.push(`t${m}${r},Synthetic Test ${m}${r},Operator ${m}${r},c${m}${r},Metro ${m},UTC,${r ? 900 : 300},test,,`);
      for (let k = 0; k < 22; k++) add(`t${m}${r}`, dayAfter('2026-04-01', 4 * k + r), actNo(1, m, r, k));
      for (let k = 0; k < 46; k++) add(`t${m}${r}`, dayAfter('2026-07-01', 2 * k + r), actNo(2, m, r, k));
    }
    for (const st of [0, 1]) {
      venues.push(`p${m}${st},Synthetic Pool ${m}${st},Operator P${m},c${m}p,Metro ${m},UTC,,pool,Synthetic Pool Hall ${m},`);
      for (let k = 0; k < 12; k++) add(`p${m}${st}`, dayAfter('2026-04-01', 7 * k + st * 3), actNo(3, m, st, k));
      for (let k = 0; k < 12; k++) add(`p${m}${st}`, dayAfter('2026-07-01', 7 * k + st * 3), actNo(3, m, st, 100 + k));
    }
  }
  return { venues: venues.join('\n'), shows: shows.join('\n') };
}

let dirs = 0;
/** A fresh world: Study 1 and Study 2 data, a results dir with the check sample, and a DATA_DIR. */
async function world({ secondPass = true, checked = true } = {}) {
  const root = path.join(tmp, `w${++dirs}`);
  const data1 = path.join(root, 'backtest');
  const data2 = path.join(root, 'backtest2');
  const out = path.join(root, 'results');
  const dataDir = path.join(root, 'var');
  await mkdir(data1, { recursive: true });
  await mkdir(data2, { recursive: true });
  await writeFile(path.join(data1, 'venues.csv'), VENUES1);
  await writeFile(path.join(data1, 'shows.csv'), shows1());
  await writeFile(path.join(data1, 'sources.md'), secondPass ? 'Synthetic test data. A random 10% of test-room rows (1 of 7, seed 1) were checked by a second reader.\n' : 'Synthetic test data.\n');
  const w2 = world2();
  await writeFile(path.join(data2, 'venues.csv'), w2.venues);
  await writeFile(path.join(data2, 'shows.csv'), w2.shows);
  await writeFile(path.join(data2, 'ln-aeg.csv'), 'name,group,source_url\n');
  assert.equal(await main2(['--check-sample', '--data', data2, '--out', out], { DATA_DIR: dataDir }, () => {}), 0);
  if (checked) {
    const sample = JSON.parse(readFileSync(path.join(out, 'backtest2-check-sample.json'), 'utf8'));
    const lines = w2.shows.split('\n');
    for (const n of sample.shows_csv_lines) lines[n - 1] = `${lines[n - 1]}second-reader`;
    await writeFile(path.join(data2, 'shows.csv'), lines.join('\n'));
  }
  return { root, data1, data2, out, dataDir, argv: ['--data1', data1, '--data2', data2, '--out', out] };
}

// ---------- synthetic Qloo stand-in behind fetch ----------
const ARTIST_RE = /^Synthetic Act (\d+)$/i;
function hashed(s) {
  let h = 0x811c9dc5;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return (h >>> 0) / 2 ** 32;
}
const entity = (n) => ({
  entity_id: `synthetic-artist-${n}`, name: `Synthetic Act ${n}`, popularity: (Number(n) % 50) / 50,
  tags: [{ tag_id: `synthetic-genre-${Number(n) % 3}`, name: `Synthetic Genre ${Number(n) % 3}`, type: 'urn:tag:genre:music' }],
});
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/**
 * @param {{ empty?: boolean, outside?: boolean, status429At?: number }} [opts]
 *   empty: insights answer with no entity (a NO-GO world); outside: filter.results.entities also returns an entity that was
 *   not asked for; status429At: the n-th Qloo request (1-based) answers HTTP 429.
 */
function fakeQloo({ empty = false, outside = false, status429At, failWhen } = {}) {
  const requests = [];
  const fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.hostname !== 'hackathon.api.qloo.com') throw new Error(`test: unexpected host ${url.hostname}`);
    if (status429At && requests.length >= status429At) return json(429, { error: 'synthetic rate limit' }, { 'retry-after': '60' });
    // failWhen(url): 'network' throws as a dropped connection would; a number answers with that HTTP status.
    const fail = failWhen?.(url);
    if (fail === 'network') throw new TypeError('synthetic network error');
    if (typeof fail === 'number') return json(fail, { error: 'synthetic failure' });
    const q = url.searchParams;
    if (url.pathname === '/search') {
      const query = q.get('query') ?? '';
      const m = ARTIST_RE.exec(query);
      if (m && (q.get('types') ?? '').includes('urn:entity:artist')) return json(200, { results: [entity(m[1])] });
      if ((q.get('types') ?? '').includes('urn:entity:place') && query.startsWith('Synthetic')) return json(200, { results: [{ entity_id: `synthetic-place-${hashed(query).toString(36).slice(2, 8)}`, name: query }] });
      return json(200, { results: [] });
    }
    if (url.pathname === '/v2/tags') return json(200, { results: { tags: [{ tag_id: 'synthetic-tag-1', name: 'Synthetic Tag', type: 'urn:tag:genre:music' }] } });
    if (url.pathname === '/v2/insights') {
      if (empty) return json(200, { results: { entities: [] } });
      const only = q.get('filter.results.entities')?.split(',');
      const take = Number(q.get('take') ?? 20);
      const ids = only ? [...only] : Array.from({ length: Math.min(take, 60) }, (_, i) => `synthetic-artist-${i + 1}`);
      if (only && outside) ids.push('synthetic-artist-99999');
      const signal = (q.get('signal.interests.entities') ?? '').split(',').filter(Boolean);
      const entities = ids.map((id) => {
        const n = id.split('-').pop();
        const e = { ...entity(n), entity_id: id, query: { affinity: Math.round(hashed(`${id}|${signal.join(',')}`) * 1e4) / 1e4 } };
        if (q.get('feature.explainability') === 'true' && signal.length) {
          e.query.explainability = { 'signal.interests.entities': signal.map((s) => ({ entity_id: s, score: Math.round(1e4 / signal.length) / 1e4 })) };
        }
        return e;
      });
      return json(200, { results: { entities: entities.sort((a, b) => b.query.affinity - a.query.affinity) } });
    }
    return json(404, { error: 'synthetic: unknown endpoint' });
  };
  return { fetch, requests };
}

const liveEnv = (w, extra = {}) => ({ DATA_DIR: w.dataDir, VENUES_DIR, QLOO_API_KEY: KEY, ...extra });
async function keyhour(w, { argv = [], env = liveEnv(w), qloo = fakeQloo(), now = NOW, anthropic } = {}) {
  const lines = [];
  const code = await runKeyhour({ argv: [...w.argv, ...argv], env, deps: { fetch: qloo.fetch, print: (l) => lines.push(l), now, git: cleanGit, anthropic } });
  return { code, lines, text: lines.join('\n'), qloo };
}
const readOut = (w, name) => JSON.parse(readFileSync(path.join(w.dataDir, 'keyhour', name), 'utf8'));
const started = (lines) => lines.map((l) => /step \d (\w+): start/.exec(l)?.[1]).filter(Boolean);

// ---------- units ----------
test('options: defaults, limits and the steps that cannot be redone', () => {
  const a = parseKeyhourArgs([]);
  assert.equal(a.plans, 4);
  assert.equal(a.maxQlooCalls, 20000);
  assert.equal(parseKeyhourArgs(['--restrict', 'take500']).restrict, 'take500');
  assert.throws(() => parseKeyhourArgs(['--restrict', 'all']), /--restrict/);
  assert.throws(() => parseKeyhourArgs(['--redo', 'study1']), /cannot be redone/);
  assert.throws(() => parseKeyhourArgs(['--plans', '11']), /--plans/);
  assert.throws(() => parseKeyhourArgs(['--seed', '3']), /unknown option/);
  assert.deepEqual(STEPS, ['key_check', 'keyday', 'study1', 'study2', 'live_plans']);
});

test('guard: counts, step cap, stop on the first 429, other hosts blocked, loopback allowed', async () => {
  let sent = 0;
  const fetchImpl = async (u) => {
    sent++;
    return String(u).includes('limit') ? json(429, {}) : json(200, { results: { entities: [{ entity_id: 'synthetic-artist-77777777', name: 'Synthetic Act 7' }] } });
  };
  const g = createFetchGuard({ fetchImpl, maxCalls: 10, requestTimeoutMs: 1000 });
  g.beginStep('a', 2);
  await g.fetch('https://hackathon.api.qloo.com/search?query=x');
  await g.fetch('https://hackathon.api.qloo.com/search?query=y');
  await assert.rejects(g.fetch('https://hackathon.api.qloo.com/search?query=z'), /step_cap/);
  assert.equal(g.state.qloo_sent, 2);
  g.beginStep('b', 10);
  assert.equal(g.state.stop, null, 'a step cap ends with its step');
  assert.equal((await g.fetch('https://hackathon.api.qloo.com/limit')).status, 429);
  await assert.rejects(g.fetch('https://hackathon.api.qloo.com/search?query=w'), /rate_limited/);
  g.beginStep('c', 10);
  await assert.rejects(g.fetch('https://hackathon.api.qloo.com/search?query=v'), /rate_limited/, 'a 429 is never cleared');
  await assert.rejects(g.fetch('https://example.org/'), /blocked_host/);
  await g.fetch('http://127.0.0.1:3020/api/health');
  assert.equal(sent, 4);
  assert.deepEqual([g.state.qloo_sent, g.state.not_sent, g.state.blocked_hosts, g.state.loopback_sent], [3, 3, 1, 1]);
  assert.ok(g.seen.ids.has('synthetic-artist-77777777') && g.seen.names.has('Synthetic Act 7'));
});

test('content check: ids anywhere and names refuse the write; codes and own words pass', () => {
  const seen = { ids: new Set(['synthetic-artist-12345678']), names: new Set(['Synthetic Act 7', 'done', 'GO']) };
  assert.throws(() => assertNoQlooContent({ a: ['x', 'Synthetic Act 7'] }, seen), /Qloo name or id/);
  assert.throws(() => assertNoQlooContent({ a: 'see synthetic-artist-12345678 here' }, seen), /Qloo name or id/);
  assert.doesNotThrow(() => assertNoQlooContent({ status: 'done', decision: 'GO', n: 3 }, seen));
});

test('restriction: filter only when probe 11 answered within the pool; open when it cannot be seen', () => {
  const kd = (p11) => ({ calls: [p11] });
  assert.equal(decideRestrict(kd({ n: 11, ok: true, count: 5 }), { responses: 2, outside: 0 }).restrict, 'filter');
  assert.equal(decideRestrict(kd({ n: 11, ok: true, count: 5 }), { responses: 2, outside: 1 }).restrict, 'take500');
  assert.equal(decideRestrict(kd({ n: 11, ok: true, count: 0 }), { responses: 1, outside: 0 }).restrict, 'take500');
  assert.equal(decideRestrict(kd({ n: 11, ok: false, status: 'error', error_code: 'http_400' }), { responses: 0, outside: 0 }).restrict, 'take500');
  // a dropped connection, a timeout or a 5xx says nothing about the feature: the choice stays open
  for (const code of ['network', 'http_503', 'http_401']) {
    const d = decideRestrict(kd({ n: 11, ok: false, status: 'error', error_code: code }), { responses: 0, outside: 0 });
    assert.equal(d.restrict, null, code);
    assert.equal(d.passing, true, code);
  }
  assert.equal(decideRestrict(kd({ n: 11, ok: true, count: 5 }), { responses: 0, outside: 0 }).restrict, null);
  assert.equal(decideRestrict(kd({ n: 11, status: 'skipped' }), { responses: 0, outside: 0 }).restrict, null);
});

test('check sample: recorded only when it matches shows.csv and every sampled row has checked_by', async () => {
  const good = await world();
  assert.equal(checkSampleState(await loadStudy2Data(good.data2), path.join(good.out, 'backtest2-check-sample.json')).ok, true);
  const bad = await world({ checked: false });
  const s = checkSampleState(await loadStudy2Data(bad.data2), path.join(bad.out, 'backtest2-check-sample.json'));
  assert.equal(s.ok, false);
  assert.match(s.reason, /checked_by is filled on 0 of \d+/);
  assert.match(checkSampleState(await loadStudy2Data(bad.data2), path.join(bad.root, 'none.json')).reason, /missing/);
});

// ---------- the command ----------
test('no Qloo key: exit 2 and nothing sent', async () => {
  const w = await world();
  const r = await keyhour(w, { env: { DATA_DIR: w.dataDir, VENUES_DIR } });
  assert.equal(r.code, EXIT.NO_KEY);
  assert.equal(r.qloo.requests.length, 0);
  assert.match(r.text, /no key/);
});

test('rejected key: exit 2 after the one key-check request', async () => {
  const w = await world();
  const qloo = { requests: [], fetch: async (u) => (qloo.requests.push(u), json(401, { error: 'synthetic' })) };
  const r = await keyhour(w, { qloo });
  assert.equal(r.code, EXIT.NO_KEY);
  assert.equal(qloo.requests.length, 1);
  assert.equal(readOut(w, 'summary.json').steps.key_check.status, 'rejected');
});

test('dry run: no request; plan, estimates and gates; a missing second pass blocks Study 2', async () => {
  const w = await world();
  const ok = await keyhour(w, { argv: ['--dry-run'], env: { DATA_DIR: w.dataDir, VENUES_DIR } });
  assert.equal(ok.code, EXIT.OK, ok.text);
  assert.equal(ok.qloo.requests.length, 0);
  assert.match(ok.text, /2 keyday +pending: .*rooms hall-p \(study1 pool rooms\), placebo placebo-x/);
  assert.match(ok.text, /3 study1 +pending: searches \d+-\d+, rankings <= \d+/);
  assert.match(ok.text, /check sample recorded/);
  assert.match(ok.text, /QLOO_API_KEY is not set/);
  assert.ok(!existsSync(path.join(w.dataDir, 'keyhour', 'checkpoint.json')), 'a dry run writes no checkpoint');

  const bad = await world({ checked: false, secondPass: false });
  const r = await keyhour(bad, { argv: ['--dry-run'], env: { DATA_DIR: bad.dataDir, VENUES_DIR } });
  assert.equal(r.code, EXIT.USAGE);
  assert.match(r.text, /blocks study2: the 10% second pass is not recorded/);
  assert.match(r.text, /blocks study1: .*sources\.md does not record the 10% second pass/);
});

test('full run in order: key, GO, Study 1, Study 2, live plans skipped without a Claude key; summary holds no Qloo content', async () => {
  const w = await world();
  const r = await keyhour(w, { argv: ['--studies-without-claude'] });
  assert.equal(r.code, EXIT.OK, r.text);
  assert.deepEqual(started(r.lines), ['key_check', 'keyday', 'study1', 'study2', 'live_plans']);
  const summary = readOut(w, 'summary.json');
  assert.equal(summary.steps.keyday.decision, 'GO');
  assert.equal(summary.steps.keyday.restrict, 'filter');
  assert.equal(summary.steps.study1.status, 'done');
  assert.equal(summary.steps.study1.restrict, 'filter');
  assert.equal(summary.steps.study1.l_status, 'not run');
  assert.equal(summary.steps.study2.status, 'done');
  assert.equal(summary.steps.study2.restrict, 'filter');
  assert.equal(summary.steps.live_plans.status, 'skipped_no_claude_key');
  assert.deepEqual(summary.pass, { key: true, go: true, study1_done: true, study2_done: true, study2_literal_stopped: false, live_cost_within_karar_worst: null });
  assert.equal(summary.qloo_this_invocation.sent, r.qloo.requests.length);
  assert.ok(summary.qloo_this_invocation.sent > 0);
  for (const f of ['summary.json', 'checkpoint.json']) assert.doesNotMatch(readFileSync(path.join(w.dataDir, 'keyhour', f), 'utf8'), LEAK, f);
  for (const f of ['backtest-test.json', 'backtest2-test.json']) assert.ok(existsSync(path.join(w.out, f)), f);
  assert.ok(existsSync(path.join(w.dataDir, 'keyday-summary.json')));

  // A rerun skips every finished step and sends nothing; a study never runs twice.
  const again = await keyhour(w, { argv: ['--studies-without-claude'] });
  assert.equal(again.code, EXIT.OK, again.text);
  assert.deepEqual(started(again.lines), ['live_plans']);
  assert.equal(again.qloo.requests.length, 0);

  // Study 1 used the key-day restriction, so the key-day test cannot be redone to change it.
  const redo = await keyhour(w, { argv: ['--studies-without-claude', '--redo', 'keyday'] });
  assert.equal(redo.code, EXIT.USAGE, redo.text);
  assert.match(redo.text, /--redo keyday is refused/);
  assert.equal(redo.qloo.requests.length, 0);
  assert.equal(readOut(w, 'checkpoint.json').steps.keyday.decision, 'GO');

  // With a Claude key (and synthetic stand-ins for Qloo and Claude) only the live plans run, and their cost is reported.
  const claude = scriptedClaude();
  const live = await keyhour(w, { env: { NODE_ENV: 'test', QLOO_MODE: 'fixture', DATA_DIR: w.dataDir, VENUES_DIR, ANTHROPIC_API_KEY: 'sk-test-not-real' }, anthropic: claude.factory, argv: ['--plans', '3'] });
  assert.equal(live.code, EXIT.OK, live.text);
  assert.deepEqual(started(live.lines), ['live_plans']);
  const lp = readOut(w, 'summary.json').steps.live_plans;
  assert.equal(lp.status, 'done');
  // Round robin over the two synthetic rooms; a plan that ends in an error (the synthetic fixtures leave one room's pool
  // empty on some nights) is counted, and the turn it used stays in the total.
  assert.equal(lp.plans_attempted, 3);
  assert.ok(lp.live >= 1, JSON.stringify(lp));
  assert.equal(lp.live + lp.fallback + Object.values(lp.errors).reduce((t, x) => t + x, 0), 3, JSON.stringify(lp));
  assert.ok(claude.calls() >= 3 * lp.live, 'three turns a live plan');
  assert.ok(lp.usd_total >= lp.usd_per_live_plan * lp.live);
  assert.ok(lp.usd_per_live_plan > 0 && lp.usd_per_live_plan < 0.01, String(lp.usd_per_live_plan));
  assert.equal(lp.within_karar_worst, true);
  assert.equal(lp.karar_estimate_usd.typical, 0.007);
  assert.doesNotMatch(readFileSync(path.join(w.dataDir, 'keyhour', 'summary.json'), 'utf8'), /sk-test-not-real/);
});

test('NO-GO: exit 3, the studies do not run, and a rerun stays stopped', async () => {
  const w = await world();
  const r = await keyhour(w, { argv: ['--studies-without-claude'], qloo: fakeQloo({ empty: true }) });
  assert.equal(r.code, EXIT.NO_GO, r.text);
  assert.deepEqual(started(r.lines), ['key_check', 'keyday']);
  assert.match(r.text, /NO-GO .*Anchor-lite/);
  assert.equal(readOut(w, 'summary.json').steps.keyday.decision, 'NO-GO');
  assert.ok(!existsSync(path.join(w.dataDir, LOCK_NAME)));
  const again = await keyhour(w, { argv: ['--studies-without-claude'] });
  assert.equal(again.code, EXIT.NO_GO);
  assert.equal(again.qloo.requests.length, 0);
});

test('429: stop at once with exit 5, nothing sent after it; the rerun resumes from the stopped study', async () => {
  const w = await world();
  // keyday ends well before request 60 here; the 429 lands inside Study 1
  const first = await keyhour(w, { argv: ['--studies-without-claude'], qloo: fakeQloo({ status429At: 60 }) });
  assert.equal(first.code, EXIT.RATE_LIMITED, first.text);
  assert.equal(first.qloo.requests.length, 60, 'no request after the 429');
  assert.deepEqual(started(first.lines), ['key_check', 'keyday', 'study1']);
  const ck = readOut(w, 'checkpoint.json');
  assert.equal(ck.steps.study1.status, 'stopped');
  assert.equal(ck.steps.study1.reason, 'rate_limited');
  assert.ok(!existsSync(path.join(w.dataDir, LOCK_NAME)), 'no metric yet, so the lock went');
  assert.ok(existsSync(path.join(w.dataDir, 'keyhour', 'stopped', ck.steps.study1.stopped_log)));
  assert.match(first.text, /Retry-After 60 s/);
  assert.doesNotMatch(first.text, /synthetic rate limit/, 'Qloo error bodies stay out of the console');

  const second = await keyhour(w, { argv: ['--studies-without-claude'] });
  assert.equal(second.code, EXIT.OK, second.text);
  assert.deepEqual(started(second.lines), ['study1', 'study2', 'live_plans']);
  assert.equal(readOut(w, 'summary.json').steps.study1.status, 'done');
});

test('call cap: exit 6 at the cap; a larger cap resumes', async () => {
  const w = await world();
  const r = await keyhour(w, { argv: ['--studies-without-claude', '--max-qloo-calls', '5'] });
  assert.equal(r.code, EXIT.CALL_CAP, r.text);
  assert.equal(r.qloo.requests.length, 5);
  assert.equal(readOut(w, 'checkpoint.json').steps.keyday.status, 'stopped');
  // The cap counts every invocation: the same cap again sends nothing more.
  const same = await keyhour(w, { argv: ['--studies-without-claude', '--max-qloo-calls', '5'] });
  assert.equal(same.code, EXIT.CALL_CAP, same.text);
  assert.equal(same.qloo.requests.length, 0);
  assert.match(same.text, /over all invocations, 5 sent so far/);
  const again = await keyhour(w, { argv: ['--studies-without-claude'] });
  assert.equal(again.code, EXIT.OK, again.text);
  assert.deepEqual(started(again.lines), ['keyday', 'study1', 'study2', 'live_plans']);
});

test('key day: a passing network error on probe 11 records no decision (exit 4), and the rerun decides from the answer', async () => {
  const w = await world();
  let failed = null;
  // every attempt of the first closed-pool request fails like a dropped connection
  const failWhen = (url) => {
    if (!url.searchParams.get('filter.results.entities')) return null;
    failed ??= url.href;
    return url.href === failed ? 'network' : null;
  };
  const first = await keyhour(w, { argv: ['--studies-without-claude'], qloo: fakeQloo({ failWhen }) });
  assert.equal(first.code, EXIT.STOPPED, first.text);
  assert.deepEqual(started(first.lines), ['key_check', 'keyday']);
  const ck = readOut(w, 'checkpoint.json').steps.keyday;
  assert.equal(ck.status, 'stopped');
  assert.equal(ck.reason, 'passing_errors');
  assert.equal(ck.restrict, undefined, 'no take500 fixed on a network error');
  assert.ok(!existsSync(path.join(w.dataDir, 'keyday-summary.json')));

  const second = await keyhour(w, { argv: ['--studies-without-claude'] });
  assert.equal(second.code, EXIT.OK, second.text);
  assert.equal(readOut(w, 'summary.json').steps.keyday.restrict, 'filter');
});

test('key day: a 401 after the key check is a key problem (exit 2), never a NO-GO', async () => {
  const w = await world();
  const r = await keyhour(w, { argv: ['--studies-without-claude'], qloo: fakeQloo({ failWhen: (url) => (url.pathname === '/search' ? 401 : null) }) });
  assert.equal(r.code, EXIT.NO_KEY, r.text);
  const kd = readOut(w, 'checkpoint.json').steps.keyday;
  assert.equal(kd.status, 'stopped');
  assert.equal(kd.reason, 'key_rejected');
  assert.equal(kd.decision, undefined);
});

test('restriction by hand: refused when it differs from the key-day decision; Study 2 needs a clean tree', async () => {
  const w = await world();
  const r = await keyhour(w, { argv: ['--studies-without-claude', '--restrict', 'take500'] });
  assert.equal(r.code, EXIT.USAGE, r.text);
  assert.match(r.text, /the key-day test fixed the pool restriction \(filter/);
  const ck = readOut(w, 'checkpoint.json').steps;
  assert.equal(ck.keyday.restrict, 'filter', 'the probes decide, not the option');
  assert.equal(ck.study1.status, 'refused');
  assert.ok(!existsSync(path.join(w.dataDir, LOCK_NAME)));

  // Study 1 runs; Study 2 waits for its result (and any other change) to be committed, as its log records "dirty".
  let dirtyTree = 1;
  const lines = [];
  const git = (paths) => ({ ok: true, changed: paths.length ? 0 : dirtyTree });
  const run = () => runKeyhour({ argv: [...w.argv, '--studies-without-claude'], env: liveEnv(w), deps: { fetch: fakeQloo().fetch, print: (l) => lines.push(l), now: NOW, git } });
  assert.equal(await run(), EXIT.USAGE, lines.join('\n'));
  assert.equal(readOut(w, 'checkpoint.json').steps.study1.status, 'done');
  assert.equal(readOut(w, 'checkpoint.json').steps.study2.status, 'refused');
  assert.match(lines.join('\n'), /logs "dirty" for the whole repository/);
  assert.ok(!existsSync(path.join(w.out, 'backtest2-test.json')));
  dirtyTree = 0;
  assert.equal(await run(), EXIT.OK, lines.join('\n'));
  assert.equal(readOut(w, 'summary.json').steps.study2.restrict, 'filter');
});

test('no Claude key: the studies wait (exit 7) so ranker L is not lost; a pool that leaks means take500', async () => {
  const w = await world();
  const r = await keyhour(w, { qloo: fakeQloo({ outside: true }) });
  assert.equal(r.code, EXIT.WAITING, r.text);
  assert.match(r.text, /ranker L/);
  const ck = readOut(w, 'checkpoint.json');
  assert.equal(ck.steps.keyday.restrict, 'take500');
  assert.ok(ck.steps.keyday.filter_check.outside > 0);
  assert.equal(ck.steps.study1.status, 'waiting');
  assert.ok(!existsSync(path.join(w.dataDir, LOCK_NAME)));
});

test('gates: an unrecorded second pass refuses Study 2 after Study 1; after 26 Oct Study 2 is "registered, not run"', async () => {
  const w = await world({ checked: false });
  const r = await keyhour(w, { argv: ['--studies-without-claude'] });
  assert.equal(r.code, EXIT.USAGE, r.text);
  assert.deepEqual(started(r.lines), ['key_check', 'keyday', 'study1', 'study2']);
  assert.equal(readOut(w, 'summary.json').steps.study2.status, 'refused');
  assert.ok(!existsSync(path.join(w.out, 'backtest2-test.json')));

  const late = await world();
  const lr = await keyhour(late, { argv: ['--studies-without-claude'], now: () => Date.parse('2026-10-26T21:30:00Z') }); // 27 Oct 00:30 TSI
  assert.equal(lr.code, EXIT.OK, lr.text);
  const s = readOut(late, 'summary.json').steps;
  assert.equal(s.study1.status, 'done');
  assert.equal(s.study2.status, 'not_run_deadline');
  assert.ok(!existsSync(path.join(late.out, 'backtest2-test.json')));

  const dirty = await world();
  const lines = [];
  const code = await runKeyhour({ argv: [...dirty.argv, '--studies-without-claude'], env: liveEnv(dirty), deps: { fetch: fakeQloo().fetch, print: (l) => lines.push(l), now: NOW, git: () => ({ ok: true, changed: 2 }) } });
  assert.equal(code, EXIT.USAGE);
  assert.match(lines.join('\n'), /uncommitted changes/);
});

test('a corrupt checkpoint is refused, never replaced', async () => {
  const w = await world();
  await mkdir(path.join(w.dataDir, 'keyhour'), { recursive: true });
  await writeFile(path.join(w.dataDir, 'keyhour', 'checkpoint.json'), '{"version": 9}');
  const r = await keyhour(w);
  assert.equal(r.code, EXIT.USAGE);
  assert.match(r.text, /not a keyhour checkpoint/);
  assert.equal(r.qloo.requests.length, 0);
  assert.equal(readFileSync(path.join(w.dataDir, 'keyhour', 'checkpoint.json'), 'utf8'), '{"version": 9}');
});

// ---------- scripted Claude stand-in for step 5 (same shape as test/agent.test.js) ----------
function scriptedClaude() {
  let n = 0;
  const usage = { input_tokens: 1000, output_tokens: 200 };
  const toolUse = (name, input = {}) => ({ type: 'tool_use', id: `tu-${name}-${++n}`, name, input });
  const reply = (...blocks) => ({ content: blocks, stop_reason: 'tool_use', usage });
  const results = (messages) => {
    const names = new Map();
    for (const m of messages) if (m.role === 'assistant') for (const b of m.content) if (b.type === 'tool_use') names.set(b.id, b.name);
    const out = {};
    for (const m of messages) {
      if (m.role !== 'user' || !Array.isArray(m.content)) continue;
      for (const b of m.content) if (b.type === 'tool_result' && names.get(b.tool_use_id) !== 'submit_plan') out[names.get(b.tool_use_id)] = JSON.parse(b.content);
    }
    return out;
  };
  let calls = 0;
  const client = {
    messages: {
      create: async ({ messages }) => {
        calls++;
        const turn = messages.filter((m) => m.role === 'assistant').length;
        const r = results(messages);
        if (turn === 0) return reply(toolUse('read_calendar'), toolUse('resolve_entities'), toolUse('build_pool'), toolUse('rank_pool'));
        if (turn === 1) return reply(toolUse('explain'), toolUse('also_loves'), toolUse('draft_offer', { entity_id: r.rank_pool.ranked[0].entity_id }));
        return reply(toolUse('submit_plan', {
          shortlist: r.explain.acts.map((a) => ({ entity_id: a.entity_id, why: a.suggested_why })),
          also_loves: r.also_loves.also_loves.slice(0, 1).map(({ type, category }) => ({ type, category })),
          offer_note: { entity_id: r.draft_offer.entity_id, subject: r.draft_offer.subject, body: r.draft_offer.body },
        }));
      },
    },
  };
  return { factory: () => client, calls: () => calls };
}
