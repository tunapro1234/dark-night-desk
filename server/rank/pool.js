// Closed pool for one dark night: headliners who played the same city around that date, resolved to Qloo artist ids.
// The pool never includes acts from the room's own past program (we are not suggesting repeat bookings).
import { addDays } from '../calendar/nights.js';
import { entitiesOf } from '../qloo/client.js';

export const ARTIST = 'urn:entity:artist';
export const SEASON_BEFORE_DAYS = 90;
export const SEASON_AFTER_DAYS = 60;
const CANDIDATES_KEPT = 3;
const SEPARATORS = [' ft. ', ' feat. ', ' featuring ', ' with ', ' w/ ', ' + ', ' / ', ', ', ' and ', ' & '];

/** Lowercase, strip accents and punctuation, drop a leading "the", collapse spaces (BACKTEST.md headliner rule, step 1). */
export function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

/** The part of a show title before its first billing separator, or null (BACKTEST.md headliner rule, step 3). */
export function splitHeadliner(title) {
  const lower = ` ${String(title ?? '').toLowerCase()} `;
  let cut = -1;
  for (const sep of SEPARATORS) {
    const i = lower.indexOf(sep);
    if (i > 0 && (cut === -1 || i < cut)) cut = i;
  }
  if (cut === -1) return null;
  const head = ` ${String(title)} `.slice(1, cut).trim();
  return head || null;
}

const entityOf = (e) => ({ entity_id: e.entity_id, name: e.name, popularity: e.popularity ?? null });

/**
 * Resolve one show title to a Qloo artist. Resolved only when the top search result has exactly the same normalized name,
 * first for the whole title, then for the part before the first separator. Anything else with results is `needs_input`
 * (top 3 candidates kept for the booker to pick); no results at all is `unresolved`.
 * @param {ReturnType<import('../qloo/client.js').createQlooClient>} client
 * @param {string} title
 */
export async function resolveName(client, title) {
  const calls = [];
  const attempts = [title];
  const head = splitHeadliner(title);
  if (head) attempts.push(head);
  let candidates = [];
  for (const [i, query] of attempts.entries()) {
    const r = await client.search(query, { types: [ARTIST], take: 5 });
    calls.push(r.call);
    if (r.status === 'error') return { status: 'unresolved', name: title, reason: r.error?.code ?? 'error', calls };
    const found = entitiesOf(r.data).filter((e) => e?.entity_id);
    if (found.length && normalizeName(found[0].name) === normalizeName(query)) {
      return { status: 'resolved', name: title, entity: entityOf(found[0]), step: i === 0 ? 'title' : 'split', calls };
    }
    if (!candidates.length) candidates = found.slice(0, CANDIDATES_KEPT).map(entityOf);
  }
  if (candidates.length) return { status: 'needs_input', name: title, candidates, calls };
  return { status: 'unresolved', name: title, reason: 'no_match', calls };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Resolve many titles; duplicates (same normalized name) are searched once.
 * @returns {Promise<{ resolved: Map<string, object>, needs_input: object[], unresolved: object[], calls: object[] }>}
 *   `resolved` maps the normalized title to its entity.
 */
export async function resolveNames(client, titles, { concurrency = 4 } = {}) {
  const byKey = new Map();
  for (const t of titles) {
    const k = normalizeName(t);
    if (k && !byKey.has(k)) byKey.set(k, t);
  }
  const results = await mapLimit([...byKey.values()], concurrency, (t) => resolveName(client, t));
  const resolved = new Map();
  const needs_input = [];
  const unresolved = [];
  const calls = [];
  for (const r of results) {
    calls.push(...r.calls);
    if (r.status === 'resolved') resolved.set(normalizeName(r.name), r.entity);
    else if (r.status === 'needs_input') needs_input.push({ name: r.name, candidates: r.candidates });
    else unresolved.push({ name: r.name, reason: r.reason });
  }
  return { resolved, needs_input, unresolved, calls };
}

/**
 * Date window for the pool. `week`: the Monday-to-Sunday week of the date (back-test unit).
 * `season`: 90 days before to 60 days after the date (product mode, "acts who played <city> this season").
 */
export function poolWindow(dateISO, mode = 'season') {
  if (mode === 'week') {
    const dow = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
    const from = addDays(dateISO, -((dow + 6) % 7));
    return { mode, from, to: addDays(from, 6) };
  }
  if (mode === 'season') return { mode, from: addDays(dateISO, -SEASON_BEFORE_DAYS), to: addDays(dateISO, SEASON_AFTER_DAYS) };
  throw new RangeError(`unknown pool window "${mode}"`);
}

const sameCity = (a, b) => normalizeName(a) !== '' && normalizeName(a) === normalizeName(b);
const programOf = (v) => [...(v.shows ?? []), ...(v.past_shows ?? [])];

/**
 * The room's crowd: its own past headliners, most recent first, resolved to artist ids.
 * @param {{ before?: string, limit?: number }} [opts] `before` keeps only shows dated before it.
 */
export async function buildSignal(client, venue, { before, limit = 40 } = {}) {
  const shows = (venue.past_shows ?? [])
    .filter((s) => !before || s.date < before)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const names = shows.map((s) => s.headliner);
  const r = await resolveNames(client, names);
  const seen = new Set();
  const signal = [];
  for (const n of names) {
    const e = r.resolved.get(normalizeName(n));
    if (e && !seen.has(e.entity_id)) {
      seen.add(e.entity_id);
      signal.push({ entity_id: e.entity_id, name: e.name });
    }
  }
  return {
    signal: signal.slice(0, limit),
    counts: { shows: shows.length, names: new Set(names.map(normalizeName)).size, resolved: r.resolved.size, needs_input: r.needs_input.length, unresolved: r.unresolved.length },
    needs_input: r.needs_input,
    unresolved: r.unresolved,
    calls: r.calls,
  };
}

/**
 * @param {ReturnType<import('../qloo/client.js').createQlooClient>} client
 * @param {{ venue: object, venues: object[], date: string, window?: 'season' | 'week', excludeIds?: string[] }} args
 *   `venues` is every known venue; only other rooms in the venue's city feed the pool.
 *   `excludeIds` (usually the room's resolved signal) are removed after resolution as well.
 */
export async function buildPool(client, { venue, venues, date, window = 'season', excludeIds = [] }) {
  const win = poolWindow(date, window);
  const others = venues.filter((v) => v.id !== venue.id && sameCity(v.city, venue.city));
  const ownPast = new Set((venue.past_shows ?? []).map((s) => normalizeName(s.headliner)));

  const plays = new Map(); // normalized name -> { name, played: [{ venue_id, date }] }
  const excludedNames = new Set();
  for (const v of others) {
    for (const s of programOf(v)) {
      if (!s?.headliner || s.date < win.from || s.date > win.to) continue;
      const k = normalizeName(s.headliner);
      if (!k) continue;
      if (ownPast.has(k)) {
        excludedNames.add(k);
        continue;
      }
      if (!plays.has(k)) plays.set(k, { name: s.headliner, played: [] });
      plays.get(k).played.push({ venue_id: v.id, date: s.date });
    }
  }

  const r = await resolveNames(client, [...plays.values()].map((p) => p.name));
  const excluded = new Set(excludeIds);
  const byId = new Map();
  let excludedIds = 0;
  for (const [k, p] of plays) {
    const e = r.resolved.get(k);
    if (!e) continue;
    if (excluded.has(e.entity_id)) {
      excludedIds++;
      continue;
    }
    if (!byId.has(e.entity_id)) byId.set(e.entity_id, { ...e, played: [] });
    byId.get(e.entity_id).played.push(...p.played);
  }
  const pool = [...byId.values()].map((p) => ({ ...p, played: p.played.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) }));

  return {
    window: win,
    city: venue.city,
    rooms: others.map((v) => v.id),
    pool,
    counts: {
      names: plays.size,
      resolved: r.resolved.size,
      needs_input: r.needs_input.length,
      unresolved: r.unresolved.length,
      excluded_own_past: excludedNames.size + excludedIds,
      pool: pool.length,
    },
    needs_input: r.needs_input,
    unresolved: r.unresolved,
    calls: r.calls,
  };
}
