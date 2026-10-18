// Live agent: Claude tool-use loop over the tools in tools.js. At most MAX_TURNS model calls. The agent picks the tools
// and their order. The run ends in one of three ways: a plan through submit_plan (checked by validateAgentOutput), a
// thin-signal answer through report_thin_signal (checked by validateThinSignal), or, when the page can answer, a
// question to the booker through ask_booker. A rejected answer gets one more try with the errors in hand. Every
// response's usage is booked in the budget ledger, and a spent cap stops the loop.
import Anthropic from '@anthropic-ai/sdk';
import { THIN_SIGNAL_BELOW, TOOL_DEFS, bookerQuestion, runTool, toolOutputs } from './tools.js';
import { rankedIds, shortlistSizeFor } from './result.js';
import { validateAgentOutput, validateThinSignal } from './validate.js';

export const MAX_TURNS = 8;
export const MAX_ANSWERS = 2;
const MAX_TOKENS = 8000;

/** @param {string} apiKey */
export const createAnthropic = (apiKey) => new Anthropic({ apiKey, maxRetries: 2 });

export const SUBMIT_TOOL = Object.freeze({
  name: 'submit_plan',
  description: 'Submit the final plan for this night, once: acts from rank_pool, reasons that match explain, the note from draft_offer.',
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

export const THIN_TOOL = Object.freeze({
  name: 'report_thin_signal',
  description:
    "End the plan without a shortlist because too few of the room's past headliners were found in the taste graph " +
    '(resolve_entities then returns `thin`). Accepted only when the signal is thin.',
  input_schema: {
    type: 'object',
    properties: { why: { type: 'string', description: 'One or two plain sentences to the booker: what was too thin, and what would help.' } },
    required: ['why'],
    additionalProperties: false,
  },
});

export const ASK_TOOL = Object.freeze({
  name: 'ask_booker',
  description:
    'Ask the booker which artist one ambiguous past headliner was (a name from resolve_entities needs_input). The page shows ' +
    'up to 3 candidates; the plan then runs again from resolve_entities with the answer. This ends the current run.',
  input_schema: {
    type: 'object',
    properties: { name: { type: 'string', description: 'The name exactly as needs_input lists it.' } },
    required: ['name'],
    additionalProperties: false,
  },
});

/**
 * @param {ReturnType<import('./tools.js').createSession>} session
 * @param {{ canAsk?: boolean }} [opts] `canAsk`: the page can answer a question (offered once per night).
 */
export function systemPrompt(session, { canAsk = false } = {}) {
  const city = session.venue.city;
  return [
    "You help the booker of an independent music venue fill a dark night: a night the room sits empty.",
    'Work only from tool outputs. You choose which tools to call and in what order; a tool that needs an earlier step runs it',
    'itself. End with submit_plan, or with report_thin_signal when there is too little to rank on.',
    '',
    'Decisions that are yours:',
    `- Thin signal: when resolve_entities returns \`thin\` (fewer than ${THIN_SIGNAL_BELOW} past headliners found), a ranking would rest on`,
    `  too few shows. Say so with report_thin_signal instead of ranking${canAsk ? ', unless asking the booker about an ambiguous name could widen it' : ''}.`,
    ...(canAsk
      ? [
          '- Ambiguous names: resolve_entities lists names it could not match for sure under needs_input, with candidates. If one',
          '  of them matters to this plan (a recent or repeated show, or a thin signal), call ask_booker with that name before',
          '  build_pool. You may ask once; the plan then runs again with the answer. If none matters, go on without asking.',
        ]
      : []),
    '- One-show picks: when explain shows one past show carrying most of a pick (about 60% of its share or more), call ablate',
    '  with that show switched off before you submit. If the act leaves the top 5 without it, say in its line that it rests',
    '  on that one show, or move it down or out. The card shows the check either way.',
    '',
    'Rules for the answer:',
    '- Shortlist 5 acts from the rank_pool list. Keep its order unless a tool output gives you a reason to move an act.',
    "- One sentence per act, close to: \"Your crowd came for A and B. X sits right between them.\", where A and B are the",
    '  past shows explain lists first for that act.',
    '- Never write a number that is not in a tool output. No fee, ticket, attendance or capacity estimates.',
    `- The pool is "acts who played ${city} this season". Do not say an act is touring nearby.`,
    `  Acts with a show already announced in ${city} are left out of it; do not suggest booking an act around another date.`,
    '- Popularity is a rough stand-in for draw; we have no ticket data.',
    "- The offer note goes to the artist's booking agent, keeps the line \"Guarantee: ___\" blank, and is never sent.",
    '  It speaks for the room: "Our crowd came for A and B. X sits right between them." (explain gives it as',
    '  suggested_offer_line). Never "Your crowd" in the note; that wording is only for the shortlist lines to the booker.',
    '- Plain English, no jargon such as "signal", "affinity" or ids in the text.',
  ].join('\n');
}

const userPrompt = (session) => `Plan ${session.date} at ${session.venue.name} (venue id ${session.venue.id}).`;

const addUsage = (sum, u = {}) => {
  for (const k of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) sum[k] += Number(u[k] ?? 0) || 0;
};

/**
 * @param {{ anthropic: { messages: { create: Function } }, model: string, session: ReturnType<import('./tools.js').createSession>,
 *   budget: ReturnType<import('../budget/budget.js').createBudget>, maxTurns?: number, canAsk?: boolean }} args
 *   `canAsk` offers ask_booker; a valid call ends the run with `question` (see bookerQuestion in tools.js).
 * @returns {Promise<{ final?: object, question?: object, error?: { code: string, message: string, errors?: string[] }, turns: number,
 *   usage: object, rejections: string[][] }>}
 */
export async function runLive({ anthropic, model, session, budget, maxTurns = MAX_TURNS, canAsk = false }) {
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, usd: 0 };
  const rejections = [];
  const messages = [{ role: 'user', content: userPrompt(session) }];
  const system = systemPrompt(session, { canAsk });
  const tools = [...TOOL_DEFS, SUBMIT_TOOL, THIN_TOOL, ...(canAsk ? [ASK_TOOL] : [])];
  let turns = 0;
  const out = (rest) => ({ ...rest, turns, usage: { ...usage, usd: Math.round(usage.usd * 1e6) / 1e6 }, rejections });

  while (turns < maxTurns) {
    const spend = budget.canSpend();
    if (!spend.ok) return out({ error: { code: spend.reason, message: 'the Claude spend cap was reached during the run' } });
    turns++;
    let response;
    try {
      // Top-level cache_control caches the growing prefix (tools, system, earlier turns) from one turn to the next.
      response = await anthropic.messages.create({
        model, max_tokens: MAX_TOKENS, system, tools, thinking: { type: 'adaptive' }, cache_control: { type: 'ephemeral' }, messages,
      });
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
    let question = null;
    for (const u of uses) {
      if (u.name === 'ask_booker' && canAsk) {
        const q = bookerQuestion(session, u.input?.name);
        if (q && !question) question = q;
        results.push(q
          ? { type: 'tool_result', tool_use_id: u.id, content: 'asked' }
          : { type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'Not asked: that name is not under needs_input in resolve_entities (call it first, and ask once).' });
        continue;
      }
      if (u.name !== 'submit_plan' && u.name !== 'report_thin_signal') {
        const output = await runTool(session, u.name, u.input);
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(output), ...(output?.error ? { is_error: true } : {}) });
        continue;
      }
      const thin = u.name === 'report_thin_signal';
      const v = thin
        ? validateThinSignal(u.input, toolOutputs(session), { signalSize: session.state.signal?.signal.length, thinBelow: THIN_SIGNAL_BELOW })
        : validateAgentOutput(u.input, toolOutputs(session), { shortlistSize: shortlistSizeFor(session), allowedIds: rankedIds(session) });
      if (v.ok && !final) {
        final = thin ? { thin_signal: { why: u.input.why } } : u.input;
        results.push({ type: 'tool_result', tool_use_id: u.id, content: 'accepted' });
      } else {
        rejections.push(v.ok ? ['the final answer was sent twice'] : v.errors);
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Rejected. Fix these and call ${u.name} again:\n- ${rejections.at(-1).join('\n- ')}` });
      }
    }
    if (final) return out({ final });
    if (question) return out({ question });
    if (rejections.length >= MAX_ANSWERS) return out({ error: { code: 'rejected', message: 'the final answer failed validation twice', errors: rejections.at(-1) } });
    messages.push({ role: 'user', content: results });
  }
  return out({ error: { code: 'max_turns', message: `no final answer within ${maxTurns} turns` } });
}
