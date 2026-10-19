// The page script (web/app.js) on two card details: the line naming the rooms the pool came from, and "Copy this week".
// Synthetic fixtures only (test/fixtures/synthetic: made-up rooms, acts and Qloo answers); no key, no network.
// The page runs in a small stand-in DOM, the same kind test/demo-v1.test.js uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { loadConfig } from '../server/config.js';
import { buildApp } from '../server/app.js';
import { createBudget } from '../server/budget/budget.js';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'dnd-week-'));
test.after(() => rm(tmp, { recursive: true, force: true }));

const VENUES_DIR = 'test/fixtures/synthetic/venues';
const TEST_NOW = () => Date.parse('2026-10-11T12:00:00Z');
const PAGE_HTML = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const PAGE_JS = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
let n = 0;

async function fixtureApp(dataDir = path.join(tmp, `var-${++n}`)) {
  const config = loadConfig({ NODE_ENV: 'test', QLOO_MODE: 'fixture', AGENT_MODE: 'scripted', DATA_DIR: dataDir, VENUES_DIR });
  const budget = createBudget({ dailyCap: 2, totalCap: 30, ipLimit: 20, prices: { inPerMTok: 2, outPerMTok: 10 } });
  return buildApp(config, { budget, now: TEST_NOW });
}
const noKeyApp = (dataDir = path.join(tmp, `var-${++n}`)) => buildApp(loadConfig({ DATA_DIR: dataDir, VENUES_DIR }), { now: TEST_NOW });

const lastResult = (body) => JSON.parse(body.split('\n\n').filter(Boolean).at(-1).split('\n')[1].slice(6));

/** The 7 nights after today (the strip's order) and the dark ones among them, for the synthetic Example Room. */
let weekOnce = null;
const week = () => (weekOnce ??= readWeek());
async function readWeek() {
  const app = await fixtureApp();
  const nights = (await app.inject('/api/venues/example-room/calendar?days=61')).json().nights.filter((x) => !x.today && x.status !== 'past');
  await app.close();
  return { inWeek: nights.slice(0, 7), darkInWeek: nights.slice(0, 7).filter((x) => x.status === 'dark').map((x) => x.date),
    darkLater: nights.slice(7).filter((x) => x.status === 'dark').map((x) => x.date) };
}

/** Saves the scripted plan for `night` as a recorded run; `edit` may change the saved result. */
async function writeRecording(dataDir, night, { name = 'x', edit = (r) => r } = {}) {
  const maker = await fixtureApp();
  const made = lastResult((await maker.inject({ method: 'POST', url: '/api/plan', payload: { venue_id: 'example-room', date: night } })).body);
  await maker.close();
  await mkdir(path.join(dataDir, 'recorded'), { recursive: true });
  const result = edit(made);
  await writeFile(path.join(dataDir, 'recorded', `example-room__${night}__${name}.json`),
    JSON.stringify({ saved_at: '2026-10-10T20:00:00.000Z', venue_id: 'example-room', date: night, result }));
  return result;
}

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
    this.selected = false;
    if (id) this.id = id;
    const cls = () => new Set(this.className.split(/\s+/).filter(Boolean));
    this.classList = {
      add: (c) => { this.className = [...cls().add(c)].join(' '); },
      remove: (c) => { const s = cls(); s.delete(c); this.className = [...s].join(' '); },
      contains: (c) => cls().has(c),
    };
  }
  get children() { return this.nodes.filter((x) => x instanceof El); }
  get textContent() { return this.nodes.map((x) => (x instanceof El ? x.textContent : x)).join(''); }
  set textContent(t) { this.nodes = [String(t)]; }
  append(...xs) { for (const x of xs) this.nodes.push(x instanceof El ? x : String(x)); }
  replaceChildren(...xs) { this.nodes = []; this.append(...xs); }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = String(v);
    if (k === 'tabindex') this.tabIndex = Number(v);
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
  select() { this.selected = true; }
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

/** Runs web/app.js against `app`. `clipboard` stands in for navigator.clipboard; its writes are kept in `copied`. */
function runPage(app, { clipboardFails = false } = {}) {
  const byId = new Map();
  for (const m of PAGE_HTML.matchAll(/<(\w+)([^>]*)>/g)) {
    const id = m[2].match(/\bid="([^"]+)"/)?.[1];
    if (!id) continue;
    const el = new El(m[1], id);
    el.hidden = /(^|\s)hidden(\s|$)/.test(m[2]);
    el.disabled = /(^|\s)disabled(\s|$)/.test(m[2]);
    el.title = m[2].match(/\btitle="([^"]*)"/)?.[1] ?? '';
    byId.set(id, el);
  }
  const requests = [];
  const copied = [];
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
  const clipboard = { writeText: async (t) => (clipboardFails ? Promise.reject(new Error('not allowed')) : void copied.push(t)) };
  const context = vm.createContext({
    document, Node: El, fetch: fetchImpl, Response, TextDecoder, AbortController, setTimeout, clearTimeout,
    matchMedia: () => ({ matches: true }),
    navigator: { clipboard },
    console: { ...console, error: (...a) => errors.push(a.join(' ')) },
  });
  vm.runInContext(PAGE_JS, context, { filename: 'web/app.js' });
  return { $: (id) => byId.get(id), requests, errors, copied };
}

async function until(check, what, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) assert.fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
const settle = () => new Promise((r) => setTimeout(r, 30));

test('page: the card names the rooms its pool came from; unnamed rooms are counted, not guessed (synthetic fixtures)', async () => {
  const app = await fixtureApp();
  const page = runPage(app);
  await until(() => page.$('strip').querySelectorAll('.sq-dark').length > 0, 'the calendar');
  assert.equal(page.$('poster-pool').hidden, true, 'no line before a card');
  page.$('strip').querySelector('.sq-dark').click();
  await until(() => !page.$('poster').hidden, 'the scripted card');
  assert.equal(page.$('poster-pool').hidden, false);
  assert.equal(page.$('poster-pool').textContent, 'Acts from the calendars of Other Hall', 'build_pool: the other room in Exampleville');
  assert.deepEqual(page.errors, []);
  await app.close();

  // A recorded run whose pool also drew on a room this server no longer lists: the page names what it knows and counts the rest.
  const { darkInWeek } = await week();
  const dataDir = path.join(tmp, 'var-pool-gone');
  await writeRecording(dataDir, darkInWeek[0], { edit: (r) => ({ ...r, pool: { ...r.pool, rooms: [...r.pool.rooms, 'a-room-no-longer-listed'] } }) });
  const app2 = await noKeyApp(dataDir);
  const page2 = runPage(app2);
  await until(() => !page2.$('poster').hidden, 'the recorded card');
  assert.equal(page2.$('poster-pool').textContent, 'Acts from the calendars of Other Hall and 1 more room');
  assert.deepEqual(page2.errors, []);
  await app2.close();
});

test('page without a Qloo key: "Copy this week" copies the recorded cards of the next 7 nights, with no request on the click', async () => {
  const { darkInWeek, darkLater } = await week();
  assert.ok(darkInWeek.length >= 2 && darkLater.length >= 1, 'the synthetic room has dark nights inside and after the week');
  const dataDir = path.join(tmp, 'var-week');
  const made = await writeRecording(dataDir, darkInWeek[0]);
  // A thin run inside the week opens no card, and a run after the week is not this week's.
  await writeRecording(dataDir, darkInWeek[1], { name: 'thin', edit: (r) => ({ ...r, shortlist: [], thin_signal: { found: 2, shows: 9, why: 'Too few.' } }) });
  await writeRecording(dataDir, darkLater[0], { name: 'later' });

  const app = await noKeyApp(dataDir);
  const page = runPage(app);
  await until(() => !page.$('poster').hidden, 'the recorded card, with no click');
  await until(() => !page.$('copy-week').disabled, 'the copy button');
  assert.equal(page.$('copy-week').title, 'Copy the card for 1 of the next 7 nights as plain text');
  assert.equal(page.requests.filter((r) => r === `GET /api/recorded/example-room/${darkInWeek[0]}`).length, 1, 'the week run is read once, for the card and the copy');
  assert.ok(!page.requests.includes(`GET /api/recorded/example-room/${darkLater[0]}`), 'a run after the week is not read ahead');

  const before = page.requests.length;
  page.$('copy-week').click();
  await until(() => page.$('copy-week-status').textContent !== '', 'the copy status');
  assert.equal(page.$('copy-week-status').textContent, 'Copied 1 night. Paste it anywhere.');
  assert.match(PAGE_HTML, /id="copy-week-status" role="status" aria-live="polite"/);
  await settle();
  assert.equal(page.requests.length, before, 'copying makes no request');
  assert.equal(page.$('week-text').hidden, true);

  const day = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCDate()}`;
  };
  const { inWeek } = await week();
  assert.equal(page.copied.length, 1);
  assert.equal(page.copied[0], [
    `Example Room: 1 night with a card, ${day(inWeek[0].date).slice(4)} to ${day(inWeek.at(-1).date).slice(4)}`,
    '',
    day(darkInWeek[0]),
    ...made.shortlist.map((a) => `${a.rank}. ${a.name}`),
    `Why ${made.shortlist[0].name}: ${made.shortlist[0].why}`,
    // A run saved from synthetic data stays labelled synthetic on replay (the badge's own text).
    'Agent: recorded run from Oct 10, 2026 \u00b7 Qloo: synthetic test data',
  ].join('\n'));
  assert.doesNotMatch(page.copied[0], /Too few/);
  assert.deepEqual(page.errors, []);
  await app.close();
});

test('page: "Copy this week" is disabled with a short title until a card is shown; a plan shown in this visit counts', async () => {
  const app = await noKeyApp();
  const page = runPage(app);
  await until(() => page.$('strip').querySelectorAll('.sq-dark').length > 0, 'the calendar');
  assert.equal(page.$('copy-week').disabled, true);
  assert.equal(page.$('copy-week').title, 'No card yet for the next 7 nights');
  assert.match(PAGE_HTML, /<button type="button" class="btn btn-small" id="copy-week" disabled title="No card yet for the next 7 nights">Copy this week<\/button>/);
  assert.ok(!page.requests.some((r) => r.startsWith('GET /api/recorded/')), 'nothing recorded, nothing read');
  await app.close();

  // Scripted plans: the first card enables the button; with no clipboard access the text is shown selected instead.
  const { darkInWeek } = await week();
  const app2 = await fixtureApp();
  const page2 = runPage(app2, { clipboardFails: true });
  await until(() => page2.$('strip').querySelectorAll('.sq-dark').length > 0, 'the calendar');
  assert.equal(page2.$('copy-week').disabled, true);
  for (const date of darkInWeek.slice(0, 2)) {
    page2.$('strip').querySelectorAll('.sq-dark').find((b) => b.dataset.date === date).click();
    await until(() => page2.$('copy-week').title.includes(`for ${darkInWeek.indexOf(date) + 1} of`), 'the button to count the card');
  }
  assert.equal(page2.$('copy-week').disabled, false);
  page2.$('copy-week').click();
  await until(() => page2.$('copy-week-status').textContent !== '', 'the copy status');
  assert.equal(page2.$('copy-week-status').textContent, 'Select all and copy with your keyboard.');
  const box = page2.$('week-text');
  assert.equal(box.hidden, false);
  assert.equal(box.selected, true);
  assert.match(box.value, /^Example Room: 2 nights with a card, /);
  assert.equal(box.value.split('\n\n').length, 3, 'a head line, then one block per night');
  assert.equal(box.value.split('Agent: fixed steps, no AI writing \u00b7 Qloo: synthetic test data').length - 1, 2);

  // Another room: its week has no card, so the button goes back to disabled and the old text is put away.
  const select = page2.$('venue');
  select.value = 'other-hall';
  select.dispatch('change');
  assert.equal(page2.$('copy-week').disabled, true);
  assert.equal(page2.$('week-text').hidden, true);
  assert.equal(page2.$('copy-week-status').textContent, '');
  assert.deepEqual(page2.errors, []);
  await app2.close();
});
