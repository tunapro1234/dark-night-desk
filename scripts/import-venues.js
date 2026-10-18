#!/usr/bin/env node
// Build demo venue files (server/calendar/venues.js schema) for Study 2 rooms from two inputs:
//   (a) the room's past program in data/backtest2/shows.csv (read and checked by loadStudy2Data, the Study 2 loader), and
//   (b) an upcoming listing read from the room's public calendar, given as a small JSON file:
//       { "venue_id": "chi-martyrs",                    Study 2 venue_id (venues.csv)
//         "calendar_source_url": "https://...",          the public page the listing was read from
//         "read_at": "2026-10-19T01:30:00Z",             when it was read (ISO date or date-time)
//         "listed_until": "2026-12-31",                  last date the page was read for
//         "complete": true,                              the caller says the listing holds every public show up to listed_until
//         "closed_weekdays": [],                         optional, 0 = Sunday ... 6 = Saturday
//         "shows": [{ "date": "YYYY-MM-DD", "headliner": "...", "source_url": "https://..." }] }
// Output, per listed room: <out>/s2-<venue_id>.json with shows from (b) dated on or after read_at, past_shows from (a) plus
// the rows of (b) dated before read_at, and listing_complete true only when "complete" is exactly true. Per metro of a
// listed room, every other room of that metro with rows in shows.csv gets a neighbour file (past_shows only, shows [],
// listing_complete false): it feeds the city pool (server/rank/pool.js buildPool) but is never offered for planning.
//
// Usage: node scripts/import-venues.js [--data-dir data/backtest2] [--out data/venues] [--write] <listing.json> ...
// Without --write it only prints what it would write. Nothing is fetched: this script reads local files only.
// A run checks every file before it writes any. A file it replaces is kept as <file>.old (loadVenues reads only *.json).
// Exit codes: 0 done, 1 usage or input error.
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../server/config.js';
import { isISODate, validateVenue } from '../server/calendar/venues.js';
import { normalizeName } from '../server/rank/pool.js';
import { loadStudy2Data, parsePerformers, performerCandidate } from '../server/backtest/study2-data.js';
import { asciiJson } from './refresh-venues.js';

export const ID_PREFIX = 's2-';
export const NOT_PUBLISHED = 'not published';
const IMPORTER = 'scripts/import-venues.js';

export class ImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportError';
  }
}

export const fileId = (venueId) => `${ID_PREFIX}${venueId}`;

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isHttpUrl = (v) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/**
 * Headliner of a shows.csv row, offline. Study 2's rule (server/backtest/study2.js resolveHeadliner2, Amendment 2) tries,
 * in order, the performer candidate (performerCandidate: first performer that is not the room, operator or building name),
 * the whole title, and the title before its first separator, against Qloo search. Without Qloo the first available query
 * is kept: the performer candidate, else the title. The demo's own resolver (pool.js resolveName) then tries that name and
 * the part before its first separator, so the split step still happens at resolution time.
 * @returns {string | null} null for a row with no usable name
 */
export function csvHeadliner(row, venueRow) {
  const candidate = performerCandidate(parsePerformers(row.performers), venueRow);
  if (candidate && normalizeName(candidate)) return candidate;
  return normalizeName(row.title) ? String(row.title).trim() : null;
}

/** Rows of a room that are shows: not canceled, no drop_reason, a usable name. Same night and same name kept once. */
export function pastProgram(shows, venueRow) {
  const out = [];
  const seen = new Set();
  for (const s of shows) {
    if (s.venue_id !== venueRow.venue_id || s.canceled !== '0' || (s.drop_reason ?? '') !== '') continue;
    const headliner = csvHeadliner(s, venueRow);
    if (!headliner) continue;
    const k = `${s.date}|${normalizeName(headliner)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ date: s.date, headliner, source_url: s.source_url });
  }
  return out.sort(byDate);
}

/** Display name: the room, with its building when the room is one stage of a larger venue. */
export function displayName(v) {
  return isText(v.building) && normalizeName(v.building) !== normalizeName(v.name) ? `${v.name} (${v.building})` : v.name;
}

/** venues.csv capacity is the largest figure the venue publishes for the room (Amendment 8), so it is written as a ceiling. */
export const capacityBand = (v) => (/^[1-9]\d*$/.test(v.capacity ?? '') ? `up to ${v.capacity}` : NOT_PUBLISHED);

/** First plain URL in venues.csv calendar_source: no web.archive.org wrapper, no <slug> placeholder. */
export function calendarUrlOf(text) {
  const urls = String(text ?? '').match(/https?:\/\/[^\s",;()]+/g) ?? [];
  const clean = urls.map((u) => u.replace(/[.,;:]+$/, '')).filter((u) => !u.includes('<') && isHttpUrl(u));
  return clean.find((u) => !/^https?:\/\/web\.archive\.org\//.test(u)) ?? clean[0] ?? null;
}

/** Check one listing file's content; returns it with read_day added. Throws ImportError naming the file. */
export function checkListing(listing, where = 'listing') {
  const bad = (msg) => {
    throw new ImportError(`${where}: ${msg}`);
  };
  if (!listing || typeof listing !== 'object' || Array.isArray(listing)) bad('must be a JSON object');
  if (!isText(listing.venue_id)) bad('venue_id is required');
  if (!isHttpUrl(listing.calendar_source_url)) bad('calendar_source_url must be an http(s) URL');
  const readDay = typeof listing.read_at === 'string' ? listing.read_at.slice(0, 10) : '';
  if (!isISODate(readDay)) bad('read_at must be an ISO date or date-time');
  if (!isISODate(listing.listed_until)) bad('listed_until must be a YYYY-MM-DD date');
  if (listing.listed_until < readDay) bad('listed_until is before read_at');
  if (listing.complete !== undefined && typeof listing.complete !== 'boolean') bad('complete, when present, must be true or false');
  if (!Array.isArray(listing.shows)) bad('shows must be an array');
  listing.shows.forEach((s, i) => {
    const at = `shows[${i}]`;
    if (!s || typeof s !== 'object') bad(`${at} must be an object`);
    if (!isISODate(s.date)) bad(`${at}.date must be a YYYY-MM-DD date`);
    if (!isText(s.headliner)) bad(`${at}.headliner is required`);
    if (!isHttpUrl(s.source_url)) bad(`${at}.source_url must be an http(s) URL`);
    if (s.date > listing.listed_until) bad(`${at}.date ${s.date} is after listed_until ${listing.listed_until}`);
  });
  return { ...listing, read_day: readDay };
}

/** Merge two programs; the first listing of a night and name wins. */
function merged(...programs) {
  const out = [];
  const seen = new Set();
  for (const s of programs.flat()) {
    const k = `${s.date}|${normalizeName(s.headliner)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ date: s.date, headliner: s.headliner.trim(), source_url: s.source_url });
  }
  return out.sort(byDate);
}

/**
 * Build venue documents in memory. No file access.
 * @param {{ venues: object[], shows: object[] }} data loadStudy2Data output (venues.csv and shows.csv rows)
 * @param {object[]} listings listing objects (see the header)
 * @returns {{ plannable: object[], neighbours: object[], skipped: { venue_id: string, reason: string }[] }}
 */
export function buildImport(data, listings) {
  const byId = new Map(data.venues.map((v) => [v.venue_id, v]));
  const checked = listings.map((l, i) => checkListing(l, l?.venue_id ? `listing ${l.venue_id}` : `listing ${i + 1}`));
  const listedIds = new Set();
  for (const l of checked) {
    if (!byId.has(l.venue_id)) throw new ImportError(`listing ${l.venue_id}: venue_id is not in venues.csv`);
    if (listedIds.has(l.venue_id)) throw new ImportError(`listing ${l.venue_id}: given twice`);
    listedIds.add(l.venue_id);
  }

  const base = (v) => ({
    id: fileId(v.venue_id),
    name: displayName(v),
    city: v.metro,
    capacity_band: capacityBand(v),
  });

  const plannable = checked.map((l) => {
    const v = byId.get(l.venue_id);
    const past = pastProgram(data.shows, v).filter((s) => s.date < l.read_day);
    const listedPast = l.shows.filter((s) => s.date < l.read_day);
    const upcoming = merged(l.shows.filter((s) => s.date >= l.read_day));
    const doc = {
      ...base(v),
      calendar_source_url: l.calendar_source_url,
      read_at: l.read_at,
      closed_weekdays: Array.isArray(l.closed_weekdays) ? [...l.closed_weekdays] : [],
      shows: upcoming,
      past_shows: merged(listedPast, past),
      listing_complete: l.complete === true,
      listed_until: l.listed_until,
      study2_venue_id: v.venue_id,
      imported_by: IMPORTER,
    };
    return doc;
  });

  const metros = new Set(checked.map((l) => byId.get(l.venue_id).metro));
  const neighbours = [];
  const skipped = [];
  for (const v of data.venues) {
    if (!metros.has(v.metro) || listedIds.has(v.venue_id)) continue;
    const past = pastProgram(data.shows, v);
    if (!past.length) {
      skipped.push({ venue_id: v.venue_id, reason: 'no show rows in shows.csv' });
      continue;
    }
    const url = calendarUrlOf(v.calendar_source) ?? past[0].source_url;
    const readAt = data.shows.filter((s) => s.venue_id === v.venue_id && isISODate(s.fetched_at)).map((s) => s.fetched_at).sort().at(-1);
    neighbours.push({
      ...base(v),
      calendar_source_url: url,
      read_at: readAt ?? past.at(-1).date,
      closed_weekdays: [],
      shows: [],
      past_shows: past,
      listing_complete: false,
      study2_venue_id: v.venue_id,
      imported_by: IMPORTER,
    });
  }

  for (const doc of [...plannable, ...neighbours]) {
    const r = validateVenue(doc);
    if (!r.ok) throw new ImportError(`${doc.id}: ${r.errors.join('; ')}`);
  }
  return { plannable, neighbours, skipped };
}

async function readJsonDir(dir) {
  let names;
  try {
    names = await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') throw new ImportError(`output folder ${dir} does not exist`);
    throw err;
  }
  const out = new Map(); // file name -> parsed document or null
  for (const n of names.filter((x) => x.endsWith('.json'))) {
    try {
      out.set(n, JSON.parse(await readFile(path.join(dir, n), 'utf8')));
    } catch {
      out.set(n, null);
    }
  }
  return out;
}

/**
 * Decide what to write. A neighbour never replaces a file that is offered for planning (a room imported with its listing
 * earlier). An id already used by another file name is an error, so loadVenues never sees a duplicate.
 */
export async function planWrites(outDir, { plannable, neighbours }) {
  const existing = await readJsonDir(outDir);
  const idOwner = new Map();
  for (const [n, doc] of existing) if (doc?.id) idOwner.set(doc.id, n);
  const writes = [];
  const kept = [];
  for (const [role, docs] of [['plannable', plannable], ['neighbour', neighbours]]) {
    for (const doc of docs) {
      const name = `${doc.id}.json`;
      const owner = idOwner.get(doc.id);
      if (owner && owner !== name) throw new ImportError(`id ${doc.id} is already used by ${owner}`);
      const prev = existing.get(name);
      if (role === 'neighbour' && prev && prev.listing_complete !== false) {
        kept.push({ id: doc.id, reason: 'a plannable file is already there' });
        continue;
      }
      writes.push({ role, name, doc, replaces: existing.has(name) });
    }
  }
  return { writes, kept };
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Write every planned file: each goes to <name>.tmp first, then the old file (if any) becomes <name>.old. */
export async function applyWrites(outDir, writes) {
  const staged = [];
  for (const w of writes) {
    const tmp = path.join(outDir, `${w.name}.tmp`);
    await writeFile(tmp, asciiJson(w.doc));
    staged.push({ ...w, tmp });
  }
  for (const w of staged) {
    const file = path.join(outDir, w.name);
    if (await exists(file)) await rename(file, `${file}.old`);
    await rename(w.tmp, file);
  }
}

const summaryOf = (doc) => ({
  id: doc.id,
  city: doc.city,
  shows: doc.shows.length,
  past_shows: doc.past_shows.length,
  past_range: doc.past_shows.length ? `${doc.past_shows[0].date}..${doc.past_shows.at(-1).date}` : null,
  listing_complete: doc.listing_complete,
  ...(doc.listed_until ? { listed_until: doc.listed_until } : {}),
});

export function parseArgs(argv) {
  const opts = { dataDir: path.join(REPO_ROOT, 'data', 'backtest2'), outDir: path.join(REPO_ROOT, 'data', 'venues'), write: false, listings: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') opts.write = true;
    else if (a === '--data-dir' || a === '--out') {
      const v = argv[++i];
      if (!v) throw new ImportError(`${a} needs a folder`);
      opts[a === '--out' ? 'outDir' : 'dataDir'] = path.resolve(v);
    } else if (a.startsWith('--')) throw new ImportError(`unknown option ${a}`);
    else opts.listings.push(path.resolve(a));
  }
  if (!opts.listings.length) throw new ImportError('give at least one listing JSON file');
  return opts;
}

/** @returns {Promise<number>} exit code */
export async function main(argv = process.argv.slice(2), { log = (x) => console.log(x), error = (x) => console.error(x) } = {}) {
  try {
    const opts = parseArgs(argv);
    const listings = [];
    for (const f of opts.listings) {
      try {
        listings.push(JSON.parse(await readFile(f, 'utf8')));
      } catch (err) {
        throw new ImportError(`${f}: ${err.message}`);
      }
    }
    let data;
    try {
      data = await loadStudy2Data(opts.dataDir);
    } catch (err) {
      throw new ImportError(`${opts.dataDir}: ${err.message}`);
    }
    const built = buildImport(data, listings);
    const { writes, kept } = await planWrites(opts.outDir, built);
    if (opts.write) await applyWrites(opts.outDir, writes);
    log(
      JSON.stringify(
        {
          mode: opts.write ? 'written' : 'dry run (add --write to write)',
          out: opts.outDir,
          files: writes.map((w) => ({ role: w.role, file: w.name, replaces: w.replaces, ...summaryOf(w.doc) })),
          kept,
          skipped: built.skipped,
        },
        null,
        2,
      ),
    );
    return 0;
  } catch (err) {
    if (err instanceof ImportError) {
      error(`import-venues: ${err.message}`);
      return 1;
    }
    throw err;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
