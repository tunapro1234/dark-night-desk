// BACKTEST.md "Headliner rule", applied as written:
// 1. normalize (lowercase, strip accents and punctuation, drop a leading "the", collapse spaces);
// 2. search the whole title (artist type); resolved only if the top result's normalized name equals the normalized title;
// 3. otherwise split at the first separator of the list, in list order, and test the part before it the same way;
// 4. otherwise unresolved. No fuzzy matching and no hand fixing.
import { entitiesOf } from '../qloo/client.js';
import { ARTIST, normalizeName } from '../rank/pool.js';

export { normalizeName };
export const SEPARATORS = Object.freeze([' ft. ', ' feat. ', ' featuring ', ' with ', ' w/ ', ' + ', ' / ', ', ', ' and ', ' & ']);
const TAKE = 5;

/** The part of the title before the first separator (in list order) that occurs in it, or null. Case-insensitive. */
export function splitAtSeparator(title) {
  const text = String(title ?? '');
  const lower = text.toLowerCase();
  for (const sep of SEPARATORS) {
    const i = lower.indexOf(sep);
    if (i > 0) {
      const head = text.slice(0, i).trim();
      return head || null;
    }
  }
  return null;
}

/**
 * @param {{ search: (query: string, opts: object) => Promise<{status: string, data: unknown, error?: object}> }} client
 * @param {string} title
 * @returns {Promise<{ status: 'resolved', step: 'title' | 'split', entity: { entity_id: string, name: string, popularity: number | null, tags: object[] } }
 *   | { status: 'unresolved' } | { status: 'error', error: object }>}
 */
export async function resolveHeadliner(client, title) {
  const queries = [String(title ?? '').trim()];
  const head = splitAtSeparator(title);
  if (head) queries.push(head);
  for (const [i, query] of queries.entries()) {
    if (!normalizeName(query)) continue;
    const r = await client.search(query, { types: [ARTIST], take: TAKE });
    if (r.status === 'error') return { status: 'error', error: r.error ?? { code: 'error' } };
    const top = entitiesOf(r.data)[0];
    if (top?.entity_id && normalizeName(top.name) === normalizeName(query)) {
      return {
        status: 'resolved',
        step: i === 0 ? 'title' : 'split',
        entity: { entity_id: top.entity_id, name: top.name, popularity: typeof top.popularity === 'number' ? top.popularity : null, tags: Array.isArray(top.tags) ? top.tags : [] },
      };
    }
  }
  return { status: 'unresolved' };
}
