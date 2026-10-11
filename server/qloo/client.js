// Thin HTTP adapter for the Qloo hackathon API. GET only, X-Api-Key header, server-side cache.
// Every call returns an envelope: { status, data, call, error? } with status ok | empty | error | needs_input.
// The API key never appears in a URL, in `call`, in a log line or in an error message.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { QLOO_HACKATHON_URL, REPO_ROOT } from '../config.js';
import { cacheKey, createQlooCache } from './cache.js';
import { cleanParams, validateInsightsParams } from './validate.js';

export const DEFAULT_FIXTURES_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'synthetic');
const MASK_LIST_AFTER = 8;

/** Entities in a search or insights payload, whichever shape it uses. */
export function entitiesOf(data) {
  if (Array.isArray(data?.results?.entities)) return data.results.entities;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.entities)) return data.entities;
  return [];
}

/** Tags in a /v2/tags payload. */
export function tagsOf(data) {
  if (Array.isArray(data?.results?.tags)) return data.results.tags;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.tags)) return data.tags;
  return [];
}

/**
 * @param {{
 *   apiKey?: string, baseUrl?: string, mode?: 'live' | 'fixture',
 *   cache?: ReturnType<typeof createQlooCache>, fetchImpl?: typeof fetch,
 *   fixturesDir?: string, retries?: number, retryDelayMs?: number, timeoutMs?: number,
 *   sleep?: (ms: number) => Promise<void>, logger?: { warn: Function }
 * }} opts
 */
export function createQlooClient({
  apiKey,
  baseUrl = QLOO_HACKATHON_URL,
  mode = 'live',
  cache = createQlooCache(),
  fetchImpl = globalThis.fetch,
  fixturesDir = DEFAULT_FIXTURES_DIR,
  retries = 2,
  retryDelayMs = 250,
  timeoutMs = 15_000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  logger,
} = {}) {
  const base = String(baseUrl).replace(/\/+$/, '');
  if (base !== QLOO_HACKATHON_URL) throw new Error(`Qloo base URL must be ${QLOO_HACKATHON_URL}`);
  if (mode !== 'live' && mode !== 'fixture') throw new Error(`unknown Qloo mode "${mode}"`);

  const scrub = (text) => (apiKey ? String(text).split(apiKey).join('[redacted]') : String(text));

  const maskParams = (params) => {
    const out = {};
    for (const [k, v] of Object.entries(params)) {
      let s = scrub(v);
      const items = s.split(',');
      if (items.length > MASK_LIST_AFTER) s = `${items.slice(0, MASK_LIST_AFTER).join(',')},...(+${items.length - MASK_LIST_AFTER} more)`;
      out[k] = s;
    }
    return out;
  };

  const envelope = (status, data, call, error) => (error ? { status, data, call, error } : { status, data, call });

  async function request(endpoint, rawParams, { countOf, invalid } = {}) {
    const params = cleanParams(rawParams);
    const call = { endpoint, params_masked: maskParams(params), ms: 0, cache: 'miss' };
    if (invalid) return envelope('error', null, { ...call, sent: false }, { code: 'invalid_params', message: invalid.join('; '), errors: invalid, retryable: false });

    const t0 = performance.now();
    const done = () => Math.round(performance.now() - t0);
    const key = (mode === 'fixture' ? 'fixture:' : '') + cacheKey(endpoint, params);
    const statusFor = (data) => (countOf(data) > 0 ? 'ok' : 'empty');

    const cached = cache.get(key);
    if (cached) return envelope(statusFor(cached.data), cached.data, { ...call, ms: done(), cache: 'hit' });

    if (mode === 'fixture') {
      const data = fixtureResponse(fixturesDir, endpoint, params);
      cache.set(key, endpoint, data);
      return envelope(statusFor(data), data, { ...call, ms: done() });
    }

    if (!apiKey) {
      return envelope('error', null, { ...call, sent: false }, { code: 'no_key', message: 'Qloo is not connected (no API key)', retryable: false });
    }

    const url = `${base}${endpoint}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(retryDelayMs * attempt);
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'GET',
          headers: { 'X-Api-Key': apiKey, accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        lastError = { code: 'network', message: scrub(err?.message ?? 'network error'), retryable: true };
        logger?.warn?.({ endpoint, attempt, code: 'network' }, 'qloo request failed');
        continue;
      }
      if (res.status >= 500) {
        lastError = { code: `http_${res.status}`, message: `Qloo returned HTTP ${res.status}`, retryable: true };
        logger?.warn?.({ endpoint, attempt, status: res.status }, 'qloo server error');
        continue;
      }
      if (!res.ok) {
        const detail = scrub((await res.text().catch(() => '')).slice(0, 300));
        return envelope('error', null, { ...call, ms: done() }, { code: `http_${res.status}`, message: `Qloo returned HTTP ${res.status}${detail ? `: ${detail}` : ''}`, retryable: false });
      }
      let data;
      try {
        data = await res.json();
      } catch {
        return envelope('error', null, { ...call, ms: done() }, { code: 'bad_json', message: 'Qloo returned a body that is not JSON', retryable: false });
      }
      cache.set(key, endpoint, data);
      return envelope(statusFor(data), data, { ...call, ms: done(), attempts: attempt + 1 });
    }
    return envelope('error', null, { ...call, ms: done(), attempts: retries + 1 }, lastError);
  }

  return {
    mode,
    /** Resolve names to entities. */
    search(query, { types, take } = {}) {
      if (!query || !String(query).trim()) {
        return Promise.resolve(envelope('needs_input', null, { endpoint: '/search', params_masked: {}, ms: 0, cache: 'miss', sent: false }));
      }
      return request('/search', { query: String(query).trim(), types, take }, { countOf: (d) => entitiesOf(d).length });
    },
    /** Find tag ids by keyword. */
    tags(query, { take, types } = {}) {
      if (!query || !String(query).trim()) {
        return Promise.resolve(envelope('needs_input', null, { endpoint: '/v2/tags', params_masked: {}, ms: 0, cache: 'miss', sent: false }));
      }
      return request('/v2/tags', { 'filter.query': String(query).trim(), 'filter.tag.types': types, take }, { countOf: (d) => tagsOf(d).length });
    },
    /** GET /v2/insights; invalid parameters are rejected before any request. */
    insights(params) {
      const v = validateInsightsParams(params);
      return request('/v2/insights', params, { countOf: (d) => entitiesOf(d).length, invalid: v.ok ? undefined : v.errors });
    },
  };
}

// ---- fixture mode (tests only): hand-written synthetic shapes, never real Qloo data ----

function readFixture(dir, name) {
  const file = path.join(dir, name);
  if (!existsSync(file)) return undefined;
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (data._synthetic !== true) throw new Error(`fixture ${name} is not marked "_synthetic": true`);
  return data;
}

const ids = (v) => (v === undefined ? undefined : new Set(String(v).split(',').map((s) => s.trim()).filter(Boolean)));

function fixtureResponse(dir, endpoint, params) {
  if (endpoint === '/search') {
    const data = readFixture(dir, 'search.json') ?? { _synthetic: true, results: [] };
    const q = String(params.query).toLowerCase();
    const types = ids(params.types);
    let results = entitiesOf(data).filter((e) => String(e.name).toLowerCase().includes(q));
    if (types) results = results.filter((e) => (e.types ?? []).some((t) => types.has(t)));
    if (params.take) results = results.slice(0, Number(params.take));
    return { _synthetic: true, results };
  }
  if (endpoint === '/v2/tags') {
    const data = readFixture(dir, 'tags.json') ?? { _synthetic: true, results: { tags: [] } };
    const q = String(params['filter.query']).toLowerCase();
    let tags = tagsOf(data).filter((t) => String(t.name).toLowerCase().includes(q));
    if (params.take) tags = tags.slice(0, Number(params.take));
    return { _synthetic: true, results: { tags } };
  }
  const type = String(params['filter.type']).replace('urn:entity:', '');
  const explain = String(params['feature.explainability']) === 'true';
  const data =
    (explain && readFixture(dir, `insights-${type}-explainability.json`)) ||
    readFixture(dir, `insights-${type}.json`) || { _synthetic: true, results: { entities: [] } };
  let entities = entitiesOf(data);
  const only = ids(params['filter.results.entities']);
  const exclude = ids(params['filter.exclude.entities']);
  if (only) entities = entities.filter((e) => only.has(e.entity_id));
  if (exclude) entities = entities.filter((e) => !exclude.has(e.entity_id));
  if (params['filter.popularity.max'] !== undefined) entities = entities.filter((e) => (e.popularity ?? 0) <= Number(params['filter.popularity.max']));
  if (params['filter.popularity.min'] !== undefined) entities = entities.filter((e) => (e.popularity ?? 0) >= Number(params['filter.popularity.min']));
  if (params.take) entities = entities.slice(0, Number(params.take));
  return { _synthetic: true, success: true, results: { entities } };
}
