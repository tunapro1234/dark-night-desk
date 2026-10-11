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
 * @param {ReturnType<import('./tools.js').createSession>} session
 * @param {{ shortlist: { entity_id: string, why?: string }[], also_loves?: { type: string, category: string }[],
 *   offer_note?: { entity_id?: string, subject?: string, body?: string } }} final
 * @param {{ agent: string, qloo: string, recorded_at?: string }} mode
 * @param {object} [extra] fields added as they are (for example `llm` usage)
 */
export function assembleResult(session, final, mode, extra = {}) {
  const ranking = new Map((session.state.ranking?.results ?? []).map((x) => [x.entity_id, x]));
  const explained = session.state.explained ?? {};
  const shortlist = final.shortlist.map((item, i) => {
    const r = ranking.get(item.entity_id);
    const ex = explained[item.entity_id];
    return {
      entity_id: item.entity_id,
      name: r?.name ?? ex?.name ?? null,
      rank: i + 1,
      pool_rank: r?.rank ?? null,
      why: item.why || ex?.suggested_why || '',
      evidence: { contributions: ex?.contributions ?? [], method: ex?.method ?? 'leave-one-out' },
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
  return {
    mode,
    venue: calendar?.venue ?? null,
    night: { date: session.date, day: calendar?.night.day },
    shortlist,
    also_loves: picked,
    offer_note,
    offer_notes,
    pool: pool ? { city: pool.city, window: pool.window, rooms: pool.rooms, counts: pool.counts, method: session.state.ranking?.method } : null,
    signal: session.state.signal ? { size: session.state.signal.signal.length, counts: session.state.signal.counts } : null,
    steps: [...session.steps],
    calls: session.calls.map(callShape),
    fallbacks: [...session.fallbacks],
    ...extra,
  };
}
