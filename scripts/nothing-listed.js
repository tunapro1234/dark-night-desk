#!/usr/bin/env node
// The problem number on the first screen and in the README: nights with no show listed at the Study 1 test rooms,
// 1 Apr to 30 Sep 2026, from data/backtest/shows.csv (canceled rows left out). No network, no Qloo.
// Usage: node scripts/nothing-listed.js [shows.csv]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../server/config.js';
import { addDays } from '../server/calendar/nights.js';
import { parseCsv } from '../server/backtest/data.js';

export const ROOMS = Object.freeze(['fa-7th-st-entry', 'fa-fine-line', 'fa-turf-club']);
export const FROM = '2026-04-01';
export const TO = '2026-09-30';

/** @returns {{ nights: number, nothing_listed: number, mon_to_wed: number, rooms: Record<string, { nothing_listed: number, mon_to_wed: number }> }} */
export function nothingListed(rows, { rooms = ROOMS, from = FROM, to = TO } = {}) {
  const listed = new Map(rooms.map((r) => [r, new Set()]));
  for (const r of rows) if (listed.has(r.venue_id) && String(r.canceled) !== '1') listed.get(r.venue_id).add(r.date);
  const out = { nights: 0, nothing_listed: 0, mon_to_wed: 0, rooms: {} };
  for (const room of rooms) {
    const per = { nothing_listed: 0, mon_to_wed: 0 };
    for (let d = from; d <= to; d = addDays(d, 1)) {
      out.nights++;
      if (listed.get(room).has(d)) continue;
      per.nothing_listed++;
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (wd >= 1 && wd <= 3) per.mon_to_wed++;
    }
    out.rooms[room] = per;
    out.nothing_listed += per.nothing_listed;
    out.mon_to_wed += per.mon_to_wed;
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? path.join(REPO_ROOT, 'data', 'backtest', 'shows.csv');
  const r = nothingListed(parseCsv(readFileSync(file, 'utf8')));
  console.log(`${r.nothing_listed} of ${r.nights} nights had no show listed (${FROM} to ${TO}); ${r.mon_to_wed} of those were Monday to Wednesday.`);
  for (const [room, x] of Object.entries(r.rooms)) console.log(`  ${room}: ${x.nothing_listed} (${x.mon_to_wed} Monday to Wednesday)`);
}
