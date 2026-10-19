// Scripted plan (no LLM): calls the same tools in a fixed order and writes the text from templates.
// Shown on screen as "Agent: fixed steps, no AI writing"; never presented as the agent.
import { runTool, scriptedWhy, strongestAlsoLoves } from './tools.js';
import { shortlistSizeFor } from './result.js';

/**
 * @param {ReturnType<import('./tools.js').createSession>} session
 * @returns {Promise<{ final?: object, error?: { code: string, message: string } }>}
 */
export async function runScripted(session) {
  await runTool(session, 'read_calendar');
  await runTool(session, 'resolve_entities');
  await runTool(session, 'build_pool');
  const ranked = await runTool(session, 'rank_pool');
  if (ranked.error) return { error: ranked.error };
  const size = shortlistSizeFor(session);
  if (!size) return { error: { code: 'empty_ranking', message: 'no act in the pool could be ranked for this room' } };
  const top = ranked.ranked.slice(0, size);
  const explained = await runTool(session, 'explain', { entity_ids: top.map((x) => x.entity_id) });
  const also = await runTool(session, 'also_loves');
  const offer = await runTool(session, 'draft_offer', { entity_id: top[0].entity_id });
  const acts = new Map((explained.acts ?? []).map((a) => [a.entity_id, a]));
  // The reason line follows what drove each pick; the strongest also-loves fact goes on the first pick only.
  const strongest = strongestAlsoLoves(also.also_loves ?? []);
  const why = (x, i) => {
    const a = acts.get(x.entity_id);
    return a ? scriptedWhy(a.name ?? x.name ?? 'This act', a.contributions, { also: i === 0 ? strongest : undefined }) : '';
  };
  return {
    final: {
      shortlist: top.map((x, i) => ({ entity_id: x.entity_id, why: why(x, i) })),
      offer_note: offer.error ? undefined : { entity_id: offer.entity_id, subject: offer.subject, body: offer.body },
    },
  };
}
