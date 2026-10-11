// Signal ablation: switch off one or more past shows and see how the top 5 moves.
import { SHORTLIST_SIZE, rankPool, topN } from './rank.js';

/**
 * @param {ReturnType<import('../qloo/client.js').createQlooClient>} client
 * @param {{ signalIds: string[], poolIds: Array<string | object>, removeIds: string[], baseline?: object[],
 *   popularityMax?: number, weights?: object }} args `baseline` is the current ranking's results; computed when absent.
 * @returns {Promise<{ shortlist: object[], changed: number, of: number, removed: string[], ignored: string[],
 *   method: string, calls: object[], fallbacks: object[], error?: object }>}
 */
export async function ablate(client, { signalIds, poolIds, removeIds = [], baseline, popularityMax, weights }) {
  const signal = new Set(signalIds);
  const removed = [...new Set(removeIds)].filter((id) => signal.has(id));
  const ignored = [...new Set(removeIds)].filter((id) => !signal.has(id));
  const remaining = signalIds.filter((id) => !removed.includes(id));
  const calls = [];
  const fallbacks = [];

  let base = baseline;
  if (!base) {
    const b = await rankPool(client, { signalIds, poolIds, popularityMax, weights, explain: false });
    calls.push(...b.calls);
    fallbacks.push(...b.fallbacks);
    base = b.results;
  }
  const before = topN(base).map((x) => x.entity_id);

  if (!remaining.length) {
    return { shortlist: [], changed: 0, of: SHORTLIST_SIZE, removed, ignored, method: 'no-signal', calls, fallbacks,
      error: { code: 'no_signal_left', message: 'every past show was switched off; keep at least one' } };
  }
  const r = await rankPool(client, { signalIds: remaining, poolIds, popularityMax, weights, explain: false });
  calls.push(...r.calls);
  fallbacks.push(...r.fallbacks);
  const shortlist = topN(r.results);
  const changed = shortlist.filter((x) => !before.includes(x.entity_id)).length;
  const out = { shortlist, changed, of: SHORTLIST_SIZE, removed, ignored, method: r.method, calls, fallbacks };
  return r.error ? { ...out, error: r.error } : out;
}
