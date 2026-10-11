// L ranker (BACKTEST.md): a Claude model given the room's S1 headliner names and the pool names, no Qloo data, one fixed prompt.
// Runs only with a Claude key and room in the spend caps; every response is booked in the budget ledger.
// The protocol asks for temperature 0. Current Claude models reject sampling parameters (HTTP 400), so none is sent and
// the run reports the model's default sampling instead.
import { BacktestError } from './rankers.js';

const MAX_TOKENS = 4000;

export const L_SYSTEM = [
  'You help the booker of a music venue.',
  "You get the acts who headlined this venue in the last few months, and a numbered list of candidate acts.",
  "Order every candidate by how likely this venue's regular crowd would come to see them, most likely first.",
  'Answer with only a JSON array of the candidate numbers, each number exactly once, for example [3, 1, 2].',
].join('\n');

export const lPrompt = (signalNames, poolNames) =>
  [
    'Recent headliners at this venue:',
    ...signalNames.map((n) => `- ${n}`),
    '',
    'Candidates:',
    ...poolNames.map((n, i) => `${i + 1}. ${n}`),
  ].join('\n');

/** Candidate indexes (0-based) from the model's text: the last JSON array of integers; unknown and repeated numbers are skipped,
 *  and candidates it left out follow in pool order. */
export function parseOrder(text, n) {
  const arrays = String(text).match(/\[[\d\s,]*\]/g) ?? [];
  const seen = new Set();
  const order = [];
  for (const x of arrays.length ? JSON.parse(arrays.at(-1)) : []) {
    const i = Number(x) - 1;
    if (Number.isInteger(i) && i >= 0 && i < n && !seen.has(i)) {
      seen.add(i);
      order.push(i);
    }
  }
  const complete = order.length === n;
  for (let i = 0; i < n; i++) if (!seen.has(i)) order.push(i);
  return { order, complete };
}

/**
 * @param {{ anthropic: { messages: { create: Function } }, model: string, budget: { canSpend: Function, record: Function } }} args
 */
export function createLlmRanker({ anthropic, model, budget }) {
  return {
    model,
    sampling: 'model default (temperature is not accepted by current Claude models)',
    /** @returns {Promise<{ order: number[], complete: boolean, usd: number }>} */
    async rank({ signalNames, poolNames }) {
      const spend = budget.canSpend();
      if (!spend.ok) throw new BacktestError('spend_cap', `the Claude spend cap was reached (${spend.reason})`);
      let res;
      try {
        res = await anthropic.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system: L_SYSTEM,
          messages: [{ role: 'user', content: lPrompt(signalNames, poolNames) }],
        });
      } catch (err) {
        throw new BacktestError('llm_error', `Claude request failed${err?.status ? ` (HTTP ${err.status})` : ''}`);
      }
      const { usd } = budget.record(res.usage);
      const text = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      return { ...parseOrder(text, poolNames.length), usd };
    },
  };
}
