// Study 2 input (BACKTEST-2.md with Amendments 1-13): data/backtest2/venues.csv and shows.csv. Pure functions, no Qloo.
// venues.csv: venue_id, name, operator, cluster, metro, tz, capacity, role, building, calendar_source
//   role is "test" (the room meets coverage by itself) or "pool" (a stage below coverage in an eligible venue: its shows feed
//   the metro pool). building names the venue a room belongs to; empty means a one-room venue (Amendment 12).
//   cluster joins rooms with the same owner or booking company (Amendment 1). tz is the IANA zone (Amendment 3).
//   capacity is the largest figure the venue or operator publishes for the room, or empty (Amendment 8).
// shows.csv: venue_id, start, date, title, performers, canceled, drop_reason, source_url, fetched_at, compiled_by, checked_by
//   start is the source's value: a date, a local date-time, or a date-time with an offset or Z. date is the local night
//   (localNight below) and is checked against start. performers is a JSON array of the structured performer field's
//   person or group names in source order, or empty (Amendment 2). drop_reason is empty or "off-site" (Amendment 1);
//   "untitled" and "non-music" are decided by the run (Amendment 4).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeName } from '../rank/pool.js';
import { parseCsv, periodOf } from './data.js';
import { seededRandom } from './metrics.js';

export const ROLES2 = Object.freeze(['test', 'pool']);
export const COMPILE_DROPS = Object.freeze(['', 'off-site']);
export const MAX_CLUSTERS = 20;
export const PLACEBO_SEED = 2;
export const CHECK_SEED = 3;
export const CHECK_SHARE = 0.1;
export const MIN_COVERAGE = 20;
export const SIZE_SPLIT = 650;

// Amendment 4, matched as whole words after the headliner rule's normalization ("open-mic" normalizes to "open mic").
export const NON_MUSIC_WORDS = Object.freeze([
  'karaoke', 'trivia', 'quiz', 'open mic', 'bingo', 'comedy', 'film screening', 'movie night', 'private event', 'closed',
  'market', 'workshop', 'class', 'watch party',
]);

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const ZONED = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:Z|[+-]\d{2}:?\d{2})$/;

// Study 1's rooms and the Minneapolis-St Paul metro (§6, Amendment 11). A guard on the file, not the selection itself.
const EXCLUDED_METRO = /minneapolis|\bst\.? paul\b|saint paul|twin cities/i;
const STUDY1_ROOMS = Object.freeze([
  { name: /^(the )?hideout$/, metro: /chicago/i },
  { name: /^black cat$/, metro: /washington/i },
]);

const addDay = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const realDate = (d) => ISO.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

export function isTimeZone(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Local date and minutes after midnight of an instant in a zone. */
function inZone(ms, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * Amendment 3: the night a show belongs to. A start between 00:01 and 04:59 local time belongs to the previous night;
 * exactly 00:00, or a date with no time, keeps the listed date. Times with an offset or Z are converted to the zone first,
 * except a value written as exactly 00:00 with an offset or Z: feeds write a date with no time that way, so its written
 * date is used (Amendment 12).
 * @param {string} start the source's start (or doors) value
 * @param {string} tz IANA zone of the venue
 */
export function localNight(start, tz) {
  const s = String(start ?? '').trim();
  const bad = () => new RangeError(`unreadable start "${s}"`);
  if (ISO.test(s)) {
    if (!realDate(s)) throw bad();
    return s;
  }
  let date;
  let minutes;
  const local = LOCAL.exec(s);
  const zoned = local ? null : ZONED.exec(s);
  if (local) {
    date = local[1];
    minutes = Number(local[2]) * 60 + Number(local[3]);
    if (!realDate(date) || Number(local[2]) > 23 || Number(local[3]) > 59) throw bad();
  } else if (zoned) {
    if (!realDate(zoned[1]) || Number(zoned[2]) > 23 || Number(zoned[3]) > 59) throw bad();
    if (!isTimeZone(tz)) throw new RangeError(`unknown time zone "${tz}"`);
    if (Number(zoned[2]) === 0 && Number(zoned[3]) === 0 && Number(zoned[4] ?? 0) === 0 && Number(zoned[5] ?? 0) === 0) return zoned[1];
    const ms = Date.parse(s.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (!Number.isFinite(ms)) throw bad();
    ({ date, minutes } = inZone(ms, tz));
  } else {
    throw bad();
  }
  return minutes >= 1 && minutes <= 4 * 60 + 59 ? addDay(date, -1) : date;
}

const padded = (text) => ` ${normalizeName(text)} `;

/** Non-music words found in a text, as whole words after normalization. */
export function nonMusicWords(text) {
  const t = padded(text);
  return NON_MUSIC_WORDS.filter((w) => t.includes(` ${w} `));
}

/** Amendment 4, coverage (§4): a row counts only if its title is not empty and holds none of the words. */
export const countsForCoverage = (title) => normalizeName(title) !== '' && nonMusicWords(title).length === 0;

/**
 * Amendment 4, run: the words that lie outside the name the headliner rule resolved. The first whole-word occurrence of the
 * resolved query in the title is taken out; if the query is not in the title (a performer field), the whole title is outside.
 */
export function nonMusicOutside(title, matchedQuery) {
  const t = padded(title);
  const m = normalizeName(matchedQuery);
  const i = m ? t.indexOf(` ${m} `) : -1;
  const outside = i < 0 ? t : `${t.slice(0, i)} ${t.slice(i + m.length + 2)}`;
  return nonMusicWords(outside);
}

/** Performer names from the shows.csv field: a JSON array of strings, or empty. */
export function parsePerformers(field) {
  const f = String(field ?? '').trim();
  if (!f) return [];
  let v;
  try {
    v = JSON.parse(f);
  } catch {
    throw new RangeError('performers must be a JSON array of names or empty');
  }
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new RangeError('performers must be a JSON array of names or empty');
  return v.map((x) => x.trim()).filter(Boolean);
}

/** Amendment 2, step 1: the first performer whose normalized name is not the venue's or the operator's (the field already holds only persons and groups). */
export function performerCandidate(performers, venue) {
  const own = new Set([venue.name, venue.operator, venue.building].map(normalizeName).filter(Boolean));
  return performers.find((p) => normalizeName(p) && !own.has(normalizeName(p))) ?? null;
}

/** The venue a room belongs to (Amendment 12): its building, or the room itself when building is empty. */
export const venueKey = (v) => (normalizeName(v.building) ? `building:${normalizeName(v.building)}|${v.metro}` : `room:${v.venue_id}`);

/**
 * Check both files and apply the cap. Throws on anything that breaks the schema or the selection rules, so a bad file never
 * produces numbers. The cap (Amendment 12) keeps the first MAX_CLUSTERS clusters that hold a test room, by file order; test
 * rooms of later clusters become pool rooms, because every eligible venue still feeds its metro pool.
 */
export function checkData2({ venues, shows }) {
  const ids = new Set();
  for (const [i, v] of venues.entries()) {
    const at = `venues.csv row ${i + 2}`;
    for (const k of ['venue_id', 'name', 'operator', 'cluster', 'metro', 'tz', 'role']) if (!v[k]) throw new Error(`${at}: ${k} is required`);
    if (!ROLES2.includes(v.role)) throw new Error(`${at}: role must be one of ${ROLES2.join(', ')}`);
    if (!isTimeZone(v.tz)) throw new Error(`${at}: tz "${v.tz}" is not an IANA time zone`);
    if (v.capacity && !/^[1-9]\d*$/.test(v.capacity)) throw new Error(`${at}: capacity must be a whole number or empty`);
    if (ids.has(v.venue_id)) throw new Error(`${at}: duplicate venue_id ${v.venue_id}`);
    if (EXCLUDED_METRO.test(v.metro)) throw new Error(`${at}: the Minneapolis-St Paul metro is excluded (§6)`);
    if (STUDY1_ROOMS.some((x) => x.name.test(normalizeName(v.name)) && x.metro.test(v.metro))) throw new Error(`${at}: ${v.name} is a Study 1 room (Amendment 11)`);
    ids.add(v.venue_id);
  }
  const testClusters = [...new Set(venues.filter((v) => v.role === 'test').map((v) => v.cluster))];
  const kept = new Set(testClusters.slice(0, MAX_CLUSTERS));
  const inUse = venues.map((v) => (v.role === 'test' && !kept.has(v.cluster) ? { ...v, role: 'pool', capped: true } : v));
  const byId = new Map(inUse.map((v) => [v.venue_id, v]));
  for (const v of inUse.filter((x) => x.role === 'test')) {
    if (!inUse.some((o) => o.metro === v.metro && o.cluster !== v.cluster)) {
      throw new Error(`venues.csv: test room ${v.venue_id} has no eligible venue of another cluster in ${v.metro} (§5, Amendment 1)`);
    }
  }
  const out = [];
  for (const [i, s] of shows.entries()) {
    const at = `shows.csv row ${i + 2}`;
    if (!ids.has(s.venue_id)) throw new Error(`${at}: unknown venue_id ${s.venue_id}`);
    if (!realDate(s.date)) throw new Error(`${at}: date must be a real YYYY-MM-DD date`);
    if (s.canceled !== '0' && s.canceled !== '1') throw new Error(`${at}: canceled must be 0 or 1`);
    if (!COMPILE_DROPS.includes(s.drop_reason ?? '')) throw new Error(`${at}: drop_reason must be empty or off-site`);
    try {
      parsePerformers(s.performers);
    } catch (err) {
      throw new Error(`${at}: ${err.message}`);
    }
    let night;
    try {
      night = localNight(s.start, byId.get(s.venue_id).tz);
    } catch (err) {
      throw new Error(`${at}: ${err.message}`);
    }
    if (night !== s.date) throw new Error(`${at}: date ${s.date} is not the local night of start ${s.start} (${night}, Amendment 3)`);
    out.push({ ...s, row: i + 2 });
  }
  const cappedRooms = inUse.filter((v) => v.capped).length;
  return { venues: inUse, shows: out, capped: { clusters: testClusters.length - kept.size, test_rooms: cappedRooms } };
}

/**
 * §4 with Amendments 1, 4 and 12, counted on shows.csv: rows that are not canceled, not off-site, have a title and hold no
 * non-music word, per room and period.
 * @returns {Map<string, { S1: number, S2: number }>}
 */
export function roomCoverage(venues, shows) {
  const out = new Map(venues.map((v) => [v.venue_id, { S1: 0, S2: 0 }]));
  for (const s of shows) {
    const p = periodOf(s.date);
    if (p && out.has(s.venue_id) && s.canceled === '0' && s.drop_reason !== 'off-site' && countsForCoverage(s.title)) out.get(s.venue_id)[p]++;
  }
  return out;
}

/**
 * Amendment 12: the role column must agree with coverage counted on shows.csv. A test room meets coverage by itself; a pool
 * room does not (unless the cap made it a pool room); a venue's rooms together meet coverage, or the venue is not eligible
 * and must not be in the file. Returns the problems found; the test run refuses to start if there is any.
 */
export function coverageProblems(venues, shows, min = MIN_COVERAGE) {
  const cov = roomCoverage(venues, shows);
  const meets = (c) => c.S1 >= min && c.S2 >= min;
  const problems = [];
  const byVenue = new Map();
  for (const v of venues) {
    const c = cov.get(v.venue_id);
    if (v.role === 'test' && !meets(c)) problems.push(`test room ${v.venue_id} is below coverage on shows.csv (S1 ${c.S1}, S2 ${c.S2}; needs ${min} each)`);
    if (v.role === 'pool' && !v.capped && meets(c)) problems.push(`pool room ${v.venue_id} meets coverage by itself, so it is a test room (Amendment 1)`);
    const k = venueKey(v);
    const t = byVenue.get(k) ?? { S1: 0, S2: 0, rooms: [] };
    t.S1 += c.S1;
    t.S2 += c.S2;
    t.rooms.push(v.venue_id);
    byVenue.set(k, t);
  }
  for (const t of byVenue.values()) {
    if (!meets(t)) problems.push(`venue of ${t.rooms.join(', ')} is below coverage on shows.csv (S1 ${t.S1}, S2 ${t.S2}), so it is not eligible (§4)`);
  }
  return problems;
}

function shuffled(items, seed) {
  const a = [...items];
  const rand = seededRandom(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Placebo candidates (BACKTEST-2.md "Placebo", Amendments 1 and 12), fixed before any Qloo call: the test rooms in venues.csv
 * order (after the cap) are shuffled once with the seed; each test room's candidates are the rooms after it in that order,
 * wrapping round, that are in another metro and another cluster. The first candidate is the assigned placebo room; the run
 * moves down the list only for a window where a candidate has no S1 headliner outside the pool (Amendment 12).
 * @returns {Record<string, string[]>} test venue_id -> candidate venue_ids, in order
 */
export function placeboChains(venues, seed = PLACEBO_SEED) {
  const tests = venues.filter((v) => v.role === 'test');
  const order = shuffled(tests, seed);
  const out = {};
  for (const v of tests) {
    const k = order.indexOf(v);
    const chain = [];
    for (let j = 1; j < order.length; j++) {
      const c = order[(k + j) % order.length];
      if (c.metro !== v.metro && c.cluster !== v.cluster) chain.push(c.venue_id);
    }
    if (!chain.length) throw new Error(`no placebo room for ${v.venue_id}: no test room in another metro and another cluster`);
    out[v.venue_id] = chain;
  }
  return out;
}

/** The assigned placebo room of each test room: the first candidate of its chain. */
export const assignPlacebos = (venues, seed = PLACEBO_SEED) =>
  Object.fromEntries(Object.entries(placeboChains(venues, seed)).map(([id, chain]) => [id, chain[0]]));

/**
 * BACKTEST-2.md "Data handling": the rows of the 10% second pass (seed 3), as shows.csv line numbers, sorted.
 * @param {number | number[]} rows a row count (lines 2..n+1) or the line numbers to draw from
 */
export function checkSample(rows, { seed = CHECK_SEED, share = CHECK_SHARE } = {}) {
  const lines = Array.isArray(rows) ? [...rows] : Array.from({ length: rows }, (_, i) => i + 2);
  return shuffled(lines, seed).slice(0, Math.ceil(lines.length * share)).sort((a, b) => a - b);
}

/** Amendment 8: "small" (at most 650), "large" or "unknown". */
export const sizeGroup = (venue) => (!venue.capacity ? 'unknown' : Number(venue.capacity) <= SIZE_SPLIT ? 'small' : 'large');

/** Amendment 8: Monday to Wednesday, or Thursday to Sunday. */
export function weekdayGroup(date) {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d >= 1 && d <= 3 ? 'mon_wed' : 'thu_sun';
}

/** Read and check data/backtest2 (or another folder with the same two files). */
export async function loadStudy2Data(dir) {
  const venues = parseCsv(await readFile(path.join(dir, 'venues.csv'), 'utf8'));
  const shows = parseCsv(await readFile(path.join(dir, 'shows.csv'), 'utf8'));
  return checkData2({ venues, shows });
}
