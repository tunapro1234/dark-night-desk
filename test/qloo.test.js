import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateInsightsParams, ENTITY_TYPES } from '../server/qloo/validate.js';
import { cacheKey, cachePath, createQlooCache } from '../server/qloo/cache.js';
import { createQlooClient, DEFAULT_FIXTURES_DIR, entitiesOf } from '../server/qloo/client.js';

const KEY = 'test-key-SHOULD-NOT-LEAK-42';
const BASE = 'https://hackathon.api.qloo.com';
const ARTIST = 'urn:entity:artist';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next.clone();
  };
  return { impl, calls };
}

const client = (opts) => createQlooClient({ apiKey: KEY, baseUrl: BASE, mode: 'live', sleep: async () => {}, ...opts });

// ---- validator ----

test('validator: filter.type is required and must be a hackathon type', () => {
  assert.equal(validateInsightsParams({}).ok, false);
  assert.equal(validateInsightsParams({ 'signal.interests.entities': 'x' }).ok, false);
  assert.equal(validateInsightsParams({ 'filter.type': 'urn:entity:music' }).ok, false);
  assert.equal(validateInsightsParams({ 'filter.type': 'artist' }).ok, false, 'urn:entity: prefix is required');
  for (const t of ENTITY_TYPES) assert.equal(validateInsightsParams({ 'filter.type': t, 'signal.interests.entities': 'a' }).ok, true, t);
  assert.equal(ENTITY_TYPES.length, 10);
});

test('validator: location filters only for place and destination', () => {
  for (const k of ['filter.location', 'filter.location.radius', 'filter.location.query', 'filter.geocode.name']) {
    const r = validateInsightsParams({ 'filter.type': ARTIST, [k]: 'POINT(0 0)' });
    assert.equal(r.ok, false, k);
    assert.match(r.errors.join(), /place and destination/);
  }
  assert.equal(validateInsightsParams({ 'filter.type': 'urn:entity:place', 'filter.location': 'POINT(0 0)', 'filter.location.radius': 600 }).ok, true);
  assert.equal(validateInsightsParams({ 'filter.type': 'urn:entity:destination', 'signal.interests.entities': 'a', 'filter.location.radius': 600 }).ok, true);
});

test('validator: destination needs entity signal', () => {
  assert.equal(validateInsightsParams({ 'filter.type': 'urn:entity:destination' }).ok, false);
  assert.equal(validateInsightsParams({ 'filter.type': 'urn:entity:destination', 'signal.interests.entities': 'a' }).ok, true);
});

test('validator: unknown parameters are rejected, known ones accepted', () => {
  const ok = validateInsightsParams({
    'filter.type': ARTIST, 'signal.interests.entities': ['a', 'b'], 'signal.interests.entities.weight': 2,
    'signal.interests.tags': 't1', 'signal.demographics.age': '25_to_29', 'signal.location': 'POINT(-73.9 40.7)',
    'signal.location.weight': 0.5, 'bias.trends': 'medium', 'diversify.by': 'properties.geocode.city', 'diversify.take': 3,
    'feature.explainability': true, 'filter.results.entities': 'a,b', 'filter.exclude.entities': 'c',
    'filter.popularity.min': 0.1, 'filter.popularity.max': 0.9, take: 30, page: 1,
  });
  assert.deepEqual(ok, { ok: true, errors: [] });
  for (const bad of ['signal.interest.entities', 'recommendations', 'feature.explain', 'signal.location.query', 'Filter.Type']) {
    assert.equal(validateInsightsParams({ 'filter.type': ARTIST, [bad]: 'x' }).ok, false, bad);
  }
});

test('validator: value ranges', () => {
  const bad = (extra) => validateInsightsParams({ 'filter.type': ARTIST, ...extra }).ok === false;
  assert.ok(bad({ take: 0 }));
  assert.ok(bad({ take: 501 }));
  assert.ok(bad({ take: 'ten' }));
  assert.ok(bad({ page: 0 }));
  assert.ok(bad({ 'filter.popularity.max': 1.5 }));
  assert.ok(bad({ 'filter.popularity.min': -0.1 }));
  assert.ok(bad({ 'feature.explainability': 'yes' }));
  assert.ok(bad({ 'bias.trends': 'extreme' }));
  assert.ok(bad({ 'signal.interests.tags': '' }));
  assert.ok(bad({ 'signal.interests.entities.weight': 'heavy' }));
  assert.equal(validateInsightsParams({ 'filter.type': ARTIST, take: '30', 'filter.popularity.max': '0.7' }).ok, true);
});

// ---- cache ----

test('cache key: sorted, trimmed, arrays joined, undefined dropped', () => {
  const a = cacheKey('/v2/insights', { take: 5, 'filter.type': ARTIST, 'signal.interests.entities': ['a', ' b'], page: undefined });
  const b = cacheKey('/v2/insights', { 'signal.interests.entities': 'a,b', 'filter.type': ` ${ARTIST} `, take: '5' });
  assert.equal(a, b);
  assert.notEqual(a, cacheKey('/search', { take: 5, 'filter.type': ARTIST, 'signal.interests.entities': 'a,b' }));
});

test('cache persists to DATA_DIR/qloo-cache.sqlite', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dnd-cache-'));
  try {
    const file = cachePath(dir);
    assert.equal(file, path.join(dir, 'qloo-cache.sqlite'));
    const c1 = createQlooCache({ dbPath: file });
    c1.set('k', '/search', { results: [1] });
    c1.close();
    const c2 = createQlooCache({ dbPath: file });
    assert.deepEqual(c2.get('k').data, { results: [1] });
    assert.equal(c2.get('missing'), undefined);
    c2.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- client ----

test('client: GET with X-Api-Key header, key never in url or call evidence, second call is a cache hit', async () => {
  const f = fakeFetch([json({ success: true, results: { entities: [{ entity_id: 'e1', name: 'One' }] } })]);
  const c = client({ fetchImpl: f.impl });
  const params = { 'filter.type': ARTIST, 'signal.interests.entities': 'a', take: 30 };
  const r1 = await c.insights(params);
  const r2 = await c.insights({ take: '30', 'signal.interests.entities': 'a', 'filter.type': ARTIST });
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  assert.ok(url.startsWith(`${BASE}/v2/insights?`));
  assert.equal(init.method, 'GET');
  assert.equal(init.headers['X-Api-Key'], KEY);
  assert.ok(!url.includes(KEY));
  assert.equal(r1.status, 'ok');
  assert.equal(r1.call.cache, 'miss');
  assert.equal(r2.call.cache, 'hit');
  assert.equal(entitiesOf(r2.data)[0].entity_id, 'e1');
  assert.deepEqual(r1.call.params_masked, { 'filter.type': ARTIST, 'signal.interests.entities': 'a', take: '30' });
  assert.equal(typeof r1.call.ms, 'number');
  for (const r of [r1, r2]) assert.ok(!JSON.stringify(r).includes(KEY));
});

test('client: empty result is "empty"', async () => {
  const f = fakeFetch([json({ success: true, results: { entities: [] } })]);
  assert.equal((await client({ fetchImpl: f.impl }).insights({ 'filter.type': ARTIST })).status, 'empty');
});

test('client: invalid params are rejected before any request', async () => {
  const f = fakeFetch([json({})]);
  const r = await client({ fetchImpl: f.impl }).insights({ 'filter.type': ARTIST, 'filter.location.radius': 600 });
  assert.equal(f.calls.length, 0);
  assert.equal(r.status, 'error');
  assert.equal(r.error.code, 'invalid_params');
  assert.equal(r.call.sent, false);
});

test('client: retries network errors and 5xx at most twice', async () => {
  const f = fakeFetch([new TypeError('fetch failed'), json({ error: 'x' }, 503), json({ results: { entities: [{ entity_id: 'e' }] } })]);
  const r = await client({ fetchImpl: f.impl }).insights({ 'filter.type': ARTIST });
  assert.equal(f.calls.length, 3);
  assert.equal(r.status, 'ok');
  assert.equal(r.call.attempts, 3);

  const g = fakeFetch([json({}, 502)]);
  const r2 = await client({ fetchImpl: g.impl }).insights({ 'filter.type': 'urn:entity:movie' });
  assert.equal(g.calls.length, 3);
  assert.equal(r2.status, 'error');
  assert.equal(r2.error.code, 'http_502');
  assert.equal(r2.error.retryable, true);
});

test('client: 4xx is not retried and errors are scrubbed of the key', async () => {
  const f = fakeFetch([new Response(`No API key found matching ${KEY}`, { status: 401 })]);
  const r = await client({ fetchImpl: f.impl }).insights({ 'filter.type': ARTIST });
  assert.equal(f.calls.length, 1);
  assert.equal(r.status, 'error');
  assert.equal(r.error.code, 'http_401');
  assert.ok(!JSON.stringify(r).includes(KEY));

  const g = fakeFetch([new TypeError(`connect failed for ${KEY}`)]);
  const r2 = await client({ fetchImpl: g.impl }).insights({ 'filter.type': ARTIST });
  assert.ok(!JSON.stringify(r2).includes(KEY));
});

test('client: errors are not cached', async () => {
  const f = fakeFetch([json({}, 500), json({}, 500), json({}, 500), json({ results: { entities: [{ entity_id: 'e' }] } })]);
  const c = client({ fetchImpl: f.impl });
  assert.equal((await c.insights({ 'filter.type': ARTIST })).status, 'error');
  const r = await c.insights({ 'filter.type': ARTIST });
  assert.equal(r.status, 'ok');
  assert.equal(r.call.cache, 'miss');
});

test('client: no key means no request', async () => {
  const f = fakeFetch([json({})]);
  const r = await createQlooClient({ baseUrl: BASE, fetchImpl: f.impl }).insights({ 'filter.type': ARTIST });
  assert.equal(f.calls.length, 0);
  assert.equal(r.error.code, 'no_key');
});

test('client: refuses other hosts', () => {
  assert.throws(() => createQlooClient({ apiKey: KEY, baseUrl: 'https://api.qloo.com' }));
  assert.throws(() => createQlooClient({ apiKey: KEY, baseUrl: 'https://staging.api.qloo.com' }));
});

test('client: long lists are shortened in params_masked', async () => {
  const f = fakeFetch([json({ results: { entities: [] } })]);
  const pool = Array.from({ length: 50 }, (_, i) => `id-${i}`);
  const r = await client({ fetchImpl: f.impl }).insights({ 'filter.type': ARTIST, 'filter.results.entities': pool });
  assert.match(r.call.params_masked['filter.results.entities'], /\(\+42 more\)$/);
  assert.ok(f.calls[0].url.includes('id-49'), 'full list is still sent');
});

test('client: search and tags endpoints, needs_input on empty query', async () => {
  const f = fakeFetch([json({ results: [{ entity_id: 'e', name: 'N' }] })]);
  const c = client({ fetchImpl: f.impl });
  const s = await c.search('Some Act', { types: [ARTIST], take: 3 });
  assert.equal(s.status, 'ok');
  const u = new URL(f.calls[0].url);
  assert.equal(u.pathname, '/search');
  assert.equal(u.searchParams.get('query'), 'Some Act');
  assert.equal(u.searchParams.get('types'), ARTIST);
  assert.equal((await c.search('  ')).status, 'needs_input');

  const g = fakeFetch([json({ results: { tags: [{ id: 't', name: 'T' }] } })]);
  const t = await client({ fetchImpl: g.impl }).tags('indie', { take: 5 });
  assert.equal(t.status, 'ok');
  const tu = new URL(g.calls[0].url);
  assert.equal(tu.pathname, '/v2/tags');
  assert.equal(tu.searchParams.get('filter.query'), 'indie');
  assert.equal((await c.tags('')).status, 'needs_input');
});

// ---- fixture mode ----

test('fixture mode serves synthetic shapes without network', async () => {
  const f = fakeFetch([json({})]);
  const c = createQlooClient({ mode: 'fixture', fetchImpl: f.impl });
  const s = await c.search('Synthetic Act 1', { types: [ARTIST] });
  assert.equal(s.status, 'ok');
  const plain = await c.insights({ 'filter.type': ARTIST, 'signal.interests.entities': 'synthetic-artist-101', take: 5 });
  assert.equal(entitiesOf(plain.data).length, 5);
  assert.equal(entitiesOf(plain.data)[0].query.explainability, undefined);
  const ex = await c.insights({ 'filter.type': ARTIST, 'signal.interests.entities': 'synthetic-artist-101', 'feature.explainability': true });
  assert.ok(entitiesOf(ex.data).every((e) => e.query.explainability));
  const pool = await c.insights({ 'filter.type': ARTIST, 'filter.results.entities': 'synthetic-artist-3,synthetic-artist-7' });
  assert.deepEqual(entitiesOf(pool.data).map((e) => e.entity_id), ['synthetic-artist-3', 'synthetic-artist-7']);
  for (const t of ['movie', 'place', 'brand']) assert.equal((await c.insights({ 'filter.type': `urn:entity:${t}` })).status, 'ok', t);
  assert.equal((await c.insights({ 'filter.type': 'urn:entity:podcast' })).status, 'empty');
  assert.equal((await c.tags('genre')).status, 'ok');
  assert.equal(f.calls.length, 0);
});

test('synthetic fixtures are marked and use made-up ids only', async () => {
  const files = (await readdir(DEFAULT_FIXTURES_DIR)).filter((n) => n.endsWith('.json'));
  assert.ok(files.length >= 7);
  for (const name of files) {
    const text = await readFile(path.join(DEFAULT_FIXTURES_DIR, name), 'utf8');
    assert.ok(text.includes('"_synthetic": true'), name);
    for (const m of text.matchAll(/"entity_id":\s*"([^"]+)"/g)) assert.match(m[1], /^synthetic-/, `${name}: ${m[1]}`);
  }
});
