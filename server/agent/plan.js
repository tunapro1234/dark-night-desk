// One plan request, start to finish. Mode order (AGENT_MODE=auto): live when there is a Claude key, room in the spend caps
// and in the IP limit; otherwise a recorded live run for the same room and night; otherwise the scripted plan.
// A live run whose answer fails validation twice also ends in the scripted plan, with the reason in `fallbacks`.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { effectiveAgentMode } from '../config.js';
import { planMode } from '../budget/budget.js';
import { runLive } from './loop.js';
import { assembleResult, rankedIds, shortlistSizeFor } from './result.js';
import { runScripted } from './scripted.js';
import { createSession, runTool, toolOutputs } from './tools.js';
import { validateAgentOutput } from './validate.js';

export const recordedDir = (dataDir) => path.join(dataDir, 'recorded');

export class PlanError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** The most recent saved live run for this room and night, or null. Unreadable files are skipped. */
export async function findRecorded(dataDir, venueId, date) {
  let names = [];
  try {
    names = (await readdir(recordedDir(dataDir))).filter((n) => n.endsWith('.json'));
  } catch {
    return null;
  }
  let best = null;
  for (const n of names) {
    try {
      const run = JSON.parse(await readFile(path.join(recordedDir(dataDir), n), 'utf8'));
      if (run?.venue_id !== venueId || run?.date !== date || !run?.result || !run?.saved_at) continue;
      if (!best || run.saved_at > best.saved_at) best = run;
    } catch {
      // not a recorded run
    }
  }
  return best;
}

async function saveRecorded(dataDir, run) {
  await mkdir(recordedDir(dataDir), { recursive: true });
  const stamp = run.saved_at.replace(/[:.]/g, '-');
  await writeFile(path.join(recordedDir(dataDir), `${run.venue_id}__${run.date}__${stamp}.json`), `${JSON.stringify(run, null, 2)}\n`);
}

/**
 * @param {{ config: ReturnType<import('../config.js').loadConfig>, budget: ReturnType<import('../budget/budget.js').createBudget>,
 *   qloo: object, qlooMode: string, venues: object[], venue: object, date: string, ip?: string,
 *   emit?: (label: string) => void, anthropic?: () => { messages: { create: Function } }, now?: () => number }} args
 *   `anthropic` is a factory, called only when the run is live.
 */
export async function runPlan({ config, budget, qloo, qlooMode, venues, venue, date, ip, emit = () => {}, anthropic, now = Date.now }) {
  const recorded = await findRecorded(config.dataDir, venue.id, date);
  const base = effectiveAgentMode(config, { hasRecordedRuns: Boolean(recorded) });
  const decided = planMode(base, budget, { ip, hasRecordedRuns: Boolean(recorded) });
  const fallbacks = decided.fallback ? [decided.fallback] : [];

  if (decided.agent === 'recorded') {
    for (const label of recorded.result.steps ?? []) emit(label);
    return {
      ...recorded.result,
      mode: { agent: 'recorded', qloo: qlooMode, recorded_at: recorded.saved_at },
      fallbacks: [...(recorded.result.fallbacks ?? []), ...fallbacks],
    };
  }

  if (decided.agent === 'live') {
    const session = createSession({ qloo, venues, venue, date, emit });
    const live = await runLive({ anthropic: anthropic(), model: config.anthropic.model, session, budget });
    const llm = { model: config.anthropic.model, turns: live.turns, usage: live.usage };
    if (live.final) {
      const result = assembleResult(session, live.final, { agent: 'live', qloo: qlooMode }, { llm });
      await saveRecorded(config.dataDir, { saved_at: new Date(now()).toISOString(), venue_id: venue.id, date, model: config.anthropic.model, result });
      return result;
    }
    fallbacks.push({ step: 'agent', reason: live.error.code, detail: live.error.errors ?? live.error.message, used: 'scripted plan' });
  }

  const session = createSession({ qloo, venues, venue, date, emit });
  session.fallbacks.push(...fallbacks);
  const scripted = await runScripted(session);
  if (scripted.error) throw new PlanError(scripted.error.code, scripted.error.message);
  const check = validateAgentOutput(scripted.final, toolOutputs(session), { shortlistSize: shortlistSizeFor(session), allowedIds: rankedIds(session) });
  if (!check.ok) throw new PlanError('invalid_plan', `scripted plan failed its own check: ${check.errors.join('; ')}`);
  return assembleResult(session, scripted.final, { agent: 'scripted', qloo: qlooMode });
}

/**
 * Switch off past shows for one room and night, re-rank, and compare with the full top 5. No LLM involved.
 * @returns {Promise<{ shortlist: object[], changed: number, of: number, removed: object[], ignored: string[], method: string,
 *   calls: object[], error?: object }>}
 */
export async function runAblate({ qloo, venues, venue, date, remove }) {
  const session = createSession({ qloo, venues, venue, date });
  const ranked = await runTool(session, 'rank_pool');
  if (ranked.error) throw new PlanError(ranked.error.code, ranked.error.message);
  const out = await runTool(session, 'ablate', { remove });
  return { ...out, calls: session.calls.map(({ endpoint, params_masked, ms, cache }) => ({ endpoint, params_masked, ms, cache })) };
}
