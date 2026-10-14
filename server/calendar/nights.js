// Night-by-night status of a venue: booked (a show is listed), closed (a weekday the room is always shut),
// dark (open weekday with nothing listed) or unlisted (past the last date the calendar was read for, so nothing can be
// said yet). All date math is in UTC on plain YYYY-MM-DD strings, so the server's time zone never shifts a night.
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
 * @param {{ today?: string, listedUntil?: string | null }} [opts] with `today`, an empty night on that date is `today` and
 *   earlier empty nights are `past`: too late to book, so neither is a dark night and neither counts in `dark_count`.
 *   Today's night carries `today: true`. With `listedUntil`, an empty open night after that date is `unlisted`, not dark:
 *   the calendar was not read that far.
 * @returns {{ from: string, to: string, nights: { date: string, status: 'booked' | 'dark' | 'closed' | 'today' | 'past' | 'unlisted', today?: true,
 *   show?: { headliner: string, source_url: string } }[], dark_count: number }}
 */
export function nightsFor(venue, fromISO, days, { today, listedUntil } = {}) {
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
    const isToday = today !== undefined && date === today;
    let night;
    if (show) {
      // A one-off show on a usual closing day still counts as booked.
      night = { date, status: 'booked', show };
    } else if (closed.has(toDate(date).getUTCDay())) {
      night = { date, status: 'closed' };
    } else if (isToday) {
      night = { date, status: 'today' };
    } else if (today !== undefined && date < today) {
      night = { date, status: 'past' };
    } else if (listedUntil && date > listedUntil) {
      night = { date, status: 'unlisted' };
    } else {
      night = { date, status: 'dark' };
      dark++;
    }
    if (isToday) night.today = true;
    nights.push(night);
  }
  return { from: fromISO, to: nights[nights.length - 1].date, nights, dark_count: dark };
}
