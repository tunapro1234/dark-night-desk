// Back-test rankers (BACKTEST.md "Rankers" and "Fixed choices"). Each returns the pool's entity ids, best first.
// The pool restriction is fixed for the whole run, before any metric: 'filter' (filter.results.entities) or 'take500'
// (take=500 and keep the pool members found). Pool members without a score go to the bottom in pool order.
// No filter.popularity limit, equal signal weights. A Qloo error stops the run instead of being scored.
import { entitiesOf } from '../qloo/client.js';
import { ARTIST, normalizeName } from '../rank/pool.js';

export const RESTRICTIONS = Object.freeze(['filter', 'take500']);
export const TAG_COUNT = 5;
const MAX_TAKE = 500;

export class BacktestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Pool order used for ties and unscored members: normalized name, then id. Independent of show dates. */
export function poolOrder(pool) {
  return [...pool].sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name)) || a.entity_id.localeCompare(b.entity_id));
}

/** Order ids by score (higher first); ties and missing scores keep pool order, missing ones at the bottom. */
export function orderByScore(pool, scoreOf) {
  const scored = [];
  const rest = [];
  pool.forEach((p, i) => {
    const s = scoreOf(p.entity_id);
    if (typeof s === 'number' && Number.isFinite(s)) scored.push({ id: p.entity_id, s, i });
    else rest.push(p.entity_id);
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return [...scored.map((x) => x.id), ...rest];
}

const affinity = (e) => (typeof e?.query?.affinity === 'number' ? e.query.affinity : null);

async function insightsOrThrow(client, params, what) {
  const r = await client.insights(params);
  if (r.status === 'error') throw new BacktestError(r.error?.code ?? 'qloo_error', `${what}: ${r.error?.message ?? 'Qloo request failed'}`);
  return entitiesOf(r.data);
}

/**
 * Rank the pool by Qloo affinity for a signal (entities and/or tags), with the run's fixed pool restriction.
 * @param {object} client Qloo client
 * @param {{ pool: {entity_id: string}[], entityIds?: string[], tagIds?: string[], restrict: 'filter' | 'take500', what?: string }} args
 */
export async function rankBySignal(client, { pool, entityIds, tagIds, restrict, what = 'ranking' }) {
  if (!RESTRICTIONS.includes(restrict)) throw new BacktestError('bad_restrict', `restrict must be one of ${RESTRICTIONS.join(', ')}`);
  const ids = pool.map((p) => p.entity_id);
  const params = {
    'filter.type': ARTIST,
    'signal.interests.entities': entityIds?.length ? entityIds : undefined,
    'signal.interests.tags': tagIds?.length ? tagIds : undefined,
    ...(restrict === 'filter' ? { 'filter.results.entities': ids, take: Math.min(ids.length, MAX_TAKE) } : { take: MAX_TAKE }),
  };
  const scores = new Map();
  for (const e of await insightsOrThrow(client, params, what)) {
    if (e?.entity_id && !scores.has(e.entity_id)) scores.set(e.entity_id, affinity(e));
  }
  return orderByScore(pool, (id) => scores.get(id));
}

/** P: Qloo's popularity value only (taken from the resolving /search result). A rough stand-in for draw; we have no ticket data. */
export function rankByPopularity(pool) {
  const popularity = new Map(pool.map((p) => [p.entity_id, p.popularity]));
  return orderByScore(pool, (id) => popularity.get(id));
}

const isGenre = (t) => String(t?.type ?? t?.tag_type ?? '').startsWith('urn:tag:genre');
const tagId = (t) => t?.tag_id ?? t?.id ?? null;

/**
 * T's signal: the TAG_COUNT most frequent genre tags among the room's S1 headliners, ties broken alphabetically (by tag id).
 * Tags come from the resolving /search results; headliners without tags there are looked up once with filter.results.entities.
 * @param {object} client
 * @param {{ entity_id: string, tags?: object[] }[]} headliners
 */
export async function topGenreTags(client, headliners) {
  const tagsById = new Map(headliners.map((h) => [h.entity_id, (h.tags ?? []).filter(isGenre)]));
  const missing = [...tagsById].filter(([, t]) => !t.length).map(([id]) => id);
  if (missing.length) {
    const found = await insightsOrThrow(
      client,
      { 'filter.type': ARTIST, 'filter.results.entities': missing, take: Math.min(missing.length, MAX_TAKE) },
      'genre tag lookup',
    );
    for (const e of found) if (tagsById.has(e?.entity_id) && Array.isArray(e.tags)) tagsById.set(e.entity_id, e.tags.filter(isGenre));
  }
  const count = new Map();
  for (const tags of tagsById.values()) {
    for (const id of new Set(tags.map(tagId).filter(Boolean))) count.set(id, (count.get(id) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TAG_COUNT).map(([id]) => id);
}

/**
 * The room's own place entity, for the venue-entity (leakage) variant only. Same exact-name test as the headliner rule.
 * @returns {Promise<string | null>}
 */
export async function resolveVenueEntity(client, name) {
  const r = await client.search(name, { types: ['urn:entity:place'], take: 5 });
  if (r.status === 'error') throw new BacktestError(r.error?.code ?? 'qloo_error', `venue lookup: ${r.error?.message ?? 'Qloo request failed'}`);
  const top = entitiesOf(r.data)[0];
  return top?.entity_id && normalizeName(top.name) === normalizeName(name) ? top.entity_id : null;
}
