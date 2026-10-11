// Back-test input: data/backtest/venues.csv and shows.csv (columns documented in data/backtest/sources.md).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const S1 = Object.freeze({ from: '2026-04-01', to: '2026-06-30' });
export const S2 = Object.freeze({ from: '2026-07-01', to: '2026-09-30' });
export const ROLES = Object.freeze(['test', 'placebo', 'pool']);

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. Returns objects keyed by the header. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Read and check both files. Throws on a row that breaks the schema, so a bad file never produces numbers. */
export async function loadBacktestData(dir) {
  const venues = parseCsv(await readFile(path.join(dir, 'venues.csv'), 'utf8'));
  const shows = parseCsv(await readFile(path.join(dir, 'shows.csv'), 'utf8'));
  return checkData({ venues, shows });
}

export function checkData({ venues, shows }) {
  const ids = new Set();
  for (const [i, v] of venues.entries()) {
    if (!v.venue_id || !v.name) throw new Error(`venues.csv row ${i + 2}: venue_id and name are required`);
    if (!ROLES.includes(v.role)) throw new Error(`venues.csv row ${i + 2}: role must be one of ${ROLES.join(', ')}`);
    if (ids.has(v.venue_id)) throw new Error(`venues.csv row ${i + 2}: duplicate venue_id ${v.venue_id}`);
    ids.add(v.venue_id);
  }
  for (const [i, s] of shows.entries()) {
    if (!ids.has(s.venue_id)) throw new Error(`shows.csv row ${i + 2}: unknown venue_id ${s.venue_id}`);
    if (!ISO.test(s.date)) throw new Error(`shows.csv row ${i + 2}: date must be YYYY-MM-DD`);
    if (!s.title) throw new Error(`shows.csv row ${i + 2}: title is empty`);
    if (s.canceled !== '0' && s.canceled !== '1') throw new Error(`shows.csv row ${i + 2}: canceled must be 0 or 1`);
  }
  return { venues, shows };
}

export const periodOf = (date) => (date >= S1.from && date <= S1.to ? 'S1' : date >= S2.from && date <= S2.to ? 'S2' : null);

/** Monday (YYYY-MM-DD, UTC) of the Monday-to-Sunday week that contains the date. */
export function weekOf(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}
