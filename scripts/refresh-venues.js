#!/usr/bin/env node
// Re-read First Avenue's public calendar and rewrite the fa-*.json venue files in VENUES_DIR.
// Usage: node scripts/refresh-venues.js [--dry-run]
//
// Politeness: robots.txt is read first and the run stops if it disallows the calendar for our user agent.
// Only GET, User-Agent "Mozilla/5.0 (research; dark-night-desk)", at least 2.5 s between requests
// (longer if robots.txt asks for a Crawl-delay), and the run stops on the first 403 or 429.
// It reads the month pages that cover today - 90 days to today + 60 days. Raw pages are kept only in
// DATA_DIR/raw-calendar/ (outside the repo). A run writes all files or none: any failed page stops it before a write.
// Exit codes: 0 done, 1 usage/config error, 2 stopped (robots.txt, 403/429, HTTP or parse failure).
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from '../server/config.js';
import { addDays, todayISO } from '../server/calendar/nights.js';
import { listedShowCount, parseMonthPage } from '../server/calendar/firstavenue.js';
import { robotsVerdict } from '../server/calendar/robots.js';
import { validateVenue } from '../server/calendar/venues.js';

export const USER_AGENT = 'Mozilla/5.0 (research; dark-night-desk)';
export const SITE = 'https://first-avenue.com';
export const CALENDAR_URL = `${SITE}/shows/`;
export const MIN_GAP_MS = 2500;
export const PAST_DAYS = 90;
export const AHEAD_DAYS = 60;
const DEFAULT_CITY = 'Minneapolis';
const REQUEST_TIMEOUT_MS = 30_000;

export class RefreshStop extends Error {
  constructor(message) {
    super(message);
    this.name = 'RefreshStop';
  }
}

/** First day (YYYYMM01) of every month that overlaps today - 90 days .. today + 60 days. */
export function monthsToRead(today) {
  const first = addDays(today, -PAST_DAYS);
  const last = addDays(today, AHEAD_DAYS);
  const months = [];
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7));
  const end = Number(last.slice(0, 4)) * 12 + Number(last.slice(5, 7));
  while (y * 12 + m <= end) {
    months.push(`${y}${String(m).padStart(2, '0')}01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export const monthUrl = (yyyymm01) => `${CALENDAR_URL}?start_date=${yyyymm01}`;

/** Room name to file id: "Amsterdam Bar & Hall" -> "fa-amsterdam-bar-hall". */
export function roomId(room) {
  const slug = room
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `fa-${slug || 'room'}`;
}

/** JSON text with every character outside ASCII written as \uXXXX, so venue files stay plain ASCII. */
export function asciiJson(value) {
  const text = JSON.stringify(value, null, 2).replace(/[\u0080-\uFFFF]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `${text}\n`;
}

/** Existing First Avenue venue files in a directory, keyed by lower-case room name. */
export async function readExisting(venuesDir) {
  let names;
  try {
    names = await readdir(venuesDir);
  } catch (err) {
    if (err.code === 'ENOENT') return new Map();
    throw err;
  }
  const byName = new Map();
  for (const name of names.filter((n) => /^fa-.*\.json$/.test(n)).sort()) {
    try {
      const venue = JSON.parse(await readFile(path.join(venuesDir, name), 'utf8'));
      if (venue && typeof venue.name === 'string' && !venue._synthetic) {
        byName.set(venue.name.trim().toLowerCase(), { file: name, venue });
      }
    } catch {
      // An unreadable file is left as it is; the room gets a fresh file name only if the name is new.
    }
  }
  return byName;
}

/**
 * Turn parsed calendar rows into venue documents. Canceled and postponed rows are skipped.
 * Every existing fa-* room is rewritten, with empty lists when the calendar no longer lists it.
 * @returns {{ file: string, venue: object, isNew: boolean }[]}
 */
export function buildVenues(rows, existing, { today, readAt }) {
  const showsFrom = today;
  const showsTo = addDays(today, AHEAD_DAYS);
  const pastFrom = addDays(today, -PAST_DAYS);
  const pastTo = addDays(today, -1);
  const rooms = new Map();
  for (const { venue } of existing.values()) rooms.set(venue.name.trim().toLowerCase(), { name: venue.name, rows: [] });
  const seen = new Set();
  for (const row of rows) {
    if (row.canceled) continue;
    const key = `${row.room.toLowerCase()}|${row.date}|${row.source_url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const nameKey = row.room.toLowerCase();
    if (!rooms.has(nameKey)) rooms.set(nameKey, { name: row.room, rows: [] });
    const room = rooms.get(nameKey);
    room.name = row.room;
    room.rows.push(row);
  }
  const show = (r) => ({ date: r.date, headliner: r.title, source_url: r.source_url });
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const out = [];
  for (const [nameKey, room] of rooms) {
    const prior = existing.get(nameKey);
    const id = prior ? prior.file.replace(/\.json$/, '') : roomId(room.name);
    const { id: _i, name: _n, city, capacity_band, calendar_source_url: _c, read_at: _r, closed_weekdays, shows: _s, past_shows: _p, ...extra } =
      prior?.venue ?? {};
    const sorted = [...room.rows].sort(byDate);
    out.push({
      file: `${id}.json`,
      isNew: !prior,
      venue: {
        id,
        name: room.name,
        city: typeof city === 'string' && city.trim() ? city : DEFAULT_CITY,
        capacity_band: typeof capacity_band === 'string' && capacity_band.trim() ? capacity_band : 'unknown',
        calendar_source_url: CALENDAR_URL,
        read_at: readAt,
        closed_weekdays: Array.isArray(closed_weekdays) ? closed_weekdays : [],
        shows: sorted.filter((r) => r.date >= showsFrom && r.date <= showsTo).map(show),
        past_shows: sorted.filter((r) => r.date >= pastFrom && r.date <= pastTo).map(show),
        ...extra,
      },
    });
  }
  return out.sort((a, b) => (a.file < b.file ? -1 : 1));
}

/** Write each file to a temporary name in the same directory first, then rename them all into place. */
export async function writeVenueFiles(venuesDir, built) {
  await mkdir(venuesDir, { recursive: true });
  const staged = [];
  try {
    for (const { file, venue } of built) {
      const tmp = path.join(venuesDir, `.${file}.${process.pid}.tmp`);
      await writeFile(tmp, asciiJson(venue));
      staged.push([tmp, path.join(venuesDir, file)]);
    }
  } catch (err) {
    await Promise.all(staged.map(([tmp]) => rm(tmp, { force: true })));
    throw err;
  }
  for (const [tmp, dest] of staged) await rename(tmp, dest);
}

/**
 * A polite GET client: one request at a time, at least `gap()` ms between request starts.
 * @param {{ fetch: typeof fetch, now: () => number, sleep: (ms: number) => Promise<void> }} io
 */
export function politeGetter({ fetch, now, sleep }, gap) {
  let lastStart = null;
  const requests = [];
  async function get(url) {
    if (lastStart !== null) {
      const wait = lastStart + gap() - now();
      if (wait > 0) await sleep(wait);
    }
    lastStart = now();
    requests.push({ method: 'GET', url, at: lastStart });
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { status: res.status, text: await res.text() };
  }
  return { get, requests };
}

/**
 * Read the calendar and (unless dryRun) rewrite the venue files.
 * @param {{ venuesDir: string, dataDir: string, dryRun?: boolean, fetch?: typeof fetch, now?: () => number,
 *   sleep?: (ms: number) => Promise<void>, print?: (line: string) => void }} opts
 */
export async function refreshVenues({
  venuesDir,
  dataDir,
  dryRun = false,
  fetch = globalThis.fetch,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  print = console.log,
}) {
  const rawDir = path.join(dataDir, 'raw-calendar');
  await mkdir(rawDir, { recursive: true });
  let gapMs = MIN_GAP_MS;
  const client = politeGetter({ fetch, now, sleep }, () => gapMs);
  const backOff = (status, url) => {
    if (status === 403 || status === 429) throw new RefreshStop(`${url} answered ${status}; stopping without writing anything`);
  };

  const robotsUrl = `${SITE}/robots.txt`;
  let robots;
  try {
    robots = await client.get(robotsUrl);
  } catch (err) {
    throw new RefreshStop(`could not read ${robotsUrl}: ${err.message}`);
  }
  backOff(robots.status, robotsUrl);
  let robotsText = '';
  if (robots.status === 200) robotsText = robots.text;
  else if (robots.status < 400 || robots.status >= 500) throw new RefreshStop(`${robotsUrl} answered ${robots.status}; stopping`);
  await writeFile(path.join(rawDir, 'robots.txt'), robotsText);

  const today = todayISO(now());
  const months = monthsToRead(today);
  for (const m of months) {
    const u = new URL(monthUrl(m));
    const verdict = robotsVerdict(robotsText, USER_AGENT, `${u.pathname}${u.search}`);
    if (!verdict.allowed) throw new RefreshStop(`robots.txt disallows ${u.pathname} for our user agent (${verdict.rule}); stopping`);
    if (verdict.crawlDelay !== null) gapMs = Math.max(gapMs, verdict.crawlDelay * 1000);
  }
  print(`robots.txt allows the calendar; ${months.length} month pages, at least ${gapMs} ms apart`);

  const rows = [];
  for (const m of months) {
    const url = monthUrl(m);
    let page;
    try {
      page = await client.get(url);
    } catch (err) {
      throw new RefreshStop(`could not read ${url}: ${err.message}`);
    }
    backOff(page.status, url);
    if (page.status !== 200) throw new RefreshStop(`${url} answered ${page.status}; stopping without writing anything`);
    await writeFile(path.join(rawDir, `${m.slice(0, 6)}.html`), page.text);
    const monthRows = parseMonthPage(page.text, { pageUrl: url });
    const listed = listedShowCount(page.text);
    if (listed && monthRows.length === 0) throw new RefreshStop(`${url} lists ${listed} shows but none could be parsed; the page layout may have changed`);
    const note = listed !== null && listed !== monthRows.length ? ` (page says ${listed})` : '';
    print(`${m.slice(0, 4)}-${m.slice(4, 6)}: ${monthRows.length} rows${note}, ${monthRows.filter((r) => r.canceled).length} canceled or postponed`);
    rows.push(...monthRows);
  }
  if (!rows.some((r) => !r.canceled)) throw new RefreshStop('no shows parsed from any month page; nothing written');

  const readAt = new Date(now()).toISOString().replace(/\.\d+Z$/, 'Z');
  const built = buildVenues(rows, await readExisting(venuesDir), { today, readAt });
  for (const { file, venue } of built) {
    const v = validateVenue(venue);
    if (!v.ok) throw new RefreshStop(`${file} would fail the venue schema (${v.errors.join('; ')}); nothing written`);
  }
  for (const { file, venue, isNew } of built) {
    print(`${file}: ${venue.shows.length} shows, ${venue.past_shows.length} past shows${isNew ? ' (new room)' : ''}`);
  }
  if (!dryRun) await writeVenueFiles(venuesDir, built);
  print(`${dryRun ? 'dry run, nothing written' : `wrote ${built.length} venue files`}; read_at ${readAt}; ${client.requests.length} GET requests`);
  return { built, requests: client.requests, readAt, dryRun };
}

/** @returns {Promise<number>} exit code */
export async function main(argv = process.argv.slice(2), env = process.env, print = console.log, io = {}) {
  const unknown = argv.filter((a) => a !== '--dry-run');
  if (unknown.length) {
    print(`refresh-venues: unknown argument ${unknown[0]}\nusage: node scripts/refresh-venues.js [--dry-run]`);
    return 1;
  }
  let config;
  try {
    config = loadConfig(env);
  } catch (err) {
    print(err instanceof ConfigError ? err.message : `refresh-venues: ${err.message}`);
    return 1;
  }
  try {
    await refreshVenues({ venuesDir: config.venuesDir, dataDir: config.dataDir, dryRun: argv.includes('--dry-run'), print, ...io });
    return 0;
  } catch (err) {
    print(`refresh-venues: ${err.message}`);
    return err instanceof RefreshStop ? 2 : 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
