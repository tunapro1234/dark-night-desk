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

const mondayOf = (dateISO) => addDays(dateISO, -((new Date(`${dateISO}T00:00:00Z`).getUTCDay() + 6) % 7));

/**
 * Date window for the pool. `week`: the Monday-to-Sunday week of the date (a narrow product option).
 * `season`: 90 days before to 60 days after the date ("acts who played <city> this season").
 * The live product passes `today` to `buildPool`, which narrows the season to the 90 days before today.
 * The back-test uses `backtestWindow` instead.
 */
export function poolWindow(dateISO, mode = 'season') {
  if (mode === 'week') {
    const from = mondayOf(dateISO);
    return { mode, from, to: addDays(from, 6) };
  }
  if (mode === 'season') return { mode, from: addDays(dateISO, -SEASON_BEFORE_DAYS), to: addDays(dateISO, SEASON_AFTER_DAYS) };
  throw new RangeError(`unknown pool window "${mode}"`);
}

/** Last date of the back-test archive (BACKTEST.md: S2 ends 30 Sep 2026). */
export const BACKTEST_ARCHIVE_END = '2026-09-30';

/**
 * Back-test pool window (BACKTEST.md Amendment 1): the Monday-to-Sunday week of the date, the week before and the week
 * after (21 days). The archive ends on BACKTEST_ARCHIVE_END, so a window that runs past it is cut there and says so.
 * @returns {{ from: string, to: string, cut: boolean }}
 */
export function backtestWindow(dateISO) {
  const monday = mondayOf(dateISO);
  const from = addDays(monday, -7);
  const to = addDays(monday, 13);
  return to > BACKTEST_ARCHIVE_END ? { from, to: BACKTEST_ARCHIVE_END, cut: true } : { from, to, cut: false };
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
 *   `today` (live product): the season becomes the 90 days before today, and any act with a show listed in the city
 *   from today on (another room or this one) is left out: it is already booked into town.
 */
export async function buildPool(client, { venue, venues, date, window = 'season', excludeIds = [], today }) {
  let win = poolWindow(date, window);
  if (today !== undefined && window === 'season') win = { mode: window, from: addDays(today, -SEASON_BEFORE_DAYS), to: addDays(today, -1) };
  const others = venues.filter((v) => v.id !== venue.id && sameCity(v.city, venue.city));
  const ownPast = new Set((venue.past_shows ?? []).map((s) => normalizeName(s.headliner)));
  const bookedAhead = new Set();
  if (today !== undefined) {
    for (const v of [venue, ...others]) {
      for (const s of v.shows ?? []) if (s?.headliner && s.date >= today) bookedAhead.add(normalizeName(s.headliner));
    }
  }

  const plays = new Map(); // normalized name -> { name, played: [{ venue_id, date }] }
  const excludedNames = new Set();
  const bookedNames = new Set();
  for (const v of others) {
    for (const s of programOf(v)) {
      if (!s?.headliner || s.date < win.from || s.date > win.to) continue;
      const k = normalizeName(s.headliner);
      if (!k) continue;
      if (ownPast.has(k)) {
        excludedNames.add(k);
        continue;
      }
      if (bookedAhead.has(k)) {
        bookedNames.add(k);
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
      excluded_booked_ahead: bookedNames.size,
      pool: pool.length,
    },
    needs_input: r.needs_input,
    unresolved: r.unresolved,
    calls: r.calls,
  };
}
