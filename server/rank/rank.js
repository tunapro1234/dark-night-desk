// Rankers over a closed pool. Each returns { method, results: [{ entity_id, name, score, rank }], calls, fallbacks }.
// The pool restriction is tried first with filter.results.entities in a single insights call; if that comes back
// empty or fails, one wider call (take=200) is intersected with the pool. `method` says which one was used.
// Pool members the API did not score go to the bottom in pool order with score null (BACKTEST.md "Fixed choices").
import { entitiesOf } from '../qloo/client.js';
import { ARTIST } from './pool.js';

export const SHORTLIST_SIZE = 5;
export const FALLBACK_TAKE = 200;
const MAX_TAKE = 500;
const round = (x) => Math.round(x * 1000) / 1000;

/** Accept a list of ids or of { entity_id, name } objects. */
function asPool(pool) {
  return (pool ?? []).map((p) => (typeof p === 'string' ? { entity_id: p, name: null } : { entity_id: p.entity_id, name: p.name ?? null }));
}

const affinityOf = (e) => (typeof e?.query?.affinity === 'number' ? e.query.affinity : null);
const popularityOf = (e) => (typeof e?.popularity === 'number' ? e.popularity : null);

/**
 * Per-signal contributions from a feature.explainability response, as shares that sum to 1.
 * Only signal entities that were actually sent count; returns null when the field is missing.
 */
export function explainabilityShares(entity, signalIds) {
  const raw = entity?.query?.explainability ?? entity?.explainability;
  const list = Array.isArray(raw) ? raw : raw?.['signal.interests.entities'];
  if (!Array.isArray(list)) return null;
  const allowed = new Set(signalIds);
  const items = list
    .map((x) => ({ entity_id: x?.entity_id ?? x?.id, score: Number(x?.score ?? x?.weight ?? x?.value) }))
    .filter((x) => allowed.has(x.entity_id) && Number.isFinite(x.score) && x.score > 0);
  const sum = items.reduce((t, x) => t + x.score, 0);
  if (!items.length || sum <= 0) return null;
  return items.map((x) => ({ entity_id: x.entity_id, share: round(x.score / sum) })).sort((a, b) => b.share - a.share);
}

async function restricted(client, base, poolIn, scoreOf) {
  const pool = asPool(poolIn);
  const calls = [];
  const fallbacks = [];
  if (!pool.length) return { method: 'empty-pool', results: [], entities: new Map(), calls, fallbacks };
  const poolIds = pool.map((p) => p.entity_id);
  const inPool = new Set(poolIds);

  let method = 'filter.results.entities';
  let r = await client.insights({ ...base, 'filter.results.entities': poolIds, take: Math.min(poolIds.length, MAX_TAKE) });
  calls.push(r.call);
  if (r.status !== 'ok') {
    fallbacks.push({ step: 'pool restriction', reason: r.status === 'empty' ? 'filter.results.entities returned nothing' : `filter.results.entities failed (${r.error?.code})`, used: `take=${FALLBACK_TAKE} + intersection` });
    method = `take-${FALLBACK_TAKE}-intersection`;
    r = await client.insights({ ...base, take: FALLBACK_TAKE });
    calls.push(r.call);
    if (r.status === 'error') {
      return { method: 'failed', results: [], entities: new Map(), calls, fallbacks, error: r.error };
    }
  }

  const entities = new Map();
  for (const e of entitiesOf(r.data)) if (inPool.has(e?.entity_id) && !entities.has(e.entity_id)) entities.set(e.entity_id, e);
  const scored = [...entities.values()]
    .map((e, i) => ({ e, i, score: scoreOf(e) }))
    .filter((x) => x.score !== null)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const names = new Map(pool.map((p) => [p.entity_id, p.name]));
  const results = scored.map(({ e, score }) => ({ entity_id: e.entity_id, name: e.name ?? names.get(e.entity_id), score }));
  const have = new Set(results.map((x) => x.entity_id));
  for (const p of pool) if (!have.has(p.entity_id)) results.push({ entity_id: p.entity_id, name: p.name, score: null });
  results.forEach((x, i) => (x.rank = i + 1));
  return { method, results, entities, calls, fallbacks };
}

/**
 * Taste ranking: the room's past headliners as the signal, restricted to the pool.
 * @param {ReturnType<import('../qloo/client.js').createQlooClient>} client
 * @param {{ signalIds: string[], poolIds: Array<string | {entity_id: string, name?: string}>, popularityMax?: number,
 *   weights?: { entities?: number }, explain?: boolean }} args
 * @returns {Promise<{ method: string, results: object[], explainability: Record<string, {entity_id: string, share: number}[]>,
 *   calls: object[], fallbacks: object[], error?: object }>}
 */
export async function rankPool(client, { signalIds, poolIds, popularityMax, weights = {}, explain = true }) {
  if (!signalIds?.length) {
    return { method: 'no-signal', results: [], explainability: {}, calls: [], fallbacks: [], error: { code: 'no_signal', message: 'the room has no resolved past headliners' } };
  }
  const base = {
    'filter.type': ARTIST,
    'signal.interests.entities': signalIds,
    'signal.interests.entities.weight': weights.entities,
    'filter.popularity.max': popularityMax,
    'feature.explainability': explain ? true : undefined,
  };
  const r = await restricted(client, base, poolIds, affinityOf);
  const explainability = {};
  if (explain) {
    for (const [id, e] of r.entities) {
      const shares = explainabilityShares(e, signalIds);
      if (shares) explainability[id] = shares;
    }
  }
  const { entities, ...rest } = r;
  return { ...rest, explainability };
}

/** Popularity baseline: a rough stand-in for draw; we have no ticket data. */
export async function rankByPopularity(client, poolIds) {
  const { entities, ...rest } = await restricted(client, { 'filter.type': ARTIST }, poolIds, popularityOf);
  return rest;
}

/** Genre-tag baseline: tag signal only, no entity signal. */
export async function rankByTags(client, { tagIds, poolIds }) {
  if (!tagIds?.length) return { method: 'no-signal', results: [], calls: [], fallbacks: [], error: { code: 'no_signal', message: 'no tag ids' } };
  const { entities, ...rest } = await restricted(client, { 'filter.type': ARTIST, 'signal.interests.tags': tagIds }, poolIds, affinityOf);
  return rest;
}

/** Top `n` scored results (unscored pool members never make the shortlist). */
export function topN(results, n = SHORTLIST_SIZE) {
  return results.filter((x) => x.score !== null).slice(0, n);
}

/**
 * Per-signal contribution for each target act. Uses the explainability field when the ranking has it for every target;
 * otherwise leave-one-out: one cached ranking per signal entity with that entity removed, and the share is the score drop.
 * @param {{ signalIds: string[], poolIds: Array<string | object>, ranking: Awaited<ReturnType<typeof rankPool>>,
 *   targetIds: string[], popularityMax?: number, weights?: object, maxSignals?: number }} args
 * @returns {Promise<{ method: 'explainability' | 'leave-one-out', contributions: Record<string, {entity_id: string, share: number}[]>,
 *   calls: object[], note?: string }>}
 */
export async function contributions(client, { signalIds, poolIds, ranking, targetIds, popularityMax, weights, maxSignals = 25 }) {
  if (targetIds.every((id) => ranking.explainability?.[id])) {
    return { method: 'explainability', contributions: Object.fromEntries(targetIds.map((id) => [id, ranking.explainability[id]])), calls: [] };
  }
  const out = Object.fromEntries(targetIds.map((id) => [id, []]));
  if (signalIds.length === 1) {
    for (const id of targetIds) out[id] = [{ entity_id: signalIds[0], share: 1 }];
    return { method: 'leave-one-out', contributions: out, calls: [] };
  }
  const full = new Map(ranking.results.map((x) => [x.entity_id, x.score]));
  const tested = signalIds.slice(0, maxSignals);
  const calls = [];
  const drops = Object.fromEntries(targetIds.map((id) => [id, []]));
  for (const sid of tested) {
    const r = await rankPool(client, { signalIds: signalIds.filter((x) => x !== sid), poolIds, popularityMax, weights, explain: false });
    calls.push(...r.calls);
    const without = new Map(r.results.map((x) => [x.entity_id, x.score]));
    for (const id of targetIds) {
      const before = full.get(id);
      if (typeof before !== 'number') continue;
      const after = without.get(id);
      drops[id].push({ entity_id: sid, drop: Math.max(0, before - (typeof after === 'number' ? after : 0)) });
    }
  }
  for (const id of targetIds) {
    const sum = drops[id].reduce((t, x) => t + x.drop, 0);
    if (sum > 0) out[id] = drops[id].filter((x) => x.drop > 0).map((x) => ({ entity_id: x.entity_id, share: round(x.drop / sum) })).sort((a, b) => b.share - a.share);
  }
  const note = tested.length < signalIds.length ? `leave-one-out over the ${tested.length} most recent of ${signalIds.length} signal acts` : undefined;
  return note ? { method: 'leave-one-out', contributions: out, calls, note } : { method: 'leave-one-out', contributions: out, calls };
}
