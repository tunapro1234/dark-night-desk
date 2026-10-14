// Venue files: one JSON document per venue in VENUES_DIR, checked against the schema below before use.
//
// {
//   id: "example-room",                       lowercase slug, unique across files
//   name, city: string,
//   capacity_band: "250-500",                 free text band as published by the venue
//   calendar_source_url: "https://...",       the public calendar page the data was read from
//   read_at: "2026-10-11" | ISO date-time,    when that page was read
//   closed_weekdays: [1],                     0 = Sunday ... 6 = Saturday; days the room is always shut
//   shows:      [{ date: "YYYY-MM-DD", headliner, source_url }],   upcoming program
//   past_shows: [{ date: "YYYY-MM-DD", headliner, source_url }],   past program (the room's own crowd)
//   listing_complete?: false                  the source lists only some of this room's shows (a partner room on a
//                                             promoter's calendar): its shows feed other rooms' pools, but the room
//                                             is not offered for planning. Absent means true.
//   listed_until?: "YYYY-MM-DD"               last date the source was read for; later nights are not listed yet
//   _synthetic?: true                         hand-written test venue, never real data
// }
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const READ_AT_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

/** True for a real calendar date written as YYYY-MM-DD (2026-02-30 is rejected). */
export function isISODate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const isText = (v) => typeof v === 'string' && v.trim() !== '';

function isHttpUrl(v) {
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function checkShows(errors, key, shows) {
  if (!Array.isArray(shows)) {
    errors.push(`${key} must be an array`);
    return;
  }
  shows.forEach((s, i) => {
    const at = `${key}[${i}]`;
    if (!s || typeof s !== 'object') return errors.push(`${at} must be an object`);
    if (!isISODate(s.date)) errors.push(`${at}.date must be a YYYY-MM-DD date`);
    if (!isText(s.headliner)) errors.push(`${at}.headliner is required`);
    if (!isHttpUrl(s.source_url)) errors.push(`${at}.source_url must be an http(s) URL`);
  });
}

/**
 * @param {unknown} venue
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateVenue(venue) {
  const errors = [];
  if (!venue || typeof venue !== 'object' || Array.isArray(venue)) return { ok: false, errors: ['venue must be a JSON object'] };
  if (typeof venue.id !== 'string' || !ID_RE.test(venue.id)) errors.push('id must be a lowercase slug (a-z, 0-9, -)');
  for (const k of ['name', 'city', 'capacity_band']) if (!isText(venue[k])) errors.push(`${k} is required`);
  if (!isHttpUrl(venue.calendar_source_url)) errors.push('calendar_source_url must be an http(s) URL');
  if (typeof venue.read_at !== 'string' || !READ_AT_RE.test(venue.read_at) || !isISODate(venue.read_at.slice(0, 10))) {
    errors.push('read_at must be an ISO date or date-time');
  }
  const cw = venue.closed_weekdays;
  if (!Array.isArray(cw) || !cw.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    errors.push('closed_weekdays must be an array of integers 0-6 (0 = Sunday)');
  } else if (new Set(cw).size !== cw.length) {
    errors.push('closed_weekdays has duplicates');
  }
  checkShows(errors, 'shows', venue.shows);
  checkShows(errors, 'past_shows', venue.past_shows);
  if (venue.listing_complete !== undefined && typeof venue.listing_complete !== 'boolean') errors.push('listing_complete, when present, must be true or false');
  if (venue.listed_until !== undefined && !isISODate(venue.listed_until)) errors.push('listed_until, when present, must be a YYYY-MM-DD date');
  if (venue._synthetic !== undefined && venue._synthetic !== true) errors.push('_synthetic, when present, must be true');
  return { ok: errors.length === 0, errors };
}

/**
 * Read every *.json venue file in a directory. A missing directory yields an empty list;
 * a file that cannot be parsed, fails the schema or repeats an id is skipped and reported through `onSkip`.
 * @param {string} dir
 * @param {{ onSkip?: (file: string, reason: string) => void }} [opts]
 */
export async function loadVenues(dir, { onSkip = () => {} } = {}) {
  let names;
  try {
    names = await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const venues = [];
  const seen = new Set();
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    const file = path.join(dir, name);
    let venue;
    try {
      venue = JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      onSkip(file, err.message);
      continue;
    }
    const v = validateVenue(venue);
    if (!v.ok) {
      onSkip(file, v.errors.join('; '));
      continue;
    }
    if (seen.has(venue.id)) {
      onSkip(file, `duplicate id "${venue.id}"`);
      continue;
    }
    seen.add(venue.id);
    venues.push(venue);
  }
  return venues;
}

/** True when the room can be planned: its calendar source lists all of its public shows. */
export const isPlannable = (venue) => venue?.listing_complete !== false;

/** Last date the calendar source was read for, or null when the file does not say. */
export const listedUntil = (venue) => (isISODate(venue?.listed_until) ? venue.listed_until : null);

/** Public summary of a venue, as served by GET /api/venues. */
export function venueSummary(venue) {
  return {
    id: venue.id,
    name: venue.name,
    city: venue.city,
    capacity_band: venue.capacity_band,
    calendar_source_url: venue.calendar_source_url,
  };
}
