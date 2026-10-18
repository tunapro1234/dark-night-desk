// Demo v1: the whole scripted plan through the HTTP routes, and the page script (web/app.js) driving those routes.
// Synthetic fixtures only (test/fixtures/synthetic: made-up rooms, acts and Qloo answers); no key, no network.
// The page runs in a small stand-in DOM (below), not a browser: enough to follow every branch the demo uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { loadConfig } from '../server/config.js';
import { buildApp } from '../server/app.js';
import { createBudget } from '../server/budget/budget.js';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'dnd-demo-'));
test.after(() => rm(tmp, { recursive: true, force: true }));

const VENUES_DIR = 'test/fixtures/synthetic/venues';
const TEST_NOW = () => Date.parse('2026-10-11T12:00:00Z');
const PAGE_HTML = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const PAGE_JS = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
let n = 0;

async function fixtureApp(venuesDir = VENUES_DIR) {
  const config = loadConfig({ NODE_ENV: 'test', QLOO_MODE: 'fixture', AGENT_MODE: 'scripted', DATA_DIR: path.join(tmp, `var-${++n}`), VENUES_DIR: venuesDir });
  const budget = createBudget({ dailyCap: 2, totalCap: 30, ipLimit: 20, prices: { inPerMTok: 2, outPerMTok: 10 } });
  return buildApp(config, { budget, now: TEST_NOW });
}
async function noKeyApp({ dataDir = path.join(tmp, `var-${++n}`), venuesDir = VENUES_DIR } = {}) {
  return buildApp(loadConfig({ DATA_DIR: dataDir, VENUES_DIR: venuesDir }), { now: TEST_NOW });
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

// One step label per tool, in the order the scripted plan calls them (rank_pool reports two).
const STEPS = [
  ['read_calendar', /^Reading your last \d+ shows$/],
  ['resolve_entities', /^Looking those acts up in the taste graph$/],
  ['build_pool', /^Keeping it to acts who played Exampleville in the last 90 days, with no date announced in town$/],
  ['rank_pool', /^Sizing to your room$/],
  ['rank_pool', /^Finding acts your crowd also loves$/],
  ['explain', /^Checking which past shows point to each act$/],
  ['also_loves', /^Looking at the films, places and brands this crowd likes$/],
  ['draft_offer', /^Drafting a note to .+'s booking agent$/],
];

test('demo v1 over HTTP: health, calendar, scripted plan through every tool, ablate (synthetic fixtures)', async () => {
  const app = await fixtureApp();
  const health = (await app.inject('/api/health')).json();
  assert.equal(health.qloo, 'fixture');
  assert.equal(health.agent, 'scripted');

  const cal = await app.inject('/api/venues/example-room/calendar?days=61');
  assert.equal(cal.statusCode, 200);
  const night = cal.json().nights.find((x) => x.status === 'dark').date;

  const res = await app.inject({ method: 'POST', url: '/api/plan', payload: { venue_id: 'example-room', date: night } });
  assert.equal(res.statusCode, 200);
  const events = parseSse(res.body);
  assert.deepEqual(events.map((e) => e.event), [...STEPS.map(() => 'step'), 'result'], 'eight steps, then the result, no error');
  const labels = events.filter((e) => e.event === 'step').map((e) => e.data.label);
  for (const [i, [tool, re]] of STEPS.entries()) assert.match(labels[i], re, `step ${i + 1} (${tool})`);

  const r = events.at(-1).data;
  assert.deepEqual(r.mode, { agent: 'scripted', qloo: 'fixture' });
  assert.equal(labels.at(-1), `Drafting a note to ${r.shortlist[0].name}'s booking agent`);
  assert.deepEqual(r.steps, labels, 'the result carries the same steps the stream showed');
  assert.deepEqual(r.fallbacks.filter((f) => f.step === 'agent'), []);
  // Every field the poster card and the why? panel read.
  assert.equal(r.venue.name, 'Example Room');
  assert.equal(r.night.date, night);
  assert.equal(r.shortlist.length, 5);
  for (const act of r.shortlist) {
    assert.ok(act.name && act.why && act.entity_id && Number.isInteger(act.rank));
    assert.ok(act.evidence.contributions.length && act.evidence.method);
  }
  assert.ok(r.also_loves.length >= 1);
  for (const row of r.also_loves) {
    assert.ok(TYPE_OK.has(row.type) && row.category && row.lift_range.length === 2);
    const ev = row.evidence;
    assert.ok(ev.depths.length && ev.room_share.length === ev.depths.length && ev.city_share.length === ev.depths.length);
    assert.ok(ev.measure && ev.signal_sizes && Array.isArray(ev.calls));
  }
  assert.deepEqual(r.offer_notes.map((x) => x.entity_id), r.shortlist.map((x) => x.entity_id));
  assert.ok(r.pool.city && r.pool.window && Array.isArray(r.pool.rooms) && r.pool.counts && r.pool.method);
  assert.ok(r.signal.size > 0 && r.signal.counts.shows > 0);
  assert.ok(r.calls.length > 0);

  const top = r.shortlist[0].evidence.contributions[0].entity_id;
  const ab = await app.inject({ method: 'POST', url: '/api/ablate', payload: { venue_id: 'example-room', date: night, remove: [top] } });
  assert.equal(ab.statusCode, 200);
  assert.equal(ab.json().of, 5);
  await app.close();
});
const TYPE_OK = new Set(['movie', 'place', 'brand']);

test('page: every element web/app.js looks up exists in index.html, and every button there has a handler', () => {
  const ids = new Set([...PAGE_HTML.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const used = new Set([...PAGE_JS.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
  assert.ok(used.size > 30);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by app.js but missing from index.html`);
  for (const m of PAGE_HTML.matchAll(/<button\b([^>]*)>/g)) {
    const attrs = m[1];
    if (/value="close"/.test(attrs)) continue; // closes its <form method="dialog">
    const id = attrs.match(/\bid="([^"]+)"/)?.[1];
    assert.ok(id, `a button without an id or a dialog close: ${attrs}`);
    assert.match(PAGE_JS, new RegExp(`\\$\\('${id}'\\)\\.addEventListener\\('click'`), `#${id} has no click handler`);
  }
});

// ---------- a stand-in DOM, just what web/app.js touches ----------

class El {
  constructor(tag, id) {
    this.tagName = tag.toUpperCase();
    this.nodes = [];
    this.attrs = {};
    this.dataset = {};
    this.listeners = {};
    this.hidden = false;
    this.className = '';
    this.value = '';
    this.title = '';
    this.disabled = false;
    this.tabIndex = -1;
    this.open = false;
    this.isConnected = true;
    if (id) this.id = id;
    const cls = () => new Set(this.className.split(/\s+/).filter(Boolean));
    this.classList = {
      add: (c) => { this.className = [...cls().add(c)].join(' '); },
      remove: (c) => { const s = cls(); s.delete(c); this.className = [...s].join(' '); },
      contains: (c) => cls().has(c),
    };
  }
  get children() { return this.nodes.filter((x) => x instanceof El); }
  get options() { return this.children; }
  get textContent() { return this.nodes.map((x) => (x instanceof El ? x.textContent : x)).join(''); }
  set textContent(t) { this.nodes = [String(t)]; }
  get innerText() { return this.textContent; }
  append(...xs) { for (const x of xs) this.nodes.push(x instanceof El ? x : String(x)); }
  replaceChildren(...xs) { this.nodes = []; this.append(...xs); }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = String(v);
    if (k === 'tabindex') this.tabIndex = Number(v);
    if (k === 'value') this.value = String(v);
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type) { for (const fn of this.listeners[type] ?? []) fn({ currentTarget: this, target: this, key: '', preventDefault() {} }); }
  click() { this.dispatch('click'); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  querySelectorAll(sel) {
    assert.match(sel, /^\.[\w-]+$/, `stand-in DOM handles class selectors only, got "${sel}"`);
    return this.descendants().filter((e) => e.classList.contains(sel.slice(1)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  focus() {}
  select() {}
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

/** Runs web/app.js against `app` (fetch goes to app.inject). Returns the element lookup and the requests made. */
function runPage(app) {
  const byId = new Map();
  for (const m of PAGE_HTML.matchAll(/<(\w+)([^>]*)>/g)) {
    const id = m[2].match(/\bid="([^"]+)"/)?.[1];
    if (!id) continue;
    const el = new El(m[1], id);
    el.hidden = /(^|\s)hidden(\s|$)/.test(m[2]);
    el.disabled = /(^|\s)disabled(\s|$)/.test(m[2]);
    byId.set(id, el);
  }
  const requests = [];
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method ?? 'GET';
    requests.push(`${method} ${url}`);
    const res = await app.inject({ method, url, payload: opts.body, headers: opts.headers });
    return new Response(res.body, { status: res.statusCode, headers: { 'content-type': res.headers['content-type'] ?? 'text/plain' } });
  };
  const errors = [];
  const document = {
    getElementById: (id) => byId.get(id) ?? null,
    createElement: (tag) => new El(tag),
    createElementNS: (_ns, tag) => new El(tag),
    body: new El('body'),
    activeElement: null,
  };
  const context = vm.createContext({
    document, Node: El, fetch: fetchImpl, Response, TextDecoder, AbortController, setTimeout, clearTimeout,
    matchMedia: () => ({ matches: true }),
    navigator: { clipboard: { writeText: async () => {} } },
    console: { ...console, error: (...a) => errors.push(a.join(' ')) },
  });
  vm.runInContext(PAGE_JS, context, { filename: 'web/app.js' });
  return { $: (id) => byId.get(id), requests, errors };
}

async function until(check, what, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) assert.fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
const visible = (page, ...ids) => ['night-empty', 'progress', 'fail', 'poster'].filter((id) => !page.$(id).hidden).join() === ids.join();

test('page: the scripted plan renders from the HTTP route: steps, poster, why?, switch-off, offer note (synthetic fixtures)', async () => {
  const app = await fixtureApp();
  const page = runPage(app);
  await until(() => page.$('strip').querySelectorAll('.sq-dark').length > 0, 'the calendar');
  assert.match(page.$('dark-count').textContent, /^\d+ dark nights in the next \d+ days$/);
  // No mode label before a result: the scripted label appears only on a result from the scripted path.
  assert.equal(page.$('badge-agent').textContent, 'Agent: idle');
  assert.equal(page.$('badge-qloo').textContent, 'Qloo: synthetic test data');
  assert.equal(page.$('calendar-notice').hidden, true);
  assert.equal(page.$('legend-closed').hidden, false, 'Example Room is closed on Mondays');

  page.$('strip').querySelector('.sq-dark').click();
  await until(() => !page.$('poster').hidden || !page.$('fail').hidden, 'the poster');
  assert.ok(visible(page, 'poster'), `fail panel: ${page.$('fail-text').textContent}`);
  assert.equal(page.$('badge-agent').textContent, 'Agent: scripted plan (no LLM)');
  const steps = page.$('steps').children;
  assert.equal(steps.length, STEPS.length);
  for (const [i, li] of steps.entries()) {
    assert.equal(li.className, 'done');
    assert.match(li.textContent, STEPS[i][1]);
  }
  assert.equal(page.$('poster-venue').textContent, 'Example Room \u00b7 Exampleville');
  assert.match(page.$('poster-date').textContent, /^[A-Z]{3} [A-Z]{3} \d+$/);
  const lineup = page.$('lineup').children;
  assert.equal(lineup.length, 5);
  // Under each act: build_pool's fact (where and when it played the city), then the reason line.
  for (const li of lineup) {
    assert.match(li.textContent, /^Synthetic Act \d+Played Other Hall, [A-Z][a-z]{2} \d+.*(Your crowd came for|Most of this match comes from one past show|No single past show).+why\? draft offer$/);
  }
  assert.ok(page.$('also-list').children.length >= 1);
  assert.equal(page.$('draft-offer').hidden, false);
  assert.equal(page.$('fallback-note').hidden, true);

  page.$('lineup').querySelector('.why-link').click();
  assert.equal(page.$('why').hidden, false);
  assert.match(page.$('why-act-title').textContent, /^Which past shows point to Synthetic Act \d+$/);
  assert.ok(page.$('why-bars').children.length > 0);
  // A positive share under half a percent reads "<1%", never "0%" (the synthetic first pick has one).
  const night = page.$('strip').querySelector('.sq-dark').dataset.date;
  const plan = (await app.inject({ method: 'POST', url: '/api/plan', payload: { venue_id: 'example-room', date: night } })).body;
  const first = JSON.parse(plan.split('\n\n').filter(Boolean).at(-1).split('\n')[1].slice(6)).shortlist[0];
  const tiny = first.evidence.contributions.filter((c) => c.share > 0 && c.share < 0.005);
  assert.ok(tiny.length >= 1);
  const bars = page.$('why-bars').textContent;
  assert.equal(bars.split('<1%').length - 1, 2 * tiny.length, 'once in the chart, once in the screen-reader list');
  assert.doesNotMatch(bars, /(^|[^<\d])0%/);
  assert.match(page.$('why-calls').textContent, /^\d+ requests \u00b7 \d+ from cache \u00b7 \d+ sent to Qloo/);
  page.$('why-chips').querySelector('.chip-toggle').click();
  await until(() => /changed$|Could not/.test(page.$('ablate-out').textContent), 'the switch-off result');
  assert.match(page.$('ablate-out').textContent, /^\d of 5 changed$/);
  assert.equal(page.$('ablate-list').children.length, 5);
  page.$('why-close').click();
  assert.equal(page.$('why').hidden, true);

  page.$('draft-offer').click();
  assert.equal(page.$('offer').open, true);
  assert.match(page.$('offer-to').textContent, /^To: Synthetic Act \d+'s booking agent$/);
  assert.match(page.$('offer-subject').value, /^Date inquiry: Synthetic Act \d+ at Example Room, /);
  assert.match(page.$('offer-body').value, /Guarantee: ___/);
  page.$('offer-copy').click();
  await until(() => page.$('copy-status').textContent !== '', 'the copy status');
  assert.equal(page.$('copy-status').textContent, 'Copied. Paste it into your own email.');

  assert.ok(page.requests.includes('POST /api/plan') && page.requests.includes('POST /api/ablate'));
  assert.deepEqual(page.errors, []);
  await app.close();
});

test('page without a Qloo key: says why there is no list and what still works; no plan request, no retry button', async () => {
  const app = await noKeyApp();
  const page = runPage(app);
  await until(() => page.$('strip').querySelectorAll('.sq-dark').length > 0, 'the calendar');
  await until(() => page.$('badge-backtest').textContent !== 'Back-test: checking', 'the back-test badge');
  assert.equal(page.$('badge-qloo').textContent, 'Qloo: not connected');
  assert.equal(page.$('badge-agent').textContent, 'Agent: idle (Qloo not connected)', 'no "scripted plan" label when no plan can run');
  assert.match(page.$('dark-count').textContent, /^\d+ dark nights in the next \d+ days$/);
  const notice = page.$('calendar-notice');
  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /no Qloo key, so it ranks no acts and shows no shortlist/);
  assert.match(notice.textContent, /What still works: the calendar and its dark nights for every room, and the back-test button/);
  assert.match(page.$('night-empty-text').textContent, /With Qloo connected, .+ Without it, picking a night tells you why there is no list\.$/);

  page.$('strip').querySelector('.sq-dark').click();
  assert.ok(visible(page, 'fail'));
  assert.match(page.$('fail-title').textContent, /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d+ stays open for now$/);
  assert.match(page.$('fail-text').textContent, /^Qloo: not connected\. .+ shows no list instead of a made-up one\.$/);
  assert.equal(page.$('retry').hidden, true, 'no retry button that could only fail again');
  assert.equal(page.$('badge-agent').textContent, 'Agent: idle (Qloo not connected)');
  assert.ok(page.requests.includes('GET /api/recorded'));
  assert.ok(!page.requests.some((r) => r.startsWith('POST')), 'the page does not ask for a plan it cannot get');

  assert.equal(page.$('badge-backtest').textContent, 'Back-test: not run yet');
  page.$('badge-backtest').click();
  assert.equal(page.$('backtest').open, true);
  assert.match(page.$('backtest-body').textContent, /^The back-test has not been run yet\./);
  assert.deepEqual(page.errors, []);
  await app.close();
});

test('page without a Qloo key but with a recorded run: that night opens on first load, labelled recorded; other nights stay honest', async () => {
  // A room with no closed weekday (a copy of the synthetic room) and a saved run made from the synthetic scripted plan.
  // The run is stored as if it were live so the test can check that neither badge ever says live on a replay.
  const venuesDir = path.join(tmp, 'venues-open');
  await mkdir(venuesDir, { recursive: true });
  for (const f of ['example-room.json', 'other-hall.json']) {
    const v = JSON.parse(await readFile(path.join(VENUES_DIR, f), 'utf8'));
    if (v.id === 'example-room') v.closed_weekdays = [];
    await writeFile(path.join(venuesDir, f), JSON.stringify(v));
  }
  const maker = await fixtureApp(venuesDir);
  const darks = (await maker.inject('/api/venues/example-room/calendar?days=61')).json().nights.filter((x) => x.status === 'dark').map((x) => x.date);
  const night = darks[1];
  const made = parseSse((await maker.inject({ method: 'POST', url: '/api/plan', payload: { venue_id: 'example-room', date: night } })).body).at(-1).data;
  await maker.close();
  const dataDir = path.join(tmp, 'var-open');
  await mkdir(path.join(dataDir, 'recorded'), { recursive: true });
  const savedAt = '2026-10-10T20:00:00.000Z';
  await writeFile(path.join(dataDir, 'recorded', `example-room__${night}__x.json`),
    JSON.stringify({ saved_at: savedAt, venue_id: 'example-room', date: night, result: { ...made, mode: { agent: 'live', qloo: 'live' } } }));

  const app = await noKeyApp({ dataDir, venuesDir });
  const page = runPage(app);
  await until(() => !page.$('poster').hidden, 'the recorded card, with no click');
  assert.equal(page.$('badge-agent').textContent, 'Agent: recorded run from Oct 10, 2026');
  assert.equal(page.$('badge-qloo').textContent, 'Qloo: recorded Oct 10, 2026');
  assert.equal(page.$('lineup').children.length, made.shortlist.length);
  assert.equal(page.$('strip').querySelectorAll('.sq-dark').find((b) => b.dataset.date === night).getAttribute('aria-pressed'), 'true');
  assert.ok(page.requests.includes(`GET /api/recorded/example-room/${night}`));
  assert.ok(!page.requests.some((r) => r.startsWith('POST')), 'first load reads the recording; it asks for no plan');
  assert.equal(page.$('legend-closed').hidden, true, 'no closed weekday at this room');
  assert.match(page.$('calendar-notice').textContent, /Nights with a recorded live run play that run back, labelled recorded: Example Room [A-Z][a-z]{2} [A-Z][a-z]{2} \d+\. Every other night shows no list\./);

  // why?: the requests were made when the run was saved; switching a show off needs Qloo and sends nothing.
  page.$('lineup').querySelector('.why-link').click();
  assert.match(page.$('why-calls').textContent, /^Recorded Oct 10, 2026: these requests were made when the run was saved; none is sent now\./);
  page.$('why-chips').querySelector('.chip-toggle').click();
  assert.match(page.$('ablate-out').textContent, /not connected on this server\. The card above is the recorded run\.$/);
  page.$('why-close').click();

  // A night with no recording: the honest text, idle badge, no request.
  page.$('strip').querySelectorAll('.sq-dark').find((b) => b.dataset.date === darks[0]).click();
  assert.ok(visible(page, 'fail'));
  assert.match(page.$('fail-title').textContent, /stays open for now$/);
  assert.equal(page.$('badge-agent').textContent, 'Agent: idle (Qloo not connected)');
  assert.equal(page.$('badge-qloo').textContent, 'Qloo: not connected');
  assert.ok(!page.requests.some((r) => r.startsWith('POST')));

  // Back to the recorded night: POST /api/plan plays the run back.
  page.$('strip').querySelectorAll('.sq-dark').find((b) => b.dataset.date === night).click();
  await until(() => !page.$('poster').hidden, 'the replayed card');
  assert.ok(page.requests.includes('POST /api/plan'));
  assert.equal(page.$('badge-agent').textContent, 'Agent: recorded run from Oct 10, 2026');
  assert.equal(page.$('badge-qloo').textContent, 'Qloo: recorded Oct 10, 2026');
  assert.ok(!page.requests.includes('POST /api/ablate'));

  // A room with no recorded run: nothing can show a card there, and the badge says so before any pick.
  const select = page.$('venue');
  select.value = 'other-hall';
  select.dispatch('change');
  await until(() => page.$('strip').querySelectorAll('.sq-dark').length > 0, 'the other room');
  assert.equal(page.$('badge-agent').textContent, 'Agent: idle (Qloo not connected)');
  assert.equal(page.$('badge-qloo').textContent, 'Qloo: not connected');
  assert.deepEqual(page.errors, []);
  await app.close();
});

test('page with Qloo connected and a recorded run: switching a show off says the new ranking is made now', async () => {
  // Synthetic fixtures, no Claude key, AGENT_MODE=auto: the saved run opens on first load as recorded.
  const dataDir = path.join(tmp, 'var-rec-fixture');
  const maker = await fixtureApp();
  const night = (await maker.inject('/api/venues/example-room/calendar?days=61')).json().nights.find((x) => x.status === 'dark').date;
  const made = parseSse((await maker.inject({ method: 'POST', url: '/api/plan', payload: { venue_id: 'example-room', date: night } })).body).at(-1).data;
  await maker.close();
  await mkdir(path.join(dataDir, 'recorded'), { recursive: true });
  await writeFile(path.join(dataDir, 'recorded', `example-room__${night}__x.json`),
    JSON.stringify({ saved_at: '2026-10-10T20:00:00.000Z', venue_id: 'example-room', date: night, result: made }));
  const config = loadConfig({ NODE_ENV: 'test', QLOO_MODE: 'fixture', DATA_DIR: dataDir, VENUES_DIR });
  const app = await buildApp(config, { budget: createBudget({ dailyCap: 2, totalCap: 30, ipLimit: 20, prices: { inPerMTok: 2, outPerMTok: 10 } }), now: TEST_NOW });
  const page = runPage(app);
  await until(() => !page.$('poster').hidden, 'the recorded card');
  assert.equal(page.$('badge-agent').textContent, 'Agent: recorded run from Oct 10, 2026');
  assert.equal(page.$('badge-qloo').textContent, 'Qloo: synthetic test data');
  page.$('lineup').querySelector('.why-link').click();
  page.$('why-chips').querySelector('.chip-toggle').click();
  await until(() => /changed|Could not/.test(page.$('ablate-out').textContent), 'the switch-off result');
  assert.match(page.$('ablate-out').textContent, /^\d+ of \d+ changed in a ranking made now; the card above is the recorded run from Oct 10, 2026$/);
  assert.ok(page.requests.includes('POST /api/ablate'));
  assert.deepEqual(page.errors, []);
  await app.close();
});

test('page: the today legend is short', () => {
  assert.match(PAGE_HTML, /<\/span> today: too late to plan<\/li>/);
});

// ---------- the live agent's own decisions on the page (stand-in Claude, synthetic fixtures; no key, no network) ----------

const usage = { input_tokens: 1000, output_tokens: 200 };
let tu = 0;
const toolUse = (name, input = {}) => ({ type: 'tool_use', id: `tu-${++tu}`, name, input });
const reply = (...blocks) => ({ content: blocks, stop_reason: 'tool_use', usage });
function resultsByTool(messages) {
  const names = new Map();
  for (const m of messages) if (m.role === 'assistant') for (const b of m.content) if (b.type === 'tool_use') names.set(b.id, b.name);
  const out = {};
  for (const m of messages) {
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    for (const b of m.content) if (b.type === 'tool_result' && !['submit_plan', 'report_thin_signal', 'ask_booker'].includes(names.get(b.tool_use_id))) out[names.get(b.tool_use_id)] = JSON.parse(b.content);
  }
  return out;
}
function fakeClaude(turns) {
  let i = 0;
  const client = { messages: { create: async (params) => turns[i++](params.messages) } };
  return () => client;
}
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
async function liveApp(venuesDir, turns) {
  const config = loadConfig({ NODE_ENV: 'test', QLOO_MODE: 'fixture', ANTHROPIC_API_KEY: 'k', DATA_DIR: path.join(tmp, `var-${++n}`), VENUES_DIR: venuesDir });
  const budget = createBudget({ dailyCap: 2, totalCap: 30, ipLimit: 20, prices: { inPerMTok: 2, outPerMTok: 10 } });
  return buildApp(config, { budget, now: TEST_NOW, anthropic: fakeClaude(turns) });
}

test('page, live agent: "Which one played here?" with the candidates, the answer reruns the plan, the card shows the ablate check', async () => {
  const venuesDir = await venuesWith('ask', (past) => [...past, { date: '2026-10-05', headliner: 'Synthetic Act', source_url: 'https://example.org/x' }]);
  let checked;
  const app = await liveApp(venuesDir, [
    () => reply(toolUse('read_calendar'), toolUse('resolve_entities')),
    (m) => reply(toolUse('ask_booker', { name: resultsByTool(m).resolve_entities.needs_input[0].name })),
    () => reply(toolUse('read_calendar'), toolUse('resolve_entities'), toolUse('build_pool'), toolUse('rank_pool')),
    (m) => reply(toolUse('explain'), toolUse('also_loves'), toolUse('draft_offer', { entity_id: resultsByTool(m).rank_pool.ranked[0].entity_id })),
    (m) => {
      checked = resultsByTool(m).explain.acts[0];
      return reply(toolUse('ablate', { remove: [checked.contributions[0].entity_id] }));
    },
    (m) => {
      const r = resultsByTool(m);
      return reply(toolUse('submit_plan', {
        shortlist: r.explain.acts.map((a) => ({ entity_id: a.entity_id, why: a.suggested_why })),
        offer_note: { entity_id: r.draft_offer.entity_id, subject: r.draft_offer.subject, body: r.draft_offer.body },
      }));
    },
  ]);
  const page = runPage(app);
  await until(() => page.$('strip').querySelectorAll('.sq-dark').length > 0, 'the calendar');
  page.$('strip').querySelector('.sq-dark').click();
  await until(() => !page.$('ask').hidden || !page.$('fail').hidden || !page.$('poster').hidden, 'the question');
  assert.ok(visible(page, 'progress'), `fail panel: ${page.$('fail-text').textContent}`);
  assert.equal(page.$('ask').hidden, false);
  assert.match(PAGE_HTML, /<h3 id="ask-title">Which one played here\?<\/h3>/);
  assert.equal(page.$('ask-text').textContent,
    '"Synthetic Act" played here on Oct 5. The taste graph has no exact match for that name, and the Desk does not guess. Which artist was it?');
  assert.deepEqual(page.$('ask-options').children.map((b) => b.textContent), ['Synthetic Act 1', 'Synthetic Act 2', 'Synthetic Act 3', 'None of these']);
  assert.equal(page.$('steps').children.at(-1).textContent, 'Asking you: which Synthetic Act?');
  assert.equal(page.$('badge-agent').textContent, 'Agent: live (Claude)');

  page.$('ask-options').children[1].click();
  await until(() => !page.$('poster').hidden || !page.$('fail').hidden, 'the card after the answer');
  assert.ok(visible(page, 'poster'), `fail panel: ${page.$('fail-text').textContent}`);
  assert.equal(page.$('ask').hidden, true);
  const steps = page.$('steps').children.map((li) => li.textContent);
  assert.equal(steps[steps.indexOf('Looking those acts up in the taste graph') + 1], 'Asked you: which Synthetic Act?');
  assert.equal(page.requests.filter((r) => r === 'POST /api/plan').length, 2);
  // The card: the pick whose strongest past show was switched off says what the check found; the others say nothing.
  const lines = page.$('lineup').children.map((li) => li.querySelector('.act-check')?.textContent ?? null);
  const i = page.$('lineup').children.findIndex((li) => li.querySelector('.act-name').textContent === checked.name);
  assert.match(lines[i], new RegExp(`^Checked without ${checked.contributions[0].name}, the past show this match draws on most: ${checked.name} (still ranks [1-5] of 5\\.|drops out of the top 5, so this pick rests on that show\\.)$`));
  page.$('why-night').click();
  assert.match(page.$('why-pool').textContent, /You told the Desk which artist "Synthetic Act" was: Synthetic Act 2\./);
  assert.deepEqual(page.errors, []);
  await app.close();
});

test('page, live agent: a thin signal shows why there is no ranking, in the agent\'s words and the tool counts', async () => {
  const keep = new Set(['Synthetic Act 101', 'Synthetic Act 102', 'Synthetic Act 103']);
  const venuesDir = await venuesWith('thin', (past) => past.map((x) => (keep.has(x.headliner) ? x : { ...x, headliner: `Nobody Listed ${x.headliner.slice(-1)}` })));
  const app = await liveApp(venuesDir, [
    () => reply(toolUse('read_calendar'), toolUse('resolve_entities')),
    () => reply(toolUse('report_thin_signal', { why: 'Add more of your past shows, or plan this night by hand.' })),
  ]);
  const page = runPage(app);
  await until(() => page.$('strip').querySelectorAll('.sq-dark').length > 0, 'the calendar');
  page.$('strip').querySelector('.sq-dark').click();
  await until(() => !page.$('fail').hidden || !page.$('poster').hidden, 'the answer');
  assert.ok(visible(page, 'fail'));
  assert.match(page.$('fail-title').textContent, /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d+: too little to rank on$/);
  assert.match(page.$('fail-text').textContent,
    /^Only 3 of this room's past headliners were found in the taste graph \(from \d+ past shows\), so the Desk shows no ranking\. Add more of your past shows, or plan this night by hand\.$/);
  assert.equal(page.$('retry').hidden, true);
  assert.equal(page.$('badge-agent').textContent, 'Agent: live (Claude)');
  assert.deepEqual(page.errors, []);
  await app.close();
});

test('page, recorded run that carries a booker answer: the replay says the answer was given when the run was recorded', async () => {
  const venuesDir = await venuesWith('ask-recorded', (past) => [...past, { date: '2026-10-05', headliner: 'Synthetic Act', source_url: 'https://example.org/x' }]);
  const maker = await fixtureApp(venuesDir);
  const night = (await maker.inject('/api/venues/example-room/calendar?days=61')).json().nights.find((x) => x.status === 'dark').date;
  const made = parseSse((await maker.inject({
    method: 'POST', url: '/api/plan', payload: { venue_id: 'example-room', date: night, answers: [{ name: 'Synthetic Act', entity_id: 'synthetic-artist-2' }] },
  })).body).at(-1).data;
  await maker.close();
  assert.ok(made.steps.includes('Asked you: which Synthetic Act?'));
  const dataDir = path.join(tmp, 'var-ask-recorded');
  await mkdir(path.join(dataDir, 'recorded'), { recursive: true });
  await writeFile(path.join(dataDir, 'recorded', `example-room__${night}__x.json`),
    JSON.stringify({ saved_at: '2026-10-10T20:00:00.000Z', venue_id: 'example-room', date: night, result: { ...made, mode: { agent: 'live', qloo: 'live' } } }));

  const app = await noKeyApp({ dataDir, venuesDir });
  const page = runPage(app);
  await until(() => !page.$('poster').hidden, 'the recorded card');
  const steps = page.$('steps').children.map((li) => li.textContent);
  assert.ok(steps.includes('Asked when this run was recorded: which Synthetic Act?'), steps.join(' | '));
  assert.ok(!steps.some((x) => x.startsWith('Asked you')));
  page.$('why-night').click();
  assert.match(page.$('why-pool').textContent, /When this run was recorded, the Desk was told which artist "Synthetic Act" was: Synthetic Act 2\./);
  assert.doesNotMatch(page.$('why-pool').textContent, /You told the Desk/);
  assert.deepEqual(page.errors, []);
  await app.close();
});
