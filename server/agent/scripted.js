// Scripted plan (no LLM): calls the same tools in a fixed order and writes the text from templates.
// Shown on screen as "Agent: scripted plan (no LLM)"; never presented as the agent.
import { runTool } from './tools.js';
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
  await runTool(session, 'also_loves');
  const offer = await runTool(session, 'draft_offer', { entity_id: top[0].entity_id });
  const why = new Map((explained.acts ?? []).map((a) => [a.entity_id, a.suggested_why]));
  return {
    final: {
      shortlist: top.map((x) => ({ entity_id: x.entity_id, why: why.get(x.entity_id) ?? '' })),
      offer_note: offer.error ? undefined : { entity_id: offer.entity_id, subject: offer.subject, body: offer.body },
    },
  };
}
