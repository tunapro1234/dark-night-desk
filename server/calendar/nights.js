// Night-by-night status of a venue: booked (a show is listed), closed (a weekday the room is always shut)
// or dark (open weekday with nothing booked). All date math is in UTC on plain YYYY-MM-DD strings,
// so the server's time zone never shifts a night.
import { isISODate } from './venues.js';

export const MAX_DAYS = 366;
const DAY_MS = 86_400_000;

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toISO = (d) => d.toISOString().slice(0, 10);

/** Calendar date `n` days after `iso` (n may be negative). */
export function addDays(iso, n) {
  return toISO(new Date(toDate(iso).getTime() + n * DAY_MS));
}

/** Today's date in UTC as YYYY-MM-DD. */
export function todayISO(now = Date.now()) {
  return toISO(new Date(now));
}

/**
 * @param {{ closed_weekdays?: number[], shows?: object[], past_shows?: object[] }} venue
 * @param {string} fromISO first night, YYYY-MM-DD
 * @param {number} days number of nights, 1..MAX_DAYS
 * @returns {{ from: string, to: string, nights: { date: string, status: 'booked' | 'dark' | 'closed', show?: { headliner: string, source_url: string } }[], dark_count: number }}
 */
export function nightsFor(venue, fromISO, days) {
  if (!isISODate(fromISO)) throw new RangeError(`from must be a YYYY-MM-DD date, got "${fromISO}"`);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new RangeError(`days must be an integer between 1 and ${MAX_DAYS}`);

  const closed = new Set(venue?.closed_weekdays ?? []);
  // Past and upcoming program both mark a night as booked; the first listing on a date wins.
  const showOn = new Map();
  for (const s of [...(venue?.shows ?? []), ...(venue?.past_shows ?? [])]) {
    if (s?.date && !showOn.has(s.date)) showOn.set(s.date, { headliner: s.headliner, source_url: s.source_url });
  }

  const nights = [];
  let dark = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(fromISO, i);
    const show = showOn.get(date);
    if (show) {
      // A one-off show on a usual closing day still counts as booked.
      nights.push({ date, status: 'booked', show });
    } else if (closed.has(toDate(date).getUTCDay())) {
      nights.push({ date, status: 'closed' });
    } else {
      nights.push({ date, status: 'dark' });
      dark++;
    }
  }
  return { from: fromISO, to: nights[nights.length - 1].date, nights, dark_count: dark };
}
