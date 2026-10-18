// One plan request, start to finish. Mode order (AGENT_MODE=auto): live when there is a Claude key, room in the spend caps
// and in the IP limit; otherwise a recorded live run for the same room and night; otherwise the scripted plan.
// A live run whose answer fails validation twice also ends in the scripted plan, with the reason in `fallbacks`.
// With `ask`, the live agent may stop to ask the booker which artist an ambiguous past headliner was (`question`);
// the page sends the answer back in `answers` and the plan runs again, the answer entering at resolve_entities.
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

/** Every saved live run in DATA_DIR/recorded. Unreadable files and files that are not runs are skipped. */
async function readRecorded(dataDir) {
  let names = [];
  try {
    names = (await readdir(recordedDir(dataDir))).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const runs = [];
  for (const n of names) {
    try {
      const run = JSON.parse(await readFile(path.join(recordedDir(dataDir), n), 'utf8'));
      if (typeof run?.venue_id === 'string' && typeof run?.date === 'string' && run?.result && run?.saved_at) runs.push(run);
    } catch {
      // not a recorded run
    }
  }
  return runs;
}

/** The most recent saved live run for each room and night, ordered by room id and date. */
export async function listRecorded(dataDir) {
  const latest = new Map();
  for (const run of await readRecorded(dataDir)) {
    const k = `${run.venue_id}\n${run.date}`;
    if (!latest.has(k) || run.saved_at > latest.get(k).saved_at) latest.set(k, run);
  }
  return [...latest.values()].sort((a, b) => (a.venue_id < b.venue_id ? -1 : a.venue_id > b.venue_id ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The most recent saved live run for this room and night, or null. Unreadable files are skipped. */
export async function findRecorded(dataDir, venueId, date) {
  return (await listRecorded(dataDir)).find((run) => run.venue_id === venueId && run.date === date) ?? null;
}

/**
 * Play a saved live run back: its steps, then its result. Neither Claude nor Qloo is called now, so the Qloo part is
 * labelled recorded too (synthetic test data stays labelled as such).
 */
export function replayRecorded(recorded, emit = () => {}, fallbacks = []) {
  // "Asked you" was said to whoever planned the night then, not to the person watching the replay.
  const steps = (recorded.result.steps ?? []).map((label) => label.replace(/^Asked you: /, 'Asked when this run was recorded: '));
  for (const label of steps) emit(label);
  return {
    ...recorded.result,
    steps,
    mode: { agent: 'recorded', qloo: recorded.result.mode?.qloo === 'fixture' ? 'fixture' : 'recorded', recorded_at: recorded.saved_at },
    fallbacks: [...(recorded.result.fallbacks ?? []), ...fallbacks],
  };
}

async function saveRecorded(dataDir, run) {
  await mkdir(recordedDir(dataDir), { recursive: true });
  const stamp = run.saved_at.replace(/[:.]/g, '-');
  await writeFile(path.join(recordedDir(dataDir), `${run.venue_id}__${run.date}__${stamp}.json`), `${JSON.stringify(run, null, 2)}\n`);
}

/**
 * @param {{ config: ReturnType<import('../config.js').loadConfig>, budget: ReturnType<import('../budget/budget.js').createBudget>,
 *   qloo: object, qlooMode: string, venues: object[], venue: object, date: string, ip?: string,
 *   emit?: (label: string) => void, anthropic?: () => { messages: { create: Function } }, now?: () => number,
 *   ask?: boolean, answers?: { name: string, entity_id: string | null }[] }} args
 *   `anthropic` is a factory, called only when the run is live. `ask`: the caller can show a question to the booker
 *   (only the page does; the live agent may ask once per night, so not when `answers` already holds one). A plan with
 *   answers is never replaced by a recorded run, which could not carry them.
 * @returns {Promise<object>} the result, or `{ question, mode, venue, night, steps, llm }` when the agent asked
 */
export async function runPlan({ config, budget, qloo, qlooMode, venues, venue, date, today, ip, emit = () => {}, anthropic, now = Date.now, ask = false, answers = [] }) {
  const recorded = answers.length ? null : await findRecorded(config.dataDir, venue.id, date);
  const base = effectiveAgentMode(config, { hasRecordedRuns: Boolean(recorded) });
  const decided = planMode(base, budget, { ip, hasRecordedRuns: Boolean(recorded) });
  const fallbacks = decided.fallback ? [decided.fallback] : [];

  if (decided.agent === 'recorded') return replayRecorded(recorded, emit, fallbacks);

  if (decided.agent === 'live') {
    const session = createSession({ qloo, venues, venue, date, today, answers, emit });
    const live = await runLive({ anthropic: anthropic(), model: config.anthropic.model, session, budget, canAsk: ask && !answers.length });
    const llm = { model: config.anthropic.model, turns: live.turns, usage: live.usage };
    if (live.question) {
      const label = `Asking you: which ${live.question.name}?`;
      session.steps.push(label);
      emit(label);
      const calendar = session.state.calendar;
      return { question: live.question, mode: { agent: 'live', qloo: qlooMode }, venue: calendar?.venue ?? null, night: { date, day: calendar?.night.day }, steps: [...session.steps], llm };
    }
    if (live.final) {
      const result = assembleResult(session, live.final, { agent: 'live', qloo: qlooMode }, { llm });
      await saveRecorded(config.dataDir, { saved_at: new Date(now()).toISOString(), venue_id: venue.id, date, model: config.anthropic.model, result });
      return result;
    }
    fallbacks.push({ step: 'agent', reason: live.error.code, detail: live.error.errors ?? live.error.message, used: 'scripted plan' });
  }

  const session = createSession({ qloo, venues, venue, date, today, answers, emit });
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
export async function runAblate({ qloo, venues, venue, date, today, remove }) {
  const session = createSession({ qloo, venues, venue, date, today });
  const ranked = await runTool(session, 'rank_pool');
  if (ranked.error) throw new PlanError(ranked.error.code, ranked.error.message);
  const out = await runTool(session, 'ablate', { remove });
  return { ...out, calls: session.calls.map(({ endpoint, params_masked, ms, cache }) => ({ endpoint, params_masked, ms, cache })) };
}
