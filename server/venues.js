// Venue files: one JSON document per venue in VENUES_DIR.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Read every *.json venue file in a directory. A missing directory yields an empty list;
 * a file that cannot be parsed or lacks an id is skipped and reported through `onSkip`.
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
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    const file = path.join(dir, name);
    try {
      const venue = JSON.parse(await readFile(file, 'utf8'));
      if (!venue || typeof venue.id !== 'string' || !venue.id) {
        onSkip(file, 'missing "id"');
        continue;
      }
      venues.push(venue);
    } catch (err) {
      onSkip(file, err.message);
    }
  }
  return venues;
}

/** Public summary of a venue, as served by GET /api/venues. */
export function venueSummary(venue) {
  return {
    id: venue.id,
    name: venue.name ?? venue.id,
    city: venue.city ?? null,
    capacity_band: venue.capacity_band ?? null,
    calendar_source_url: venue.calendar_source_url ?? null,
  };
}
