// "This room's crowd also loves": film, place and brand categories that come up more for this room's signal than for
// the city's average room. Each type is asked twice, once with the room's signal and once with a neutral signal
// (the past headliners of the city's sample rooms, the same number from each room). Only the difference is shown:
// the share of top results carrying a category, room minus city. Raw affinity values are never shown.
// The range comes from two depths of the same answer (top 10 and top 20), so it is a spread, not a confidence interval.
import { entitiesOf } from '../qloo/client.js';

export const ALSO_LOVES_TYPES = Object.freeze(['movie', 'place', 'brand']);
export const LIFT_DEPTHS = Object.freeze([10, 20]);
const round = (x) => Math.round(x * 100) / 100;

/**
 * Neutral "average room" signal: the same number of most recent resolved headliners from each room, merged.
 * @param {string[][]} perRoomIds one list per sample room, most recent first
 * @param {{ perRoom?: number }} [opts] upper bound on how many acts each room contributes
 */
export function neutralSignal(perRoomIds, { perRoom = 25 } = {}) {
  const lists = perRoomIds.filter((l) => l?.length);
  if (!lists.length) return [];
  const m = Math.min(perRoom, ...lists.map((l) => l.length));
  return [...new Set(lists.flatMap((l) => l.slice(0, m)))];
}

function categoryShares(entities, depth) {
  const top = entities.slice(0, depth);
  const counts = new Map();
  for (const e of top) {
    for (const name of new Set((e.tags ?? []).map((t) => t?.name).filter(Boolean))) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return { n: top.length, share: (name) => (top.length ? (counts.get(name) ?? 0) / top.length : 0), names: [...counts.keys()] };
}

/**
 * @param {ReturnType<import('../qloo/client.js').createQlooClient>} client
 * @param {{ roomSignalIds: string[], neutralSignalIds: string[], types?: readonly string[], depths?: readonly number[],
 *   paramsByType?: Record<string, object> }} args `paramsByType` adds per-type parameters (for example a location filter for place).
 * @returns {Promise<{ also_loves: { type: string, category: string, lift_range: [number, number], evidence: object }[],
 *   calls: object[], fallbacks: object[] }>}
 */
export async function alsoLoves(client, { roomSignalIds, neutralSignalIds, types = ALSO_LOVES_TYPES, depths = LIFT_DEPTHS, paramsByType = {} }) {
  const calls = [];
  const fallbacks = [];
  const also_loves = [];
  if (!roomSignalIds?.length || !neutralSignalIds?.length) {
    fallbacks.push({ step: 'also loves', reason: 'room or city signal is empty', used: 'row left out' });
    return { also_loves, calls, fallbacks };
  }
  const take = Math.max(...depths);

  for (const type of types) {
    const ask = (signal) =>
      client.insights({ 'filter.type': `urn:entity:${type}`, 'signal.interests.entities': signal, take, ...(paramsByType[type] ?? {}) });
    const room = await ask(roomSignalIds);
    const city = await ask(neutralSignalIds);
    calls.push(room.call, city.call);
    if (room.status !== 'ok' || city.status !== 'ok') {
      fallbacks.push({ step: `also loves: ${type}`, reason: `room ${room.status}, city ${city.status}`, used: 'row left out' });
      continue;
    }
    const r = depths.map((d) => categoryShares(entitiesOf(room.data), d));
    const c = depths.map((d) => categoryShares(entitiesOf(city.data), d));
    const best = [...new Set(r.flatMap((x) => x.names))]
      .map((name) => {
        const lifts = depths.map((_, i) => r[i].share(name) - c[i].share(name));
        return { name, lo: Math.min(...lifts), hi: Math.max(...lifts) };
      })
      .filter((x) => x.lo > 0)
      .sort((a, b) => b.lo - a.lo || b.hi - a.hi || (a.name < b.name ? -1 : 1))[0];
    if (!best) {
      fallbacks.push({ step: `also loves: ${type}`, reason: 'no category above the city average at both depths', used: 'row left out' });
      continue;
    }
    also_loves.push({
      type,
      category: best.name,
      lift_range: [round(best.lo), round(best.hi)],
      evidence: {
        measure: 'share of top results in this category, this room minus the city average room',
        depths: [...depths],
        room_share: depths.map((_, i) => round(r[i].share(best.name))),
        city_share: depths.map((_, i) => round(c[i].share(best.name))),
        signal_sizes: { room: roomSignalIds.length, city: neutralSignalIds.length },
        calls: [room.call, city.call],
      },
    });
  }
  return { also_loves, calls, fallbacks };
}
