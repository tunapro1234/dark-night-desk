import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config.js';
import { buildApp } from '../server/app.js';
import { createBudget } from '../server/budget/budget.js';
import { MAX_TURNS, systemPrompt } from '../server/agent/loop.js';
import { TOOL_DEFS, TOOL_NAMES, popularityMaxFor, whySentence } from '../server/agent/tools.js';
import { validateAgentOutput } from '../server/agent/validate.js';

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
  for (const s of ['Finding acts your crowd also loves', 'Keeping it to acts who played Exampleville this season', 'Sizing to your room']) assert.ok(steps.includes(s), s);
  const r = resultOf(events);
  assert.deepEqual(r.mode, { agent: 'scripted', qloo: 'fixture' });
  assert.equal(r.night.date, night);
  assert.equal(r.shortlist.length, 5);
  assert.deepEqual(r.shortlist.map((x) => x.rank), [1, 2, 3, 4, 5]);
  for (const x of r.shortlist) {
    assert.match(x.entity_id, /^synthetic-artist-/);
    assert.match(x.why, /^Your crowd came for .+\. .+$/);
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

test('plan without a Qloo key: error event, nothing ranked', async () => {
  const config = loadConfig({ DATA_DIR: freshDir(), VENUES_DIR });
  const app = await buildApp(config);
  const [night] = await darkNights(app);
  const { events } = await plan(app, { venue_id: 'example-room', date: night });
  assert.deepEqual(events.map((e) => e.event), ['error']);
  assert.equal(events[0].data.code, 'qloo_not_connected');
  assert.equal((await app.inject({ method: 'POST', url: '/api/ablate', payload: { venue_id: 'example-room', date: night, remove: [] } })).statusCode, 409);
  await app.close();
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

// ---- live loop with a stand-in SDK (no real Claude call) ----

const usage = { input_tokens: 1000, output_tokens: 200 };
const toolUse = (name, input = {}) => ({ type: 'tool_use', id: `tu-${name}-${Math.random().toString(36).slice(2, 8)}`, name, input });
const reply = (...blocks) => ({ content: blocks, stop_reason: 'tool_use', usage });

/** Tool results the loop sent back so far, by tool name (parsed). */
function resultsByTool(messages) {
  const names = new Map();
  for (const m of messages) {
    if (m.role === 'assistant') for (const b of m.content) if (b.type === 'tool_use') names.set(b.id, b.name);
  }
  const out = {};
  for (const m of messages) {
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    for (const b of m.content) if (b.type === 'tool_result' && names.get(b.tool_use_id) !== 'submit_plan') out[names.get(b.tool_use_id)] = JSON.parse(b.content);
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
  assert.equal(fake.calls[0].model, 'claude-sonnet-5-5');
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
