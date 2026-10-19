import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config.js';
import { buildApp } from '../server/app.js';
import { createBudget } from '../server/budget/budget.js';
import { MAX_TURNS, systemPrompt } from '../server/agent/loop.js';
import { THIN_SIGNAL_BELOW, TOOL_DEFS, TOOL_NAMES, offerNote, popularityMaxFor, scriptedWhy, strongestAlsoLoves, whySentence } from '../server/agent/tools.js';
import { validateAgentOutput, validateThinSignal } from '../server/agent/validate.js';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'dnd-agent-'));
test.after(() => rm(tmp, { recursive: true, force: true }));

const VENUES_DIR = 'test/fixtures/synthetic/venues';
const FROM = '2026-11-01';
// "Today" for every app in this file, so the November nights stay in the future whenever the tests run.
const TEST_NOW = () => Date.parse('2026-10-11T12:00:00Z');
let n = 0;
const freshDir = () => path.join(tmp, `var-${++n}`);

async function appWith(env = {}, opts = {}) {
  const config = loadConfig({ NODE_ENV: 'test', QLOO_MODE: 'fixture', DATA_DIR: freshDir(), VENUES_DIR, ...env });
  const budget = opts.budget ?? createBudget({ dailyCap: 2, totalCap: 30, ipLimit: 20, prices: { inPerMTok: 2, outPerMTok: 10 } });
  const app = await buildApp(config, { budget, now: TEST_NOW, ...opts });
  return { app, config, budget };
}

async function darkNights(app, venue = 'example-room') {
  const cal = (await app.inject(`/api/venues/${venue}/calendar?from=${FROM}&days=60`)).json();
  return cal.nights.filter((x) => x.status === 'dark').map((x) => x.date);
}

function parseSse(body) {
  return body.split('\n\n').filter(Boolean).map((chunk) => {
    const ev = {};
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event: ')) ev.event = line.slice(7);
      if (line.startsWith('data: ')) ev.data = JSON.parse(line.slice(6));
    }
    return ev;
  });
}

async function plan(app, body, headers = {}) {
  const res = await app.inject({ method: 'POST', url: '/api/plan', payload: body, headers });
  return { res, events: res.statusCode === 200 ? parseSse(res.body) : [] };
}
const resultOf = (events) => events.find((e) => e.event === 'result')?.data;

// ---- validator ----

const outputs = [{ entities: [{ entity_id: 'syn-1', name: 'Synthetic Act One' }, { entity_id: 'syn-2', name: 'Synthetic Act Two' }], numbers: [0.42], date: '2026-11-06' }];

test('validator accepts ids and numbers that come from tool outputs', () => {
  assert.deepEqual(validateAgentOutput({ shortlist: [{ entity_id: 'syn-1', why: 'Your crowd came for X and Y.' }] }, outputs), { ok: true, errors: [] });
  assert.equal(validateAgentOutput({ shortlist: [{ entity_id: 'syn-2', why: 'Friday, November 6. Shares 0.42 or 42% of it.' }] }, outputs).ok, true);
});

test('validator rejects a ghost entity and an unsourced number', () => {
  const ghost = validateAgentOutput({ shortlist: [{ entity_id: 'made-up-99', why: 'x' }] }, outputs);
  assert.equal(ghost.ok, false);
  assert.match(ghost.errors[0], /made-up-99/);
  const num = validateAgentOutput({ shortlist: [{ entity_id: 'syn-1', why: 'Expect 340 tickets sold.' }] }, outputs);
  assert.equal(num.ok, false);
  assert.match(num.errors.join(), /"340"/);
  assert.equal(validateAgentOutput({ shortlist: [{ entity_id: 'syn-1', why: 'About 2,100 people.' }] }, outputs).ok, false);
});

test('validator: pool restriction, exact size, duplicates, empty output', () => {
  assert.equal(validateAgentOutput({ shortlist: [{ entity_id: 'syn-2' }] }, outputs, { allowedIds: ['syn-1'] }).ok, false);
  assert.equal(validateAgentOutput({ shortlist: [{ entity_id: 'syn-1' }] }, outputs, { shortlistSize: 5 }).ok, false);
  assert.equal(validateAgentOutput({ shortlist: [{ entity_id: 'syn-1' }, { entity_id: 'syn-1' }] }, outputs).ok, false);
  assert.equal(validateAgentOutput({ shortlist: [] }, outputs).ok, false);
  assert.equal(validateAgentOutput(null, outputs).ok, false);
});

test('validator: the offer note keeps the blank guarantee and has no money, tickets or manager', () => {
  const base = { shortlist: [{ entity_id: 'syn-1' }] };
  const note = (body) => validateAgentOutput({ ...base, offer_note: { subject: 'Date inquiry', body } }, outputs);
  assert.equal(note('Hi.\nGuarantee: ___').ok, true);
  assert.equal(note('Hi.').ok, false);
  assert.equal(note('Hi. We can pay $ well.\nGuarantee: ___').ok, false);
  assert.equal(note('Hi. Tickets will move.\nGuarantee: ___').ok, false);
  assert.equal(note("Hi, could you pass this to the act's manager?\nGuarantee: ___").ok, false);
  assert.equal(note('Our crowd came for A and B. X sits right between them.\nGuarantee: ___').ok, true);
  const yours = note('Your crowd came for A and B. X sits right between them.\nGuarantee: ___');
  assert.equal(yours.ok, false);
  assert.match(yours.errors.join(' '), /our crowd/);
});

// ---- tool helpers ----

test('tools: the seven named tools exist, and every definition has a schema', () => {
  for (const t of ['read_calendar', 'resolve_entities', 'build_pool', 'rank_pool', 'ablate', 'also_loves', 'draft_offer']) assert.ok(TOOL_NAMES.includes(t));
  assert.deepEqual(TOOL_DEFS.map((d) => d.name), TOOL_NAMES);
  for (const d of TOOL_DEFS) assert.equal(d.input_schema.type, 'object');
});

test('why sentence and room sizing', () => {
  assert.equal(whySentence('X', [{ name: 'A' }, { name: 'B' }]), 'Your crowd came for A and B. X sits right between them.');
  assert.equal(whySentence('X', [{ name: 'A' }]), 'Your crowd came for A. X draws on the same taste.');
  assert.equal(whySentence('X', [{ name: 'A' }, { name: 'B' }], { voice: 'our' }), 'Our crowd came for A and B. X sits right between them.');
  assert.equal(whySentence('X', [{ name: 'A' }], { voice: 'our' }), 'Our crowd came for A. X draws on the same taste.');
  assert.equal(whySentence('X', [], { voice: 'our' }), "X ranks high against our room's past program.");
  assert.equal(popularityMaxFor('250-500'), 0.9);
  assert.equal(popularityMaxFor('1500-3000'), undefined);
  assert.equal(popularityMaxFor('unknown'), undefined);
});

test('scripted reason line: worded by what drove the pick, names only, no number', () => {
  const c = (name, share) => ({ entity_id: name, name, share });
  assert.equal(scriptedWhy('X', [c('A', 0.6), c('B', 0.3), c('C', 0.1)]), 'Most of this match comes from one past show, A. X draws on the same taste.');
  assert.equal(scriptedWhy('X', [c('A', 0.4), c('B', 0.3), c('C', 0.3)]), 'Your crowd came for A and B. X sits right between them.');
  assert.equal(scriptedWhy('X', [c('A', 0.3), c('B', 0.2), c('C', 0.2), c('D', 0.3)]),
    'No single past show drives this one; it is spread across your program, led by A and B.');
  assert.equal(scriptedWhy('X', [c('A', 1)]), 'Your crowd came for A. X draws on the same taste.');
  assert.equal(scriptedWhy('X', [{ entity_id: 'n', name: null, share: 1 }]), "X ranks high against this room's past program.");
  // Exactly half is not "most of this match".
  assert.match(scriptedWhy('X', [c('A', 0.5), c('B', 0.5)]), /^Your crowd came for A and B\./);
  const also = strongestAlsoLoves([
    { type: 'brand', category: 'Brand Cat', lift_range: [0.05, 0.2] },
    { type: 'movie', category: 'Film Cat', lift_range: [0.05, 0.3] },
    { type: 'place', category: 'Place Cat', lift_range: [0.01, 0.9] },
  ]);
  assert.equal(also.category, 'Film Cat', 'largest lower end first, then the upper end');
  assert.equal(scriptedWhy('X', [c('A', 0.4), c('B', 0.3)], { also }),
    "Your crowd came for A and B. X sits right between them. The same crowd also leans to Film Cat films, more than the city's average room.");
  assert.equal(strongestAlsoLoves([]), undefined);
  for (const line of [scriptedWhy('X', [c('A', 0.6), c('B', 0.4)], { also }), scriptedWhy('X', [c('A', 0.2), c('B', 0.2), c('C', 0.6)])]) {
    assert.doesNotMatch(line, /\d/);
  }
});

test('validator: a thin-signal answer only when the signal is thin, with sourced numbers', () => {
  const ok = validateThinSignal({ why: 'Too few of your past shows were found.' }, outputs, { signalSize: 3, thinBelow: 5 });
  assert.deepEqual(ok, { ok: true, errors: [] });
  assert.match(validateThinSignal({ why: 'x' }, outputs, { signalSize: 6, thinBelow: 5 }).errors.join(), /not thin/);
  assert.match(validateThinSignal({ why: 'x' }, outputs, { thinBelow: 5 }).errors.join(), /resolve_entities first/);
  assert.match(validateThinSignal({ why: 'Only 977 matched.' }, outputs, { signalSize: 3, thinBelow: 5 }).errors.join(), /"977"/);
  assert.equal(validateThinSignal({ why: ' ' }, outputs, { signalSize: 3, thinBelow: 5 }).ok, false);
  assert.equal(THIN_SIGNAL_BELOW, 5, 'the shortlist size');
});

test('system prompt: no fixed tool order; ablate, thin signal and (when the page can answer) the question are the agent\'s calls', () => {
  const p = systemPrompt({ venue: { city: 'Exampleville' } });
  assert.doesNotMatch(p, /sensible order|read_calendar, resolve_entities, build_pool/);
  assert.match(p, /You choose which tools to call and in what order/);
  assert.match(p, /call ablate/);
  assert.match(p, /report_thin_signal/);
  assert.match(p, /fewer than 5 past headliners/);
  assert.doesNotMatch(p, /ask_booker|asking the booker/);
  assert.match(systemPrompt({ venue: { city: 'Exampleville' } }, { canAsk: true }), /call ask_booker with that name before\n {2}build_pool/);
});

test('system prompt carries the domain rules', () => {
  const p = systemPrompt({ venue: { city: 'Exampleville' } });
  assert.match(p, /acts who played Exampleville this season/);
  assert.match(p, /booking agent/);
  assert.match(p, /Guarantee: ___/);
  assert.match(p, /no ticket data/);
  assert.match(p, /speaks for the room: "Our crowd came for A and B/);
  assert.match(p, /Never "Your crowd" in the note/);
});

// ---- /api/plan, scripted ----

test('plan (scripted): SSE steps, five acts with reasons and evidence, note to the booking agent, also loves, calls', async () => {
  const { app } = await appWith({ AGENT_MODE: 'scripted' });
  const [night] = await darkNights(app);
  const { res, events } = await plan(app, { venue_id: 'example-room', date: night });
  assert.match(res.headers['content-type'], /^text\/event-stream/);
  const steps = events.filter((e) => e.event === 'step').map((e) => e.data.label);
  assert.match(steps[0], /^Reading your last \d+ shows$/);
  for (const s of ['Finding acts your crowd also loves', 'Keeping it to acts who played Exampleville in the last 90 days, with no date announced in town', 'Sizing to your room']) {
    assert.ok(steps.includes(s), s);
  }
  const r = resultOf(events);
  assert.deepEqual(r.mode, { agent: 'scripted', qloo: 'fixture' });
  assert.equal(r.night.date, night);
  assert.equal(r.shortlist.length, 5);
  assert.deepEqual(r.shortlist.map((x) => x.rank), [1, 2, 3, 4, 5]);
  // Scripted lines follow what drove each pick (explain's shares); the strongest also-loves fact is on the first pick only.
  const strongest = strongestAlsoLoves(r.also_loves);
  assert.ok(strongest);
  for (const [i, x] of r.shortlist.entries()) {
    assert.equal(x.why, scriptedWhy(x.name, x.evidence.contributions, { also: i === 0 ? strongest : undefined }));
  }
  assert.ok(r.shortlist[0].why.endsWith(`The same crowd also leans to ${strongest.category} ${{ movie: 'films', place: 'places', brand: 'brands' }[strongest.type]}, more than the city's average room.`));
  assert.ok(r.shortlist.slice(1).every((x) => !/also leans to/.test(x.why)));
  assert.ok(new Set(r.shortlist.map((x) => x.why.split(',')[0].split(' ').slice(0, 3).join(' '))).size > 1, 'not every line reads the same');
  for (const x of r.shortlist) {
    assert.match(x.entity_id, /^synthetic-artist-/);
    assert.match(x.why, /^(Your crowd came for|Most of this match comes from one past show|No single past show drives this one)/);
    // build_pool's fact: where and when the act played the city, inside the pool window, never at this room.
    assert.ok(x.played.length >= 1);
    for (const p of x.played) {
      assert.equal(p.venue_id, 'other-hall');
      assert.equal(p.venue, 'Other Hall');
      assert.ok(p.date >= r.pool.window.from && p.date <= r.pool.window.to, p.date);
    }
    assert.ok(['explainability', 'leave-one-out'].includes(x.evidence.method));
    assert.ok(x.evidence.contributions.length >= 1);
    for (const c of x.evidence.contributions) assert.ok(c.share > 0 && c.name);
  }
  assert.ok(r.also_loves.length >= 1);
  for (const row of r.also_loves) assert.ok(row.lift_range[0] > 0);
  assert.equal(r.offer_note.to, "artist's booking agent");
  assert.equal(r.offer_note.sent, false);
  assert.match(r.offer_note.body, /Guarantee: ___/);
  assert.equal(r.offer_note.entity_id, r.shortlist[0].entity_id);
  // The note speaks for the room to the booking agent; the card lines above speak to the booker.
  assert.match(r.offer_note.body, /^Our crowd came for .+ and .+\. .+ sits right between them\.$/m);
  assert.doesNotMatch(r.offer_note.body, /Your crowd/);
  // One note per shortlisted act, in shortlist order; the first is the same note as offer_note.
  assert.deepEqual(r.offer_notes.map((n) => n.entity_id), r.shortlist.map((x) => x.entity_id));
  assert.equal(r.offer_notes[0].body, r.offer_note.body);
  for (const [i, n] of r.offer_notes.entries()) {
    assert.equal(n.to, "artist's booking agent");
    assert.equal(n.sent, false);
    assert.equal(n.name, r.shortlist[i].name);
    assert.ok(n.subject.includes(r.shortlist[i].name));
    assert.match(n.body, /Guarantee: ___/);
    assert.match(n.body, /^Our crowd came for /m);
    assert.deepEqual(validateAgentOutput({ shortlist: [r.shortlist[i]], offer_note: n }, [r]).errors.filter((e) => /offer_note/.test(e)), []);
  }
  assert.ok(r.calls.length > 0);
  for (const c of r.calls) assert.deepEqual(Object.keys(c).sort(), ['cache', 'endpoint', 'ms', 'params_masked']);
  assert.doesNotMatch(JSON.stringify(r), /affinity|touring nearby/i);
  // The scripted plan makes no decision of its own: no question, no ablate check, no thin-signal answer.
  assert.ok(r.shortlist.every((x) => !('check' in x)));
  assert.equal(r.thin_signal, undefined);
  assert.equal(r.answers, undefined);
  assert.ok(!events.some((e) => e.event === 'question'));
  await app.close();
});

test('plan: input errors come back as JSON before any stream', async () => {
  const { app } = await appWith({ AGENT_MODE: 'scripted' });
  assert.equal((await plan(app, { venue_id: 'nope', date: '2026-11-04' })).res.statusCode, 404);
  assert.equal((await plan(app, { venue_id: 'example-room', date: '04/11/2026' })).res.statusCode, 400);
  assert.equal((await plan(app, { date: '2026-11-04' })).res.statusCode, 400);
  assert.equal((await plan(app, { venue_id: 'example-room', date: '2026-11-02' })).res.statusCode, 409, 'closed Monday');
  const today = await plan(app, { venue_id: 'example-room', date: '2026-10-11' });
  assert.equal(today.res.statusCode, 409, 'today is too late to plan');
  assert.match(today.res.json().error, /today; plans start from tomorrow/);
  assert.equal((await plan(app, { venue_id: 'example-room', date: '2026-10-07' })).res.statusCode, 409, 'past night');
  assert.equal((await app.inject({ method: 'POST', url: '/api/ablate', payload: { venue_id: 'example-room', date: '2026-10-11', remove: [] } })).statusCode, 409);
  await app.close();
});

test('plan without a Qloo key and no recorded run: error event, nothing ranked', async () => {
  const config = loadConfig({ DATA_DIR: freshDir(), VENUES_DIR });
  const app = await buildApp(config, { now: TEST_NOW });
  const [night] = await darkNights(app);
  const { events } = await plan(app, { venue_id: 'example-room', date: night });
  assert.deepEqual(events.map((e) => e.event), ['error']);
  assert.equal(events[0].data.code, 'qloo_not_connected');
  assert.equal((await app.inject({ method: 'POST', url: '/api/ablate', payload: { venue_id: 'example-room', date: night, remove: [] } })).statusCode, 409);
  await app.close();
});

/** A saved live run in DATA_DIR/recorded, as plan.js writes it. The result is a small synthetic stand-in. */
async function writeRecorded(dataDir, { venue_id = 'example-room', date, saved_at = '2026-10-10T20:00:00.000Z', qloo = 'live' }) {
  await mkdir(path.join(dataDir, 'recorded'), { recursive: true });
  const result = {
    mode: { agent: 'live', qloo }, night: { date }, steps: ['Reading your last 3 shows', 'Sizing to your room'],
    shortlist: [{ entity_id: 'synthetic-artist-1', name: 'Synthetic Act 1', rank: 1, why: 'Your crowd came for Synthetic Act 101.', evidence: { contributions: [], method: 'explainability' } }],
    also_loves: [], calls: [], fallbacks: [],
  };
  await writeFile(path.join(dataDir, 'recorded', `${venue_id}__${date}__${saved_at.replace(/[:.]/g, '-')}.json`), JSON.stringify({ saved_at, venue_id, date, model: 'claude-haiku-5-5', result }));
  return result;
}

test('plan without a Qloo key but with a recorded live run for that night: the run is played back, labelled recorded', async () => {
  const dataDir = freshDir();
  const probe = await buildApp(loadConfig({ DATA_DIR: dataDir, VENUES_DIR }), { now: TEST_NOW });
  const [night, other] = await darkNights(probe);
  await probe.close();
  const saved = await writeRecorded(dataDir, { date: night });
  await writeRecorded(dataDir, { date: night, saved_at: '2026-10-09T20:00:00.000Z' }); // an older run of the same night is not used

  const app = await buildApp(loadConfig({ DATA_DIR: dataDir, VENUES_DIR }), { now: TEST_NOW });
  const { events } = await plan(app, { venue_id: 'example-room', date: night });
  assert.deepEqual(events.map((e) => e.event), ['step', 'step', 'result']);
  assert.deepEqual(events.slice(0, 2).map((e) => e.data.label), saved.steps);
  const r = resultOf(events);
  // Neither part is live: Claude and Qloo both come from the recording.
  assert.deepEqual(r.mode, { agent: 'recorded', qloo: 'recorded', recorded_at: '2026-10-10T20:00:00.000Z' });
  assert.deepEqual(r.shortlist, saved.shortlist);
  // A night with no recording keeps the honest error; switching a show off still needs Qloo.
  assert.deepEqual((await plan(app, { venue_id: 'example-room', date: other })).events.map((e) => e.data.code), ['qloo_not_connected']);
  assert.equal((await app.inject({ method: 'POST', url: '/api/ablate', payload: { venue_id: 'example-room', date: night, remove: [] } })).statusCode, 409);
  await app.close();

  // AGENT_MODE=scripted never plays a recording back.
  const scripted = await buildApp(loadConfig({ DATA_DIR: dataDir, VENUES_DIR, AGENT_MODE: 'scripted' }), { now: TEST_NOW });
  assert.deepEqual((await plan(scripted, { venue_id: 'example-room', date: night })).events.map((e) => e.data.code), ['qloo_not_connected']);
  await scripted.close();

  // With Qloo connected (a stand-in client that must not be called) the replay is still not "Qloo: live".
  const untouched = new Proxy({}, { get: (_, k) => () => { throw new Error(`Qloo ${String(k)} called during a replay`); } });
  const connected = await buildApp(loadConfig({ DATA_DIR: dataDir, VENUES_DIR, QLOO_API_KEY: 'test-stand-in', AGENT_MODE: 'recorded' }), { now: TEST_NOW, qloo: untouched });
  assert.equal((await connected.inject('/api/health')).json().qloo, 'live');
  assert.deepEqual(resultOf((await plan(connected, { venue_id: 'example-room', date: night })).events).mode,
    { agent: 'recorded', qloo: 'recorded', recorded_at: '2026-10-10T20:00:00.000Z' });
  await connected.close();
});

// ---- /api/ablate ----

test('ablate: switching off the top contributor re-ranks; nothing removed changes nothing', async () => {
  const { app } = await appWith({ AGENT_MODE: 'scripted' });
  const [night] = await darkNights(app);
  const r = resultOf((await plan(app, { venue_id: 'example-room', date: night })).events);
  const top = r.shortlist[0].evidence.contributions[0].entity_id;
  const ab = await app.inject({ method: 'POST', url: '/api/ablate', payload: { venue_id: 'example-room', date: night, remove: [top] } });
  assert.equal(ab.statusCode, 200);
  const body = ab.json();
  assert.equal(body.of, 5);
  assert.ok(Number.isInteger(body.changed));
  assert.equal(body.shortlist.length, 5);
  assert.equal(body.removed[0].entity_id, top);
  assert.ok(body.calls.every((c) => c.cache === 'hit' || c.cache === 'miss'));
  const none = (await app.inject({ method: 'POST', url: '/api/ablate', payload: { venue_id: 'example-room', date: night, remove: [] } })).json();
  assert.equal(none.changed, 0);
  assert.equal((await app.inject({ method: 'POST', url: '/api/ablate', payload: { venue_id: 'example-room', date: night, remove: 'x' } })).statusCode, 400);
  await app.close();
});

test('crowd and ablate: per-IP daily limit, a count per route, 429 past it; the plan count is not touched', async () => {
  const budget = createBudget({ dailyCap: 2, totalCap: 30, ipLimit: 2, prices: { inPerMTok: 2, outPerMTok: 10 } });
  const { app } = await appWith({ AGENT_MODE: 'scripted' }, { budget });
  const cal = (await app.inject(`/api/venues/example-room/calendar?from=${FROM}&days=60`)).json();
  const booked = cal.nights.find((x) => x.status === 'booked').date;
  const night = cal.nights.find((x) => x.status === 'dark').date;
  const crowd = (headers = {}) => app.inject({ url: `/api/venues/example-room/crowd?date=${booked}`, headers });
  const ablate = (headers = {}) => app.inject({ method: 'POST', url: '/api/ablate', payload: { venue_id: 'example-room', date: night, remove: [] }, headers });
  // A refused input is not counted.
  assert.equal((await app.inject('/api/venues/example-room/crowd?date=2026-13-01')).statusCode, 400);
  for (const call of [crowd, ablate]) {
    assert.equal((await call()).statusCode, 200);
    assert.equal((await call()).statusCode, 200);
    const over = await call();
    assert.equal(over.statusCode, 429);
    assert.equal(over.json().code, 'ip_daily_limit');
    assert.match(over.json().error, /00:00 UTC/);
    assert.equal((await call({ 'x-forwarded-for': '203.0.113.7' })).statusCode, 200, 'another address has its own count');
  }
  assert.deepEqual(budget.checkIp('127.0.0.1'), { ok: true, count: 1 }, 'the plan route\'s count for this address is still empty');
  await app.close();
});

// ---- live loop with a stand-in SDK (no real Claude call) ----

const usage = { input_tokens: 1000, output_tokens: 200 };
const toolUse = (name, input = {}) => ({ type: 'tool_use', id: `tu-${name}-${Math.random().toString(36).slice(2, 8)}`, name, input });
const reply = (...blocks) => ({ content: blocks, stop_reason: 'tool_use', usage });

// Tools whose results are plain text ("accepted", "asked", a rejection), not tool output JSON.
const TEXT_RESULTS = new Set(['submit_plan', 'report_thin_signal', 'ask_booker']);

/** Tool results the loop sent back so far, by tool name (parsed). */
function resultsByTool(messages) {
  const names = new Map();
  for (const m of messages) {
    if (m.role === 'assistant') for (const b of m.content) if (b.type === 'tool_use') names.set(b.id, b.name);
  }
  const out = {};
  for (const m of messages) {
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    for (const b of m.content) if (b.type === 'tool_result' && !TEXT_RESULTS.has(names.get(b.tool_use_id))) out[names.get(b.tool_use_id)] = JSON.parse(b.content);
  }
  return out;
}

/** A scripted stand-in for the Messages API: each turn is a function of the messages so far. */
function fakeClaude(turns) {
  const calls = [];
  const client = {
    messages: {
      create: async (params) => {
        calls.push(structuredClone(params));
        const turn = turns[calls.length - 1];
        if (!turn) throw new Error('no more scripted turns');
        return turn(params.messages);
      },
    },
  };
  return { factory: () => client, calls };
}

const gatherTurn = () => reply(toolUse('read_calendar'), toolUse('resolve_entities'), toolUse('build_pool'), toolUse('rank_pool'));
const detailTurn = (messages) => {
  const top = resultsByTool(messages).rank_pool.ranked[0].entity_id;
  return reply(toolUse('explain'), toolUse('also_loves'), toolUse('draft_offer', { entity_id: top }));
};
const answer = (edit = (x) => x) => (messages) => {
  const r = resultsByTool(messages);
  const acts = r.explain.acts;
  const input = {
    shortlist: acts.map((a) => ({ entity_id: a.entity_id, why: a.suggested_why })),
    also_loves: r.also_loves.also_loves.slice(0, 1).map(({ type, category }) => ({ type, category })),
    offer_note: { entity_id: r.draft_offer.entity_id, subject: r.draft_offer.subject, body: r.draft_offer.body },
  };
  return reply(toolUse('submit_plan', edit(input)));
};

test('live: tool loop, one rejected answer, then an accepted one; usage booked, run recorded for replay', async () => {
  const fake = fakeClaude([
    gatherTurn,
    detailTurn,
    answer((x) => ({ ...x, shortlist: [{ entity_id: 'synthetic-artist-999', why: 'Expect 340 tickets.' }, ...x.shortlist.slice(1)] })),
    answer((x) => ({ ...x, shortlist: x.shortlist.map((s, i) => (i === 0 ? { ...s, why: 'Your crowd keeps coming back for this sound.' } : s)) })),
  ]);
  const { app, config, budget } = await appWith({ ANTHROPIC_API_KEY: 'sk-test-not-real', AGENT_MODE: 'auto' }, { anthropic: fake.factory });
  const [night] = await darkNights(app);
  const r = resultOf((await plan(app, { venue_id: 'example-room', date: night })).events);
  assert.deepEqual(r.mode, { agent: 'live', qloo: 'fixture' });
  assert.equal(fake.calls.length, 4);
  assert.equal(fake.calls[0].model, 'claude-haiku-5-5');
  assert.deepEqual(fake.calls[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual(fake.calls[0].thinking, { type: 'adaptive' });
  assert.ok(fake.calls[0].tools.some((t) => t.name === 'submit_plan'));
  const rejection = fake.calls[3].messages.at(-1).content.find((b) => b.is_error);
  assert.match(rejection.content, /synthetic-artist-999/);
  assert.match(rejection.content, /"340"/);
  assert.equal(r.shortlist.length, 5);
  assert.equal(r.shortlist[0].why, 'Your crowd keeps coming back for this sound.');
  assert.equal(r.also_loves.length, 1);
  assert.equal(r.offer_note.to, "artist's booking agent");
  assert.equal(r.offer_note.sent, false);
  assert.match(r.offer_note.body, /^Our crowd came for /m);
  assert.equal(r.offer_notes.length, 5);
  assert.equal(r.offer_notes[0].body, r.offer_note.body);
  assert.equal(r.llm.turns, 4);
  assert.equal(r.llm.usage.input_tokens, 4000);
  assert.equal(budget.snapshot().day_usd, 4 * (1000 * 2 + 200 * 10) / 1e6);
  assert.doesNotMatch(JSON.stringify(r), /sk-test-not-real/);
  const saved = await readdir(path.join(config.dataDir, 'recorded'));
  assert.equal(saved.length, 1);
  assert.match(saved[0], new RegExp(`^example-room__${night}__`));

  // Without a key the same night replays that run, labelled as recorded.
  const replay = await buildApp({ ...config, anthropic: { ...config.anthropic, apiKey: undefined } }, { budget });
  const events = (await plan(replay, { venue_id: 'example-room', date: night })).events;
  const rec = resultOf(events);
  assert.equal(rec.mode.agent, 'recorded');
  assert.equal(rec.mode.qloo, 'fixture', 'a run recorded on synthetic test data keeps that label');
  assert.match(rec.mode.recorded_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(rec.shortlist, r.shortlist);
  assert.ok(events.some((e) => e.event === 'step'));
  // Another night has no recording: scripted.
  const other = (await darkNights(replay)).find((d) => d !== night);
  assert.equal(resultOf((await plan(replay, { venue_id: 'example-room', date: other })).events).mode.agent, 'scripted');
  await replay.close();
  await app.close();
});

test('live: two rejected answers fall back to the scripted plan, with the reason in fallbacks', async () => {
  const bad = answer((x) => ({ ...x, shortlist: x.shortlist.map((s) => ({ ...s, why: 'Sold 1234 seats last time.' })) }));
  const fake = fakeClaude([gatherTurn, detailTurn, bad, bad]);
  const { app } = await appWith({ ANTHROPIC_API_KEY: 'k' }, { anthropic: fake.factory });
  const [night] = await darkNights(app);
  const r = resultOf((await plan(app, { venue_id: 'example-room', date: night })).events);
  assert.equal(r.mode.agent, 'scripted');
  const fb = r.fallbacks.find((f) => f.step === 'agent');
  assert.equal(fb.reason, 'rejected');
  assert.equal(fb.used, 'scripted plan');
  assert.match(fb.detail.join(), /1234/);
  assert.equal(r.shortlist.length, 5);
  await app.close();
});

test('live: an answer without submit_plan, then max turns, also ends scripted', async () => {
  const text = () => ({ content: [{ type: 'text', text: 'Here is my plan.' }], stop_reason: 'end_turn', usage });
  const fake = fakeClaude([text, text]);
  const { app } = await appWith({ ANTHROPIC_API_KEY: 'k' }, { anthropic: fake.factory });
  const [night] = await darkNights(app);
  const r = resultOf((await plan(app, { venue_id: 'example-room', date: night })).events);
  assert.equal(r.mode.agent, 'scripted');
  assert.equal(fake.calls.length, 2);

  const loop = fakeClaude(Array.from({ length: MAX_TURNS + 2 }, () => () => reply(toolUse('read_calendar'))));
  const b = await appWith({ ANTHROPIC_API_KEY: 'k' }, { anthropic: loop.factory });
  const r2 = resultOf((await plan(b.app, { venue_id: 'example-room', date: night })).events);
  assert.equal(loop.calls.length, MAX_TURNS);
  assert.equal(r2.fallbacks.find((f) => f.step === 'agent').reason, 'max_turns');
  await b.app.close();
  await app.close();
});

test('live: a spent cap or the IP limit means no Claude call at all', async () => {
  const fake = fakeClaude([]);
  const budget = createBudget({ dailyCap: 2, totalCap: 30, ipLimit: 1, prices: { inPerMTok: 2, outPerMTok: 10 } });
  budget.record({ input_tokens: 1_000_000 });
  const { app } = await appWith({ ANTHROPIC_API_KEY: 'k' }, { anthropic: fake.factory, budget });
  const [night] = await darkNights(app);
  const r = resultOf((await plan(app, { venue_id: 'example-room', date: night })).events);
  assert.equal(r.mode.agent, 'scripted');
  assert.equal(r.fallbacks[0].reason, 'daily_cap');
  assert.equal(fake.calls.length, 0);

  const fresh = createBudget({ dailyCap: 2, totalCap: 30, ipLimit: 1, prices: { inPerMTok: 2, outPerMTok: 10 } });
  const b = await appWith({ ANTHROPIC_API_KEY: 'k', AGENT_MODE: 'scripted' }, { anthropic: fake.factory, budget: fresh });
  await plan(b.app, { venue_id: 'example-room', date: night }, { 'x-forwarded-for': '203.0.113.7' });
  const c = await appWith({ ANTHROPIC_API_KEY: 'k' }, { anthropic: fake.factory, budget: fresh });
  const r2 = resultOf((await plan(c.app, { venue_id: 'example-room', date: night }, { 'x-forwarded-for': '203.0.113.7' })).events);
  assert.equal(r2.fallbacks[0].reason, 'ip_daily_limit');
  assert.equal(fake.calls.length, 0);
  await Promise.all([app.close(), b.app.close(), c.app.close()]);
});

test('recorded mode: an unreadable file in recorded/ is skipped', async () => {
  const dataDir = freshDir();
  await mkdir(path.join(dataDir, 'recorded'), { recursive: true });
  await writeFile(path.join(dataDir, 'recorded', 'broken.json'), '{');
  const { app } = await appWith({ DATA_DIR: dataDir, AGENT_MODE: 'recorded' });
  const [night] = await darkNights(app);
  assert.equal(resultOf((await plan(app, { venue_id: 'example-room', date: night })).events).mode.agent, 'scripted');
  await app.close();
});

test('offer note names the locality when the room has one, else the city', () => {
  const act = { entity_id: 'synthetic-artist-1', name: 'Synthetic Act A' };
  const venue = { name: 'Synthetic Room', city: 'Exampleville', capacity_band: '250-500' };
  assert.match(offerNote({ venue, day: 'Tue Nov 10', act }).body, /Synthetic Room in Exampleville/);
  const note = offerNote({ venue: { ...venue, locality: 'Synthetic Town' }, day: 'Tue Nov 10', act }).body;
  assert.match(note, /Synthetic Room in Synthetic Town/);
  assert.match(note, /Room: Synthetic Room, Synthetic Town \(capacity band 250-500\)/);
  assert.doesNotMatch(note, /Exampleville/);
});

// ---- decisions only the live agent makes (stand-in SDK, synthetic fixtures) ----

/** A copy of the synthetic venues with Example Room's past shows edited. */
async function venuesWith(name, editPast) {
  const dir = path.join(tmp, `venues-${name}`);
  await mkdir(dir, { recursive: true });
  for (const f of ['example-room.json', 'other-hall.json']) {
    const v = JSON.parse(await readFile(path.join(VENUES_DIR, f), 'utf8'));
    if (v.id === 'example-room') v.past_shows = editPast(v.past_shows);
    await writeFile(path.join(dir, f), JSON.stringify(v));
  }
  return dir;
}
// "Synthetic Act" has search results but no exact match: resolve_entities lists it under needs_input with 3 candidates.
const AMBIGUOUS = 'Synthetic Act';
const withAmbiguous = (past) => [...past, { date: '2026-10-05', headliner: AMBIGUOUS, source_url: 'https://example.org/shows/2026-10-05' }];

test('live: the agent asks which artist an ambiguous past headliner was; the answer reruns the plan from resolve_entities', async () => {
  const VENUES = await venuesWith('ask', withAmbiguous);
  let asked;
  let rerun;
  const fake = fakeClaude([
    () => reply(toolUse('read_calendar'), toolUse('resolve_entities')),
    (messages) => {
      asked = resultsByTool(messages).resolve_entities;
      return reply(toolUse('ask_booker', { name: asked.needs_input[0].name }));
    },
    gatherTurn,
    (messages) => {
      rerun = resultsByTool(messages).resolve_entities;
      return detailTurn(messages);
    },
    answer(),
  ]);
  const { app, config } = await appWith({ ANTHROPIC_API_KEY: 'k', VENUES_DIR: VENUES }, { anthropic: fake.factory });
  const [night] = await darkNights(app);

  const first = await plan(app, { venue_id: 'example-room', date: night, ask: true });
  assert.deepEqual(asked.needs_input.map((x) => x.name), [AMBIGUOUS]);
  assert.ok(fake.calls[0].tools.some((t) => t.name === 'ask_booker'));
  assert.match(fake.calls[0].system, /ask_booker/);
  assert.equal(first.events.at(-1).event, 'question');
  assert.ok(!first.events.some((e) => e.event === 'result'));
  const q = first.events.at(-1).data;
  assert.deepEqual(q.mode, { agent: 'live', qloo: 'fixture' });
  assert.equal(q.question.name, AMBIGUOUS);
  assert.deepEqual(q.question.candidates.map((c) => c.entity_id), ['synthetic-artist-1', 'synthetic-artist-2', 'synthetic-artist-3']);
  assert.deepEqual(q.question.candidates.map((c) => c.name), ['Synthetic Act 1', 'Synthetic Act 2', 'Synthetic Act 3']);
  assert.deepEqual(q.question.played_here, ['2026-10-05']);
  assert.equal(q.steps.at(-1), `Asking you: which ${AMBIGUOUS}?`);
  assert.equal(first.events.filter((e) => e.event === 'step').at(-1).data.label, `Asking you: which ${AMBIGUOUS}?`);
  await assert.rejects(readdir(path.join(config.dataDir, 'recorded')), 'a question is not a recorded run');

  const picked = q.question.candidates[1];
  const second = await plan(app, { venue_id: 'example-room', date: night, ask: true, answers: [{ name: AMBIGUOUS, entity_id: picked.entity_id }] });
  const r = resultOf(second.events);
  assert.deepEqual(r.mode, { agent: 'live', qloo: 'fixture' });
  assert.equal(fake.calls.length, 5);
  assert.ok(!fake.calls[2].tools.some((t) => t.name === 'ask_booker'), 'one question per night');
  assert.doesNotMatch(fake.calls[2].system, /ask_booker/);
  // resolve_entities ran again with the answer: the picked artist is in the signal, nothing is waiting for an answer.
  assert.deepEqual(rerun.needs_input, []);
  assert.deepEqual(rerun.answered_by_booker, [{ name: AMBIGUOUS, entity_id: picked.entity_id, picked: picked.name }]);
  // The signal keeps show order (each act by its most recent show here), the picked artist in the ambiguous show's place.
  const latest = new Map();
  for (const x of JSON.parse(await readFile(path.join(VENUES, 'example-room.json'), 'utf8')).past_shows) {
    if (x.date < night && !(latest.get(x.headliner) > x.date)) latest.set(x.headliner, x.date);
  }
  const order = [...latest].sort((a, b) => (a[1] < b[1] ? 1 : -1)).map(([t]) => (t === AMBIGUOUS ? picked.name : t));
  assert.deepEqual(rerun.signal.map((x) => x.name), order);
  assert.notEqual(order[0], picked.name, 'the ambiguous show is not the most recent one, so the order is a real check');
  assert.equal(rerun.counts.answered, 1);
  const steps = second.events.filter((e) => e.event === 'step').map((e) => e.data.label);
  assert.equal(steps[steps.indexOf('Looking those acts up in the taste graph') + 1], `Asked you: which ${AMBIGUOUS}?`);
  assert.deepEqual(r.answers, [{ name: AMBIGUOUS, entity_id: picked.entity_id, picked: picked.name }]);
  assert.equal(r.signal.size, 7);
  // The picked artist is now part of this room's crowd, so build_pool leaves it out of the pool.
  assert.ok(!r.shortlist.some((x) => x.entity_id === picked.entity_id));
  assert.equal(r.shortlist.length, 5);
  assert.equal((await readdir(path.join(config.dataDir, 'recorded'))).length, 1);

  // Played back later (no Claude key), the step no longer says the viewer was asked.
  const replay = await buildApp({ ...config, anthropic: { ...config.anthropic, apiKey: undefined } }, { now: TEST_NOW });
  const played = (await plan(replay, { venue_id: 'example-room', date: night })).events;
  const playedSteps = played.filter((e) => e.event === 'step').map((e) => e.data.label);
  assert.equal(resultOf(played).mode.agent, 'recorded');
  assert.ok(playedSteps.includes(`Asked when this run was recorded: which ${AMBIGUOUS}?`));
  assert.ok(!playedSteps.some((x) => x.startsWith('Asked you')));
  assert.deepEqual(resultOf(played).steps, playedSteps);
  assert.deepEqual((await replay.inject(`/api/recorded/example-room/${night}`)).json().steps, playedSteps);
  await replay.close();
  await app.close();
});

test('plan: answers apply in every mode; "none of these" counts as not found; an id outside the candidates is ignored', async () => {
  const VENUES = await venuesWith('answers', withAmbiguous);
  const { app } = await appWith({ AGENT_MODE: 'scripted', VENUES_DIR: VENUES });
  const [night] = await darkNights(app);
  const base = resultOf((await plan(app, { venue_id: 'example-room', date: night, ask: true })).events);
  assert.equal(base.mode.agent, 'scripted');
  assert.equal(base.signal.counts.needs_input, 1, 'the scripted plan does not ask');
  assert.ok(!base.steps.some((x) => /^Ask/.test(x)));

  const none = resultOf((await plan(app, { venue_id: 'example-room', date: night, answers: [{ name: AMBIGUOUS, entity_id: null }] })).events);
  assert.equal(none.signal.counts.needs_input, 0);
  assert.equal(none.signal.counts.unresolved, base.signal.counts.unresolved + 1);
  assert.equal(none.signal.size, base.signal.size);
  assert.ok(none.steps.includes(`Asked you: which ${AMBIGUOUS}?`));
  assert.deepEqual(none.answers, [{ name: AMBIGUOUS, entity_id: null, picked: null }]);

  const ghost = resultOf((await plan(app, { venue_id: 'example-room', date: night, answers: [{ name: AMBIGUOUS, entity_id: 'synthetic-artist-50' }] })).events);
  assert.equal(ghost.signal.counts.needs_input, 1);
  assert.equal(ghost.answers, undefined);

  for (const bad of [{ ask: 'yes' }, { answers: 'x' }, { answers: [{ name: 1 }] }, { answers: [{ name: 'x', entity_id: 7 }] }]) {
    const res = await app.inject({ method: 'POST', url: '/api/plan', payload: { venue_id: 'example-room', date: night, ...bad } });
    assert.equal(res.statusCode, 400, JSON.stringify(bad));
  }
  await app.close();
});

test('live: without ask (API callers, scripts/keyhour.js) the agent is not offered the question tool', async () => {
  const text = () => ({ content: [{ type: 'text', text: 'Here is my plan.' }], stop_reason: 'end_turn', usage });
  const fake = fakeClaude([text, text]);
  const { app } = await appWith({ ANTHROPIC_API_KEY: 'k', VENUES_DIR: await venuesWith('noask', withAmbiguous) }, { anthropic: fake.factory });
  const [night] = await darkNights(app);
  await plan(app, { venue_id: 'example-room', date: night });
  assert.ok(!fake.calls[0].tools.some((t) => t.name === 'ask_booker'));
  assert.ok(fake.calls[0].tools.some((t) => t.name === 'report_thin_signal'));
  await app.close();
});

test('live: when too few past headliners resolve, the agent says the signal is thin instead of ranking', async () => {
  // Only three of the six past headliners can be found; the other shows get names the synthetic search does not know.
  const keep = new Set(['Synthetic Act 101', 'Synthetic Act 102', 'Synthetic Act 103']);
  const VENUES = await venuesWith('thin', (past) => past.map((x) => (keep.has(x.headliner) ? x : { ...x, headliner: `Nobody Listed ${x.headliner.slice(-1)}` })));
  let resolved;
  const fake = fakeClaude([
    () => reply(toolUse('read_calendar'), toolUse('resolve_entities')),
    (messages) => {
      resolved = resultsByTool(messages).resolve_entities;
      return reply(toolUse('report_thin_signal', { why: 'Only 977 of them matched.' }));
    },
    () => reply(toolUse('report_thin_signal', { why: 'Add more of your past shows, or plan this night by hand.' })),
  ]);
  const { app, config } = await appWith({ ANTHROPIC_API_KEY: 'k', VENUES_DIR: VENUES }, { anthropic: fake.factory });
  const [night] = await darkNights(app);
  const { events } = await plan(app, { venue_id: 'example-room', date: night, ask: true });
  assert.deepEqual(resolved.thin, { resolved: 3, below: THIN_SIGNAL_BELOW, note: 'fewer past headliners were found than acts on the card' });
  assert.match(fake.calls[2].messages.at(-1).content[0].content, /"977"/);
  const r = resultOf(events);
  assert.deepEqual(r.mode, { agent: 'live', qloo: 'fixture' });
  assert.deepEqual(r.thin_signal, { found: 3, shows: resolved.counts.shows, why: 'Add more of your past shows, or plan this night by hand.' });
  assert.deepEqual(r.shortlist, []);
  assert.deepEqual(r.offer_notes, []);
  assert.equal(r.offer_note, null);
  assert.ok(!r.steps.includes('Sizing to your room'), 'nothing was ranked');
  // Saved like any live answer; the recorded list marks it, so the page does not open on it.
  assert.equal((await readdir(path.join(config.dataDir, 'recorded'))).length, 1);
  assert.deepEqual((await app.inject('/api/recorded')).json().runs.map((x) => x.thin), [true]);
  await app.close();

  // The scripted plan is unchanged on the same room: it ranks what it has.
  const s = await appWith({ AGENT_MODE: 'scripted', VENUES_DIR: VENUES });
  const sr = resultOf((await plan(s.app, { venue_id: 'example-room', date: night })).events);
  assert.equal(sr.mode.agent, 'scripted');
  assert.equal(sr.signal.size, 3);
  assert.equal(sr.shortlist.length, 5);
  assert.equal(sr.thin_signal, undefined);
  await s.app.close();
});

test('live: a thin-signal answer on a room whose signal is not thin is rejected; the agent then ranks', async () => {
  const fake = fakeClaude([
    () => reply(toolUse('read_calendar'), toolUse('resolve_entities'), toolUse('report_thin_signal', { why: 'Too few shows.' })),
    () => reply(toolUse('build_pool'), toolUse('rank_pool')),
    detailTurn,
    answer(),
  ]);
  const { app } = await appWith({ ANTHROPIC_API_KEY: 'k' }, { anthropic: fake.factory });
  const [night] = await darkNights(app);
  const r = resultOf((await plan(app, { venue_id: 'example-room', date: night })).events);
  const rejection = fake.calls[1].messages.at(-1).content.find((b) => b.is_error);
  assert.match(rejection.content, /the signal is not thin: 6 past headliners were found/);
  assert.equal(r.mode.agent, 'live');
  assert.equal(r.shortlist.length, 5);
  assert.equal(r.thin_signal, undefined);
  await app.close();
});

test('live: the agent switches off the past show a pick leans on (ablate), and the card carries the check', async () => {
  let ablated;
  let top;
  const fake = fakeClaude([
    gatherTurn,
    detailTurn,
    (messages) => {
      top = resultsByTool(messages).explain.acts[0];
      return reply(toolUse('ablate', { remove: [top.contributions[0].entity_id] }));
    },
    (messages) => {
      ablated = resultsByTool(messages).ablate;
      return answer()(messages);
    },
  ]);
  const { app } = await appWith({ ANTHROPIC_API_KEY: 'k' }, { anthropic: fake.factory });
  const [night] = await darkNights(app);
  const r = resultOf((await plan(app, { venue_id: 'example-room', date: night })).events);
  assert.equal(r.mode.agent, 'live');
  assert.ok(r.steps.includes('Switching off 1 past show'));
  const still = ablated.shortlist.find((x) => x.entity_id === top.entity_id);
  const pick = r.shortlist.find((x) => x.entity_id === top.entity_id);
  assert.deepEqual(pick.check, {
    removed: [{ entity_id: top.contributions[0].entity_id, name: top.contributions[0].name }],
    in_top: Boolean(still), rank_without: still?.rank ?? null, of: 5,
  });
  // Only acts whose strongest past show was the one switched off carry the check.
  for (const x of r.shortlist) {
    assert.equal('check' in x, x.evidence.contributions[0]?.entity_id === top.contributions[0].entity_id, x.name);
  }
  await app.close();
});

test('live: a number the agent sent to a tool is not a source (ablate ignored ids, unknown tool names); the step counts real switch-offs', async () => {
  const fake = fakeClaude([
    gatherTurn,
    detailTurn,
    (messages) => {
      const show = resultsByTool(messages).resolve_entities.signal[0].entity_id;
      return reply(toolUse('ablate', { remove: [show, '48213', 'synthetic-artist-48213'] }), toolUse('lookup_48213'));
    },
    answer((x) => ({ ...x, shortlist: x.shortlist.map((s, i) => (i === 0 ? { ...s, why: 'Last time 48213 people came.' } : s)) })),
    answer(),
  ]);
  const { app } = await appWith({ ANTHROPIC_API_KEY: 'k' }, { anthropic: fake.factory });
  const [night] = await darkNights(app);
  const r = resultOf((await plan(app, { venue_id: 'example-room', date: night })).events);
  assert.deepEqual(resultsByTool(fake.calls[3].messages).ablate.ignored, ['48213', 'synthetic-artist-48213'], 'the agent still sees what was ignored');
  const rejection = fake.calls[4].messages.at(-1).content.find((b) => b.is_error);
  assert.match(rejection.content, /the number "48213" does not come from any tool output/);
  assert.equal(r.mode.agent, 'live');
  assert.equal(r.shortlist.length, 5);
  assert.ok(!JSON.stringify(r.shortlist).includes('48213'));
  assert.ok(r.steps.includes('Switching off 1 past show'), r.steps.join(' | '));
  await app.close();
});
