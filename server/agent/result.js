// Builds the /api/plan result from a session and the agent's final answer. Names, ranks, evidence and lift ranges always
// come from the tool outputs; the agent contributes only its choice of acts and the wording it was allowed to write.
import { OFFER_TO, SHORTLIST_SIZE, offerNote } from './tools.js';
import { topN } from '../rank/rank.js';

/** Acts the final answer may shortlist: the scored part of the ranking. */
export const rankedIds = (session) => topN(session.state.ranking?.results ?? [], Infinity).map((x) => x.entity_id);

/** Exact shortlist length for this session: 5, or fewer when the ranking scored fewer acts. */
export const shortlistSizeFor = (session) => Math.min(SHORTLIST_SIZE, rankedIds(session).length);

const callShape = (c) => ({ endpoint: c.endpoint, params_masked: c.params_masked, ms: c.ms, cache: c.cache });

/**
 * The ablate checks the agent ran, per act: an act gets a check when the past show that carries most of its match (the
 * first of its contributions) was switched off. Taken from the ablate output only; the latest check wins.
 * @returns {Map<string, { removed: { entity_id: string, name: string | null }[], in_top: boolean, rank_without: number | null, of: number }>}
 */
function ablateChecks(session, contributionsOf) {
  const out = new Map();
  for (const { tool, output } of session.log) {
    if (tool !== 'ablate' || !output || output.error || !output.removed?.length) continue;
    const removed = new Set(output.removed.map((x) => x.entity_id));
    for (const [id, contribs] of contributionsOf) {
      if (!contribs[0] || !removed.has(contribs[0].entity_id)) continue;
      const still = output.shortlist.find((x) => x.entity_id === id);
      out.set(id, { removed: output.removed, in_top: Boolean(still), rank_without: still?.rank ?? null, of: output.of });
    }
  }
  return out;
}

/**
 * @param {ReturnType<import('./tools.js').createSession>} session
 * @param {{ shortlist: { entity_id: string, why?: string }[], also_loves?: { type: string, category: string }[],
 *   offer_note?: { entity_id?: string, subject?: string, body?: string } }} final
 * @param {{ agent: string, qloo: string, recorded_at?: string }} mode
 * @param {object} [extra] fields added as they are (for example `llm` usage)
 */
export function assembleResult(session, final, mode, extra = {}) {
  const ranking = new Map((session.state.ranking?.results ?? []).map((x) => [x.entity_id, x]));
  const explained = session.state.explained ?? {};
  // build_pool's own record of where and when each act played the city (the reason it is in the pool).
  const inPool = new Map((session.state.pool?.pool ?? []).map((p) => [p.entity_id, p.played ?? []]));
  const roomName = new Map((session.venues ?? []).map((v) => [v.id, v.name]));
  const items = final.shortlist ?? [];
  const checks = ablateChecks(session, items.map((item) => [item.entity_id, explained[item.entity_id]?.contributions ?? []]));
  const shortlist = items.map((item, i) => {
    const r = ranking.get(item.entity_id);
    const ex = explained[item.entity_id];
    return {
      entity_id: item.entity_id,
      name: r?.name ?? ex?.name ?? null,
      rank: i + 1,
      pool_rank: r?.rank ?? null,
      why: item.why || ex?.suggested_why || '',
      played: (inPool.get(item.entity_id) ?? []).map((p) => ({ venue_id: p.venue_id, venue: roomName.get(p.venue_id) ?? null, date: p.date })),
      evidence: { contributions: ex?.contributions ?? [], method: ex?.method ?? 'leave-one-out' },
      ...(checks.has(item.entity_id) ? { check: checks.get(item.entity_id) } : {}),
    };
  });

  const rows = session.state.alsoLoves ?? [];
  const picked = final.also_loves?.length
    ? rows.filter((row) => final.also_loves.some((x) => x.type === row.type && x.category === row.category))
    : rows;

  const draft = session.state.offer;
  const note = final.offer_note ?? draft;
  const offer_note = note
    ? { to: OFFER_TO, entity_id: note.entity_id ?? draft?.entity_id ?? shortlist[0]?.entity_id, subject: note.subject, body: note.body, sent: false }
    : null;

  const calendar = session.state.calendar;
  // One note per shortlisted act, so the booker can write to any of them. The agent's own note is kept for its act;
  // the others come from the same template as draft_offer (no LLM). `offer_note` stays the first pick's note.
  const offer_notes = shortlist.map((act) => {
    if (offer_note && offer_note.entity_id === act.entity_id) return { ...offer_note, name: act.name };
    if (!calendar || !act.name) return null;
    const draftFor = offerNote({ venue: calendar.venue, day: calendar.night.day, act: { entity_id: act.entity_id, name: act.name }, contributors: act.evidence.contributions });
    return { ...draftFor, name: act.name };
  }).filter(Boolean);

  const pool = session.state.pool;
  const signal = session.state.signal;
  return {
    mode,
    venue: calendar?.venue ?? null,
    night: { date: session.date, day: calendar?.night.day },
    shortlist,
    also_loves: picked,
    offer_note,
    offer_notes,
    pool: pool ? { city: pool.city, window: pool.window, rooms: pool.rooms, counts: pool.counts, method: session.state.ranking?.method } : null,
    signal: signal ? { size: signal.signal.length, counts: signal.counts } : null,
    ...(signal?.answered?.length ? { answers: signal.answered } : {}),
    // The agent's thin-signal answer: no shortlist; the counts come from resolve_entities, the sentence from the agent.
    ...(final.thin_signal ? { thin_signal: { found: signal?.signal.length ?? 0, shows: signal?.counts.shows ?? 0, why: final.thin_signal.why } } : {}),
    steps: [...session.steps],
    calls: session.calls.map(callShape),
    fallbacks: [...session.fallbacks],
    ...extra,
  };
}
