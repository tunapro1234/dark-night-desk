// Live agent: Claude tool-use loop over the tools in tools.js. At most MAX_TURNS model calls. The final answer comes
// through the submit_plan tool and is checked by validateAgentOutput; a rejected answer gets one more try with the
// errors in hand. Every response's usage is booked in the budget ledger, and a spent cap stops the loop.
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFS, runTool, toolOutputs } from './tools.js';
import { rankedIds, shortlistSizeFor } from './result.js';
import { validateAgentOutput } from './validate.js';

export const MAX_TURNS = 8;
export const MAX_ANSWERS = 2;
const MAX_TOKENS = 8000;

/** @param {string} apiKey */
export const createAnthropic = (apiKey) => new Anthropic({ apiKey, maxRetries: 2 });

export const SUBMIT_TOOL = Object.freeze({
  name: 'submit_plan',
  description: 'Submit the final plan for this night. Call it once, after rank_pool, explain, also_loves and draft_offer.',
  input_schema: {
    type: 'object',
    properties: {
      shortlist: {
        type: 'array',
        description: 'Exactly 5 acts from rank_pool (fewer only if fewer were ranked), best first.',
        items: {
          type: 'object',
          properties: { entity_id: { type: 'string' }, why: { type: 'string', description: 'One sentence.' } },
          required: ['entity_id', 'why'],
          additionalProperties: false,
        },
      },
      also_loves: {
        type: 'array',
        description: 'Rows from also_loves to show, by type and category.',
        items: {
          type: 'object',
          properties: { type: { type: 'string', enum: ['movie', 'place', 'brand'] }, category: { type: 'string' } },
          required: ['type', 'category'],
          additionalProperties: false,
        },
      },
      offer_note: {
        type: 'object',
        description: "The note to the first act's booking agent, based on draft_offer.",
        properties: { entity_id: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
        required: ['entity_id', 'subject', 'body'],
        additionalProperties: false,
      },
    },
    required: ['shortlist', 'offer_note'],
    additionalProperties: false,
  },
});

/** @param {ReturnType<import('./tools.js').createSession>} session */
export function systemPrompt(session) {
  const city = session.venue.city;
  return [
    "You help the booker of an independent music venue fill a dark night: a night the room sits empty.",
    "Work only from tool outputs. A sensible order: read_calendar, resolve_entities, build_pool, rank_pool, explain, also_loves,",
    'draft_offer for your first pick, then submit_plan. Use ablate only if a check on one past show would change your pick.',
    '',
    'Rules for the answer:',
    '- Shortlist 5 acts from the rank_pool list. Keep its order unless a tool output gives you a reason to move an act.',
    "- One sentence per act, close to: \"Your crowd came for A and B. X sits right between them.\", where A and B are the",
    '  past shows explain lists first for that act.',
    '- Never write a number that is not in a tool output. No fee, ticket, attendance or capacity estimates.',
    `- The pool is "acts who played ${city} this season". Do not say an act is touring nearby.`,
    '- Popularity is a rough stand-in for draw; we have no ticket data.',
    "- The offer note goes to the artist's booking agent, keeps the line \"Guarantee: ___\" blank, and is never sent.",
    '- Plain English, no jargon such as "signal", "affinity" or ids in the text.',
  ].join('\n');
}

const userPrompt = (session) => `Plan ${session.date} at ${session.venue.name} (venue id ${session.venue.id}).`;

const addUsage = (sum, u = {}) => {
  for (const k of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) sum[k] += Number(u[k] ?? 0) || 0;
};

/**
 * @param {{ anthropic: { messages: { create: Function } }, model: string, session: ReturnType<import('./tools.js').createSession>,
 *   budget: ReturnType<import('../budget/budget.js').createBudget>, maxTurns?: number }} args
 * @returns {Promise<{ final?: object, error?: { code: string, message: string, errors?: string[] }, turns: number,
 *   usage: object, rejections: string[][] }>}
 */
export async function runLive({ anthropic, model, session, budget, maxTurns = MAX_TURNS }) {
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, usd: 0 };
  const rejections = [];
  const messages = [{ role: 'user', content: userPrompt(session) }];
  const system = systemPrompt(session);
  const tools = [...TOOL_DEFS, SUBMIT_TOOL];
  let turns = 0;
  const out = (rest) => ({ ...rest, turns, usage: { ...usage, usd: Math.round(usage.usd * 1e6) / 1e6 }, rejections });

  while (turns < maxTurns) {
    const spend = budget.canSpend();
    if (!spend.ok) return out({ error: { code: spend.reason, message: 'the Claude spend cap was reached during the run' } });
    turns++;
    let response;
    try {
      response = await anthropic.messages.create({ model, max_tokens: MAX_TOKENS, system, tools, thinking: { type: 'adaptive' }, messages });
    } catch (err) {
      return out({ error: { code: 'llm_error', message: `Claude request failed${err?.status ? ` (HTTP ${err.status})` : ''}` } });
    }
    usage.usd += budget.record(response.usage).usd;
    addUsage(usage, response.usage);
    messages.push({ role: 'assistant', content: response.content });

    const uses = response.content.filter((b) => b.type === 'tool_use');
    if (!uses.length) {
      if (response.stop_reason === 'pause_turn') continue;
      if (response.stop_reason === 'max_tokens' || response.stop_reason === 'refusal') {
        return out({ error: { code: response.stop_reason, message: `the model stopped (${response.stop_reason})` } });
      }
      rejections.push(['the answer did not come through submit_plan']);
      if (rejections.length >= MAX_ANSWERS) return out({ error: { code: 'rejected', message: 'no valid final answer', errors: rejections.at(-1) } });
      messages.push({ role: 'user', content: 'Send the final answer by calling submit_plan.' });
      continue;
    }

    const results = [];
    let final = null;
    for (const u of uses) {
      if (u.name !== 'submit_plan') {
        const output = await runTool(session, u.name, u.input);
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(output), ...(output?.error ? { is_error: true } : {}) });
        continue;
      }
      const v = validateAgentOutput(u.input, toolOutputs(session), { shortlistSize: shortlistSizeFor(session), allowedIds: rankedIds(session) });
      if (v.ok && !final) {
        final = u.input;
        results.push({ type: 'tool_result', tool_use_id: u.id, content: 'accepted' });
      } else {
        rejections.push(v.ok ? ['submit_plan was called twice'] : v.errors);
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Rejected. Fix these and call submit_plan again:\n- ${rejections.at(-1).join('\n- ')}` });
      }
    }
    if (final) return out({ final });
    if (rejections.length >= MAX_ANSWERS) return out({ error: { code: 'rejected', message: 'the final answer failed validation twice', errors: rejections.at(-1) } });
    messages.push({ role: 'user', content: results });
  }
  return out({ error: { code: 'max_turns', message: `no final answer within ${maxTurns} turns` } });
}
