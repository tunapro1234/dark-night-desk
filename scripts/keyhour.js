#!/usr/bin/env node
// Key hour: the runs that must happen right after the Qloo key arrives, in the order the registered protocols set.
// One command, resumable: DATA_DIR/keyhour/checkpoint.json records each finished step, and a rerun starts after the last one.
//
//   1 key_check   one small GET /v2/insights with a fresh in-memory cache, so the key itself is tested (never a cache hit)
//   2 keyday      the key-day probes of scripts/keyday.js (runKeyday) on Study 1 pool-only rooms (never a test room of
//                 either study). NO-GO stops here with exit 3. This step also fixes the pool restriction for both studies
//                 (BACKTEST.md "Fixed choices", BACKTEST-2.md "Rankers"): "filter" only if filter.results.entities answered
//                 and every returned entity was one of those requested, otherwise "take500".
//   3 study1      scripts/backtest.js --split test --restrict <r>: BACKTEST.md's single run (its lock lives in DATA_DIR)
//   4 study2      scripts/backtest2.js --restrict <r> (same r): BACKTEST-2.md's single run, only before 27 Oct 2026 (TSI),
//                 with the 10% second pass recorded (checked_by on every check-sample row) and the inputs committed
//   5 live_plans  only with a Claude key: a few live agent plans on the demo rooms; cost per plan from the spend ledger,
//                 compared with KARAR.md's estimate. Without a key this step is skipped and runs on a later rerun.
//   6 summary     DATA_DIR/keyhour/summary.json: counts and pass/fail only
//
// Ranker L (Claude only) runs inside the studies only if a Claude key is set when they start (BACKTEST.md). A study runs
// once, so without a Claude key the studies wait (exit 7) unless --studies-without-claude says to run them with L "not run".
//
// Nothing here writes Qloo names, ids or response content: Qloo responses stay in the DATA_DIR cache. Every request goes
// through a guard that allows only the Qloo host, the Anthropic API and loopback, counts Qloo requests, caps them, stops
// on the first HTTP 429 and adds a per-request timeout.
//
// Usage:
//   node scripts/keyhour.js --dry-run           no network: the plan of steps, input checks and call estimates
//   node scripts/keyhour.js [options]           run (or resume) the steps
// Options:
//   --data1 <dir> --data2 <dir> --out <dir>     Study 1 data (data/backtest), Study 2 data (data/backtest2), results (results)
//   --keyday-venues <a.json,b.json>             key-day rooms in the scripts/keyday.js format (default: Study 1 pool rooms)
//   --keyday-placebo <c.json>                   key-day placebo room (default: Study 1's placebo room with most S1 shows)
//   --restrict filter|take500                   set the pool restriction by hand, only when the key-day test left it open
//                                               (recorded as "manual"); a value that differs from the key-day decision is refused
//   --studies-without-claude                    run the studies with no Claude key (L is then reported as "not run")
//   --plans <n>                                 live plans in step 5 (default 2 per plannable room, at most 20; 0 skips
//                                               the step)
//   --plan-usd-cap <usd>                        Claude spend allowed in step 5 (default: the worst-case cost of the
//                                               plans asked for, at least 0.30)
//   --max-qloo-calls <n>                        Qloo requests allowed over all invocations of this DATA_DIR, counted in the
//                                               checkpoint (default 20000; the upper bounds of all steps add up to about 11000)
//   --step-cap-factor <x>                       each step may send x times its estimated upper bound (default 1.5)
//   --request-timeout-ms <ms>                   per Qloo request (default 20000)
//   --step-timeout-min <min>                    one timeout for every step (defaults: 2, 20, 60, 180, 30 minutes)
//   --redo key_check|keyday|live_plans          run a finished step again (the studies cannot be redone, and keyday cannot be
//                                               redone once Study 1 has run, because Study 1 used its pool restriction)
// Exit codes: 0 done (step 5 may be skipped for want of a Claude key), 1 usage/config/precondition, 2 no Qloo key or key
// rejected, 3 NO-GO, 4 a step stopped (error, timeout, interrupt), 5 rate limited (HTTP 429), 6 Qloo call cap reached,
// 7 waiting for a decision (Claude key or --restrict).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, REPO_ROOT, budgetOptions, effectiveQlooMode, loadConfig } from '../server/config.js';
import { cachePath, createQlooCache } from '../server/qloo/cache.js';
import { createQlooClient, entitiesOf, tagsOf } from '../server/qloo/client.js';
import { budgetPath, createBudget } from '../server/budget/budget.js';
import { createAnthropic } from '../server/agent/loop.js';
import { PlanError, findRecorded, runPlan } from '../server/agent/plan.js';
import { isPlannable, listedUntil, loadVenues } from '../server/calendar/venues.js';
import { addDays, nightsFor, todayISO } from '../server/calendar/nights.js';
import { S2, loadBacktestData, periodOf, weekOf } from '../server/backtest/data.js';
import { splitAtSeparator } from '../server/backtest/headliner.js';
import { RESTRICTIONS } from '../server/backtest/rankers.js';
import { checkSample, loadStudy2Data, parsePerformers, performerCandidate } from '../server/backtest/study2-data.js';
import { rowState } from '../server/backtest/study2.js';
import { ARTIST, backtestWindow } from '../server/rank/pool.js';
import { runKeyday } from './keyday.js';
import { LOCK_NAME, main as runStudy1Cli } from './backtest.js';
import { LOCK_NAME2, main2 as runStudy2Cli } from './backtest2.js';

export const STEPS = Object.freeze(['key_check', 'keyday', 'study1', 'study2', 'live_plans']);
export const EXIT = Object.freeze({ OK: 0, USAGE: 1, NO_KEY: 2, NO_GO: 3, STOPPED: 4, RATE_LIMITED: 5, CALL_CAP: 6, WAITING: 7 });
const DONE = new Set(['done', 'already_run', 'not_run_deadline', 'skipped_by_option']);
const REDO = new Set(['key_check', 'keyday', 'live_plans']);
const QLOO_HOST = 'hackathon.api.qloo.com';
const ANTHROPIC_HOST = 'api.anthropic.com';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
// BACKTEST-2.md "Run discipline": no complete run before 27 Oct (feature freeze) means "registered, not run".
export const STUDY2_LAST_START_DAY = '2026-10-26';
// KARAR.md "Istek basi Claude maliyeti" (estimate of 14 Oct, not a measurement): typical and worst plan, alert threshold.
export const KARAR_PLAN_USD = Object.freeze({ typical: 0.007, worst: 0.045, alert_above: 0.02 });
const STEP_TIMEOUT_MIN = { key_check: 2, keyday: 20, study1: 60, study2: 180, live_plans: 30 };
const MAX_PLANS = 20;
const PLANS_PER_ROOM = 2; // the page should open every plannable room on a recorded card; two nights each
const PLAN_CALLS = 250; // Qloo requests one live plan may send (tools, leave-one-out, also-loves), an upper bound
// Paths whose committed state the studies depend on (BACKTEST-2.md: the log records the commit and the data hashes).
const FROZEN_PATHS = [
  'BACKTEST.md', 'BACKTEST-2.md', 'package.json', 'package-lock.json', 'server', 'scripts/backtest.js', 'scripts/backtest2.js',
  'scripts/keyday.js', 'scripts/keyhour.js',
];
const STOP_EXIT = { rate_limited: EXIT.RATE_LIMITED, call_cap: EXIT.CALL_CAP, step_cap: EXIT.CALL_CAP, step_timeout: EXIT.STOPPED, interrupted: EXIT.STOPPED };

const round = (x, d = 6) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const tsiDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

// ---------------------------------------------------------------- options

export function parseKeyhourArgs(argv) {
  const out = {
    dryRun: false, data1: path.join(REPO_ROOT, 'data', 'backtest'), data2: path.join(REPO_ROOT, 'data', 'backtest2'), out: path.join(REPO_ROOT, 'results'),
    keydayVenues: null, keydayPlacebo: null, restrict: null, studiesWithoutClaude: false, plans: null, planUsdCap: null, maxQlooCalls: 20_000,
    stepCapFactor: 1.5, requestTimeoutMs: 20_000, stepTimeoutMin: null, redo: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    const num = (v, { integer = false, min, max }) => {
      const n = Number(v);
      if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) throw new Error(`${a} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}`);
      return n;
    };
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--data1') out.data1 = path.resolve(val());
    else if (a === '--data2') out.data2 = path.resolve(val());
    else if (a === '--out') out.out = path.resolve(val());
    else if (a === '--keyday-venues') out.keydayVenues = val().split(',').map((p) => path.resolve(p.trim())).filter(Boolean);
    else if (a === '--keyday-placebo') out.keydayPlacebo = path.resolve(val());
    else if (a === '--restrict') out.restrict = val();
    else if (a === '--studies-without-claude') out.studiesWithoutClaude = true;
    else if (a === '--plans') out.plans = num(val(), { integer: true, min: 0, max: MAX_PLANS });
    else if (a === '--plan-usd-cap') out.planUsdCap = num(val(), { min: 0.01, max: 2 });
    else if (a === '--max-qloo-calls') out.maxQlooCalls = num(val(), { integer: true, min: 1, max: 200_000 });
    else if (a === '--step-cap-factor') out.stepCapFactor = num(val(), { min: 1, max: 10 });
    else if (a === '--request-timeout-ms') out.requestTimeoutMs = num(val(), { integer: true, min: 1000, max: 120_000 });
    else if (a === '--step-timeout-min') out.stepTimeoutMin = num(val(), { min: 0.01, max: 600 });
    else if (a === '--redo') {
      const step = val();
      if (!REDO.has(step)) throw new Error(`--redo takes ${[...REDO].join(', ')}; a study runs once and cannot be redone`);
      out.redo.push(step);
    } else throw new Error(`unknown option ${a}`);
  }
  if (out.restrict !== null && !RESTRICTIONS.includes(out.restrict)) throw new Error(`--restrict must be one of ${RESTRICTIONS.join(', ')}`);
  return out;
}

// ---------------------------------------------------------------- request guard

class GuardStop extends Error {
  constructor(reason) {
    super(`keyhour guard: request not sent (${reason})`);
    this.code = reason;
  }
}

/**
 * Wraps fetch for the whole run. Qloo requests are counted, capped and timed out; the first HTTP 429 stops every later
 * Qloo request. Anthropic and loopback requests pass through; any other host is blocked. Entity names and ids seen in
 * responses are kept in memory only, so the summary and the checkpoint can be checked against them.
 * @param {{ fetchImpl: typeof fetch, maxCalls: number, requestTimeoutMs: number }} opts
 */
export function createFetchGuard({ fetchImpl, maxCalls, requestTimeoutMs }) {
  const state = {
    qloo_sent: 0, by_status: {}, network_errors: 0, not_sent: 0, anthropic_sent: 0, loopback_sent: 0, blocked_hosts: 0,
    stop: null, retry_after_s: null, filter: { responses: 0, requested: 0, returned: 0, outside: 0 },
  };
  const seen = { ids: new Set(), names: new Set() };
  let step = { name: null, cap: Infinity, sent: 0, filter: null };

  const remember = (data) => {
    for (const e of [...entitiesOf(data), ...tagsOf(data)]) {
      for (const v of [e?.entity_id, e?.tag_id, e?.id]) if (typeof v === 'string' && v.trim()) seen.ids.add(v.trim());
      if (typeof e?.name === 'string' && e.name.trim()) seen.names.add(e.name.trim());
    }
  };

  async function guarded(input, init = {}) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    if (url.hostname === QLOO_HOST) {
      const reason = state.stop ?? (state.qloo_sent >= maxCalls ? 'call_cap' : step.sent >= step.cap ? 'step_cap' : null);
      if (reason) {
        if (!state.stop) state.stop = reason;
        state.not_sent++;
        throw new GuardStop(reason);
      }
      state.qloo_sent++;
      step.sent++;
      const timeout = AbortSignal.timeout(requestTimeoutMs);
      const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      let res;
      try {
        res = await fetchImpl(input, { ...init, signal });
      } catch (err) {
        state.network_errors++;
        throw err;
      }
      state.by_status[res.status] = (state.by_status[res.status] ?? 0) + 1;
      if (res.status === 429) {
        state.stop = 'rate_limited';
        const ra = Number(res.headers?.get?.('retry-after'));
        state.retry_after_s = Number.isFinite(ra) ? ra : null;
      } else if (res.ok) {
        try {
          const data = await res.clone().json();
          remember(data);
          const asked = url.searchParams.get('filter.results.entities');
          if (url.pathname === '/v2/insights' && asked) {
            const requested = new Set(asked.split(',').map((s) => s.trim()).filter(Boolean));
            const returned = entitiesOf(data).map((e) => e?.entity_id).filter(Boolean);
            for (const f of [state.filter, step.filter].filter(Boolean)) {
              f.responses++;
              f.requested += requested.size;
              f.returned += returned.length;
              f.outside += returned.filter((id) => !requested.has(id)).length;
            }
          }
        } catch {
          // not JSON: the client reports it
        }
      }
      return res;
    }
    if (url.hostname === ANTHROPIC_HOST) {
      state.anthropic_sent++;
      return fetchImpl(input, init);
    }
    if (LOOPBACK.has(url.hostname)) {
      state.loopback_sent++;
      return fetchImpl(input, init);
    }
    state.blocked_hosts++;
    throw new GuardStop('blocked_host');
  }

  return {
    fetch: guarded,
    state,
    seen,
    /** Start a step: its own request cap and filter tally. A rate limit or interrupt is never cleared. */
    beginStep(name, cap) {
      if (state.stop === 'step_cap' || state.stop === 'step_timeout') state.stop = null;
      step = { name, cap, sent: 0, filter: { responses: 0, requested: 0, returned: 0, outside: 0 } };
      return step;
    },
    stop(reason) {
      if (!state.stop || reason === 'interrupted') state.stop = reason;
    },
    get step() {
      return step;
    },
  };
}

// ---------------------------------------------------------------- content check

// Values keyhour writes itself. A Qloo name can be a plain word ("GO"), so these never count as a leak.
const OWN_WORDS = new Set(['GO', 'NO-GO']);

/**
 * Throws if any string in obj is a Qloo id (or holds one), or is a Qloo name. Lower-case codes (statuses, reasons) and
 * keyhour's own words are not compared with names, so a band called "done" cannot block the summary.
 * @param {unknown} obj
 * @param {{ ids: Set<string>, names: Set<string> }} seen
 */
export function assertNoQlooContent(obj, seen) {
  const longIds = [...seen.ids].filter((s) => s.length >= 12);
  const isCode = (v) => /^[a-z0-9_.:-]*$/.test(v) || OWN_WORDS.has(v);
  const walk = (v, where) => {
    if (typeof v === 'string') {
      const t = v.trim();
      if (seen.ids.has(t) || longIds.some((id) => v.includes(id)) || (!isCode(t) && seen.names.has(t))) {
        throw new Error(`refused to write ${where}: it holds a Qloo name or id`);
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { walk(k, where); walk(x, `${where}.${k}`); }
  };
  walk(obj, 'output');
}

// ---------------------------------------------------------------- inputs

const liveRows1 = (data) => data.shows.filter((s) => s.canceled === '0');

/** Study 1 rooms for the key-day probes: pool rooms with at least 5 S1 and 1 S2 shows, most S1 shows first; never a test room. */
export function keydayRoomsFromStudy1(data, { forbidden = new Set() } = {}) {
  const count = {};
  for (const s of liveRows1(data)) {
    const p = periodOf(s.date);
    if (p) (count[s.venue_id] ??= { S1: 0, S2: 0 })[p]++;
  }
  const asVenue = (v) => ({
    id: v.venue_id, name: v.name, city: v.city,
    shows: liveRows1(data).filter((s) => s.venue_id === v.venue_id).map((s) => ({ date: s.date, headliner: splitAtSeparator(s.title) ?? s.title })),
  });
  const ranked = (role, need) => data.venues
    .filter((v) => v.role === role && !forbidden.has(v.venue_id) && (count[v.venue_id]?.S1 ?? 0) >= 5 && (count[v.venue_id]?.S2 ?? 0) >= need)
    .sort((a, b) => count[b.venue_id].S1 - count[a.venue_id].S1 || a.venue_id.localeCompare(b.venue_id));
  return { venues: ranked('pool', 1).slice(0, 2).map(asVenue), placebo: ranked('placebo', 0).slice(0, 1).map(asVenue)[0] };
}

/** Upper bounds on Qloo requests for Study 1, from the data alone (no call). */
export function estimateStudy1(data) {
  const tests = data.venues.filter((v) => v.role === 'test');
  const placebos = new Set(data.venues.filter((v) => v.role === 'placebo').map((v) => v.venue_id));
  const archive = new Set(data.venues.filter((v) => v.role === 'test' || v.role === 'pool').map((v) => v.venue_id));
  const live = liveRows1(data);
  const titles = new Set(live.filter((s) => archive.has(s.venue_id) || (periodOf(s.date) === 'S1' && placebos.has(s.venue_id))).map((s) => s.title));
  const searchesMax = titles.size + [...titles].filter((t) => splitAtSeparator(t)).length;
  const roomWindows = tests.reduce((t, v) => t + new Set(live.filter((s) => s.venue_id === v.venue_id && periodOf(s.date) === 'S2').map((s) => weekOf(s.date))).size, 0);
  const rankingsMax = roomWindows * (3 + placebos.size) + tests.length * 2;
  return { titles: titles.size, searches_min: titles.size, searches_max: searchesMax, room_windows: roomWindows, rankings_max: rankingsMax, total_max: searchesMax + rankingsMax };
}

/** Upper bounds on Qloo requests for Study 2 (main reading, then the literal reading, whose searches are cache hits). */
export function estimateStudy2(data) {
  const byId = new Map(data.venues.map((v) => [v.venue_id, v]));
  const first = backtestWindow(S2.from).from;
  const tests = data.venues.filter((v) => v.role === 'test');
  const needed = data.shows.filter((s) => rowState(s) === 'live' && periodOf(s.date) && (byId.get(s.venue_id)?.role === 'test' || s.date >= first));
  const firstQueries = new Set();
  const queries = new Set();
  for (const s of needed) {
    let cand = null;
    try {
      cand = performerCandidate(parsePerformers(s.performers), byId.get(s.venue_id));
    } catch {
      cand = null;
    }
    firstQueries.add(cand ?? s.title);
    for (const q of [cand, s.title, splitAtSeparator(s.title)]) if (q) queries.add(q);
  }
  const roomWindows = tests.reduce((t, v) => t + new Set(data.shows.filter((s) => s.venue_id === v.venue_id && rowState(s) === 'live' && periodOf(s.date) === 'S2').map((s) => weekOf(s.date))).size, 0);
  const rankingsMax = roomWindows * 4 + tests.length * 2;
  return {
    rows: needed.length, searches_min: firstQueries.size, searches_max: queries.size, room_windows: roomWindows,
    rankings_max: rankingsMax, literal_rankings_max: rankingsMax, total_max: queries.size + 2 * rankingsMax,
  };
}

/** Is the 10% second pass (seed 3) recorded? The check-sample file must match shows.csv and every sampled row needs checked_by. */
export function checkSampleState(data2, file) {
  if (!existsSync(file)) return { ok: false, reason: `${path.basename(file)} is missing (run scripts/backtest2.js --check-sample)` };
  let sample;
  try {
    sample = readJson(file);
  } catch {
    return { ok: false, reason: `${path.basename(file)} is not JSON` };
  }
  const rows = data2.shows.map((s) => s.row);
  const expected = checkSample(rows);
  const lines = Array.isArray(sample.shows_csv_lines) ? sample.shows_csv_lines : [];
  if (sample.of_rows !== rows.length || lines.length !== expected.length || lines.some((x, i) => x !== expected[i])) {
    return { ok: false, rows: lines.length, reason: 'the check sample does not match shows.csv as it is now (data changed after the sample was drawn)' };
  }
  const byLine = new Map(data2.shows.map((s) => [s.row, s]));
  const checked = expected.filter((n) => String(byLine.get(n)?.checked_by ?? '').trim() !== '').length;
  return checked === expected.length
    ? { ok: true, rows: expected.length, checked }
    : { ok: false, rows: expected.length, checked, reason: `the 10% second pass is not recorded: checked_by is filled on ${checked} of ${expected.length} check-sample rows of shows.csv` };
}

function defaultGit(paths) {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', ...paths], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { ok: true, changed: out.split('\n').filter(Boolean).length };
  } catch {
    return { ok: false, changed: null };
  }
}

async function loadInputs(args, config, deps) {
  const inputs = { problems: {} };
  const problem = (step, text) => (inputs.problems[step] ??= []).push(text);

  try {
    inputs.data1 = await loadBacktestData(args.data1);
    inputs.estimate1 = estimateStudy1(inputs.data1);
  } catch (err) {
    problem('study1', `Study 1 data: ${err.message}`);
  }
  const sources1 = path.join(args.data1, 'sources.md');
  inputs.secondPass1 = existsSync(sources1) && /random 10% of .+ were checked/i.test(readFileSync(sources1, 'utf8'));
  if (!inputs.secondPass1) problem('study1', `${sources1} does not record the 10% second pass (BACKTEST.md "Data handling")`);

  try {
    inputs.data2 = await loadStudy2Data(args.data2);
    inputs.estimate2 = estimateStudy2(inputs.data2);
    if (!inputs.data2.lnAeg) problem('study2', 'ln-aeg.csv is missing (Amendment 14)');
    inputs.sample2 = checkSampleState(inputs.data2, path.join(args.out, 'backtest2-check-sample.json'));
    if (!inputs.sample2.ok) problem('study2', inputs.sample2.reason);
  } catch (err) {
    problem('study2', `Study 2 data: ${err.message}`);
  }

  // Key-day rooms: never a test room of either study.
  const forbidden = new Set([
    ...(inputs.data1?.venues ?? []).filter((v) => v.role === 'test').map((v) => v.venue_id),
    ...(inputs.data2?.venues ?? []).filter((v) => v.role === 'test').map((v) => v.venue_id),
  ]);
  try {
    if (args.keydayVenues) {
      const venues = args.keydayVenues.map(readJson);
      const placebo = args.keydayPlacebo ? readJson(args.keydayPlacebo) : undefined;
      const bad = [...venues, placebo].filter(Boolean).filter((v) => forbidden.has(v.id)).map((v) => v.id);
      if (bad.length) throw new Error(`test rooms cannot be key-day rooms: ${bad.join(', ')}`);
      inputs.keyday = { source: 'files', venues, placebo };
    } else if (inputs.data1) {
      const k = keydayRoomsFromStudy1(inputs.data1, { forbidden });
      if (args.keydayPlacebo) k.placebo = readJson(args.keydayPlacebo);
      inputs.keyday = { source: 'study1 pool rooms', ...k };
    }
    if (inputs.keyday && !inputs.keyday.venues.length) throw new Error('no room has the 5 S1 and 1 S2 shows the probes need');
  } catch (err) {
    problem('keyday', `key-day rooms: ${err.message}`);
    inputs.keyday = null;
  }
  if (!inputs.keyday && !inputs.problems.keyday) problem('keyday', 'key-day rooms: Study 1 data is needed to pick them');

  try {
    inputs.venues = await loadVenues(config.venuesDir);
    inputs.rooms = inputs.venues.filter(isPlannable).sort((a, b) => a.id.localeCompare(b.id));
    if (!inputs.rooms.length) problem('live_plans', `no plannable room in ${config.venuesDir}`);
  } catch (err) {
    problem('live_plans', `venues: ${err.message}`);
  }
  args.plans ??= Math.min(MAX_PLANS, PLANS_PER_ROOM * (inputs.rooms?.length ?? 0));
  args.planUsdCap ??= Math.max(0.3, Math.ceil(args.plans * KARAR_PLAN_USD.worst * 100 - 1e-9) / 100);

  const rel = (p) => path.relative(REPO_ROOT, p);
  const paths = [...FROZEN_PATHS, rel(args.data1), rel(args.data2), rel(path.join(args.out, 'backtest2-check-sample.json'))].filter((p) => p && !p.startsWith('..'));
  inputs.git = deps.git(paths);
  if (!inputs.git.ok) problem('studies', 'git status failed; the committed state of the inputs cannot be checked');
  else if (inputs.git.changed > 0) problem('studies', `${inputs.git.changed} protocol, code or data path(s) have uncommitted changes (git status); commit them before a study runs`);
  return inputs;
}

// ---------------------------------------------------------------- checkpoint and summary

function loadCheckpoint(file) {
  if (!existsSync(file)) return { version: 1, created_at: null, steps: {}, history: [] };
  const ck = readJson(file); // a corrupt checkpoint stops the run (caught by the caller), it is never silently replaced
  if (ck?.version !== 1 || typeof ck.steps !== 'object') throw new Error(`${file} is not a keyhour checkpoint`);
  ck.history ??= [];
  return ck;
}

function writeChecked(file, obj, seen) {
  assertNoQlooContent(obj, seen);
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.part`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`);
  renameSync(tmp, file);
}

function buildSummary(ck, guard, { now, qlooMode, claude }) {
  const s = ck.steps;
  const pick = (o, keys) => (o ? Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) : null);
  return {
    kind: 'keyhour-summary',
    note: 'Counts and pass/fail only. Qloo responses stay in the DATA_DIR cache; no name, id or response content is here.',
    generated_at: new Date(now()).toISOString(),
    qloo_mode: qlooMode,
    claude_key: claude,
    steps: {
      key_check: pick(s.key_check, ['status', 'result', 'ms', 'error_code']),
      keyday: pick(s.keyday, ['status', 'decision', 'go', 'probes_ok', 'probes_sent', 'name_lookups', 'error_probes', 'restrict', 'restrict_basis', 'filter_check', 'rooms_source', 'rooms', 'placebo']),
      study1: pick(s.study1, ['status', 'exit_code', 'reason', 'restrict', 'label', 'result_status', 'claim_used', 'rooms', 'shows', 'l_status', 'qloo_calls', 'qloo_cache_hits', 'stopped_log']),
      study2: pick(s.study2, ['status', 'exit_code', 'reason', 'restrict', 'label', 'result_status', 'claim_used', 'clusters', 'rooms', 'shows', 'l_status', 'literal_status', 'qloo_calls', 'qloo_cache_hits', 'stopped_log']),
      live_plans: pick(s.live_plans, ['status', 'reason', 'plans_wanted', 'plans_attempted', 'live', 'fallback', 'fallback_reasons', 'errors', 'usd_total', 'usd_per_live_plan', 'usd_max', 'turns_mean', 'karar_estimate_usd', 'above_karar_alert', 'within_karar_worst']),
    },
    qloo_this_invocation: {
      sent: guard.state.qloo_sent, by_status: guard.state.by_status, network_errors: guard.state.network_errors,
      not_sent_after_stop: guard.state.not_sent, stop: guard.state.stop, retry_after_s: guard.state.retry_after_s,
    },
    qloo_sent_all_invocations: ck.qloo_sent_total ?? 0,
    pass: {
      key: s.key_check?.status === 'done',
      go: s.keyday?.decision === 'GO',
      study1_done: DONE.has(s.study1?.status ?? '') && s.study1?.status !== 'skipped_by_option',
      study2_done: s.study2?.status === 'done' || s.study2?.status === 'already_run',
      study2_literal_stopped: s.study2?.literal_status === undefined ? null : s.study2.literal_status === 'stopped',
      live_cost_within_karar_worst: s.live_plans?.within_karar_worst ?? null,
    },
    history: ck.history,
  };
}

// ---------------------------------------------------------------- steps

function stoppedBy(guard, fallback = EXIT.STOPPED) {
  const r = guard.state.stop;
  return { code: r ? STOP_EXIT[r] ?? fallback : fallback, reason: r ?? 'error' };
}

/** Failed Qloo requests so far: network errors and timeouts, HTTP 5xx, and HTTP 401/403 (the key). */
function failureCounts(guard) {
  const b = guard.state.by_status;
  let server = 0;
  for (const [status, n] of Object.entries(b)) if (Number(status) >= 500) server += n;
  return { net: guard.state.network_errors, server, auth: (b[401] ?? 0) + (b[403] ?? 0) };
}
const failuresSince = (guard, before) => {
  const now = failureCounts(guard);
  return { net: now.net - before.net, server: now.server - before.server, auth: now.auth - before.auth };
};
// Client error codes that say nothing about the API feature: the request may answer on a rerun.
const PASSING_CODE = /^(network|http_5\d\d|http_401|http_403|http_408)$/;

async function stepKeyCheck(ctx) {
  const { config, guard, args } = ctx;
  guard.beginStep('key_check', 3);
  const client = createQlooClient({ apiKey: config.qloo.apiKey, baseUrl: config.qloo.baseUrl, mode: config.qloo.mode, cache: createQlooCache(), fetchImpl: guard.fetch, retries: 0, timeoutMs: args.requestTimeoutMs });
  const r = await client.insights({ 'filter.type': ARTIST, 'filter.popularity.min': 0.9, take: 1 });
  if (r.status === 'ok' || r.status === 'empty') {
    return { status: 'done', result: r.status === 'ok' ? 'answered with a result' : 'answered, empty', ms: r.call?.ms ?? null, message: `key accepted (HTTP 200, ${r.call?.ms ?? '?'} ms)` };
  }
  const code = r.error?.code ?? 'error';
  if (code === 'http_401' || code === 'http_403') return { status: 'rejected', error_code: code, code: EXIT.NO_KEY, message: `Qloo rejected the key (${code}). Check the key; nothing else ran.` };
  if (code === 'http_429') return { status: 'stopped', error_code: code, code: EXIT.RATE_LIMITED, message: 'Qloo answered 429 to the first call. Wait, then rerun.' };
  return { status: 'stopped', error_code: code, code: EXIT.STOPPED, message: `the key check failed (${code}); nothing else ran` };
}

export function decideRestrict(keyday, filterCheck) {
  const p11 = keyday.calls.find((c) => c.n === 11);
  if (!p11 || p11.status === 'skipped') return { restrict: null, basis: 'probe 11 did not run (no pool); set --restrict' };
  if (p11.ok && p11.count > 0) {
    if (!filterCheck.responses) return { restrict: null, basis: 'probe 11 was a cache hit, so the returned ids were not checked; set --restrict' };
    if (filterCheck.outside === 0) return { restrict: 'filter', basis: 'filter.results.entities answered and every returned entity was one of those requested' };
    return { restrict: 'take500', basis: 'filter.results.entities returned entities outside the requested pool' };
  }
  // A network error, timeout, 5xx or key error says nothing about whether the feature works: never fix take500 on it.
  if (!p11.ok && PASSING_CODE.test(p11.error_code ?? '')) return { restrict: null, passing: true, basis: `probe 11 failed with a passing error (${p11.error_code}); rerun` };
  return { restrict: 'take500', basis: p11.ok ? 'filter.results.entities answered with no entity' : `probe 11 failed (${p11.error_code ?? p11.status})` };
}

async function stepKeyday(ctx) {
  const { config, guard, args, inputs, cap } = ctx;
  if (!inputs.keyday) return { status: 'refused', code: EXIT.USAGE, message: inputs.problems.keyday?.join('; ') ?? 'no key-day rooms' };
  const step = guard.beginStep('keyday', cap);
  // Probe 11 may be a cache hit on a rerun: keep the tally of the responses an earlier, stopped or redone, run saw.
  for (const k of Object.keys(step.filter)) step.filter[k] += ctx.prev?.filter_check?.[k] ?? 0;
  const cache = createQlooCache({ dbPath: cachePath(config.dataDir) });
  const client = createQlooClient({ apiKey: config.qloo.apiKey, baseUrl: config.qloo.baseUrl, mode: config.qloo.mode, cache, fetchImpl: guard.fetch, timeoutMs: args.requestTimeoutMs });
  const before = failureCounts(guard);
  let summary;
  try {
    summary = await runKeyday({ client, venues: inputs.keyday.venues, placebo: inputs.keyday.placebo });
  } finally {
    cache.close();
  }
  if (guard.state.stop) {
    const s = stoppedBy(guard);
    return { status: 'stopped', reason: s.reason, filter_check: { ...step.filter }, code: s.code, message: `key-day probes stopped (${s.reason}); keyday-summary.json not written. Rerun to resume.` };
  }
  const failed = failuresSince(guard, before);
  if (failed.auth > 0) {
    return { status: 'stopped', reason: 'key_rejected', filter_check: { ...step.filter }, code: EXIT.NO_KEY, message: `Qloo answered 401/403 to ${failed.auth} key-day request(s): the key was refused. No GO/NO-GO is recorded; fix the key and rerun.` };
  }
  const auto = decideRestrict(summary, step.filter);
  if ((failed.net + failed.server > 0 && summary.go.decision !== 'GO') || auto.passing) {
    // A NO-GO or a take500 that comes from network errors, timeouts or 5xx is not a finding about the API. Failed requests are
    // not cached, so a rerun sends only those again.
    return {
      status: 'stopped', reason: 'passing_errors', filter_check: { ...step.filter }, code: EXIT.STOPPED,
      message: `${failed.net} network error(s) or timeout(s) and ${failed.server} HTTP 5xx answer(s) during the key-day probes${auto.passing ? `, including probe 11 (${auto.basis})` : ''}; no decision is recorded. Rerun to resume from the cache.`,
    };
  }
  writeFileSync(path.join(config.dataDir, 'keyday-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const sent = summary.calls.filter((c) => c.sent).length;
  const errorProbes = summary.calls.filter((c) => c.status === 'error' && c.n !== 24).length;
  // BACKTEST.md "Fixed choices": the API feature decides. A hand-set value is used only when the probes left it open.
  const decided = auto.restrict || !args.restrict ? auto : { restrict: args.restrict, basis: `manual (--restrict); ${auto.basis}` };
  const fields = {
    decision: summary.go.decision,
    go: { base_insights: summary.go.base_insights, closed_pool: summary.go.closed_pool, evidence: summary.go.evidence },
    probes_ok: summary.calls.filter((c) => c.ok).length, probes_sent: sent, name_lookups: summary.setup.search_calls, error_probes: errorProbes,
    restrict: decided.restrict, restrict_basis: decided.basis, filter_check: { ...step.filter },
    rooms_source: inputs.keyday.source, rooms: inputs.keyday.venues.length, placebo: Boolean(inputs.keyday.placebo),
  };
  if (summary.go.decision !== 'GO') {
    return {
      status: 'no_go', ...fields, code: EXIT.NO_GO,
      message: `NO-GO (base insights ${fields.go.base_insights}, closed pool ${fields.go.closed_pool}, evidence ${fields.go.evidence}; ${errorProbes} probes ended in an error). ` +
        'KARAR.md: switch to Anchor-lite and send lh-hack an urgent report. The studies did not run. If the cause was a passing error, rerun with --redo keyday.',
    };
  }
  return { status: 'done', ...fields, message: `GO: ${fields.probes_ok}/30 probes ok, ${sent} sent, ${fields.name_lookups} name lookups; pool restriction ${decided.restrict ?? 'not decided'} (${decided.basis})` };
}

function studyGates(ctx, which) {
  const { ck, inputs, args, claude, deps } = ctx;
  const kd = ck.steps.keyday;
  // Study 1: the key-day decision. Study 2: the restriction Study 1 ran with. --restrict only fills a decision left open.
  const fixed = which === 'study2' ? ck.steps.study1?.restrict ?? kd?.restrict ?? null : kd?.restrict ?? null;
  if (fixed && args.restrict && args.restrict !== fixed) {
    return {
      status: 'refused', code: EXIT.USAGE,
      message: which === 'study2'
        ? `Study 2 uses the restriction Study 1 ran with (${fixed}); --restrict ${args.restrict} is refused`
        : `the key-day test fixed the pool restriction (${fixed}: ${kd?.restrict_basis ?? ''}); --restrict ${args.restrict} is refused (BACKTEST.md "Fixed choices")`,
    };
  }
  const restrict = fixed ?? args.restrict ?? ck.steps.study1?.restrict ?? null;
  if (!restrict) return { status: 'waiting', code: EXIT.WAITING, message: `the pool restriction is not decided (${kd?.restrict_basis ?? 'no key-day result'}). Rerun with --restrict filter or --restrict take500.` };
  if (!claude && !args.studiesWithoutClaude) {
    return { status: 'waiting', code: EXIT.WAITING, message: 'no Claude key: ranker L would be reported as "not run" for good, because each study runs once. Set the Claude key and rerun, or rerun with --studies-without-claude.' };
  }
  const problems = [...(inputs.problems[which] ?? []), ...(inputs.problems.studies ?? [])];
  if (which === 'study2') {
    // backtest2.js writes "dirty" for the whole repository into the log that is committed, and Study 1 has just written its
    // result into results/. Study 2 starts only from a clean tree, so that log says dirty: false.
    const all = deps.git([]);
    if (!all.ok) problems.push('git status failed; the clean state of the repository cannot be checked');
    else if (all.changed > 0) {
      problems.push(`the repository has ${all.changed} uncommitted or untracked path(s) (git status). backtest2.js logs "dirty" for the whole repository, ` +
        'so commit first: Study 1\'s result (results/backtest-test.json, and git add -f results/backtest-test.log) and every other change');
    }
  }
  if (problems.length) return { status: 'refused', code: EXIT.USAGE, message: problems.join('; ') };
  return { restrict };
}

/** Fields of a study's result file that are safe to report: labels, statuses and counts. */
function studyResult(file) {
  const r = readJson(file);
  return {
    label: typeof r.label === 'string' ? r.label : null, result_status: r.status ?? null, claim_used: r.claim?.used ?? null,
    clusters: Number.isFinite(r.clusters) ? r.clusters : undefined, rooms: Number.isFinite(r.rooms) ? r.rooms : null, shows: Number.isFinite(r.shows) ? r.shows : null,
    l_status: r.rankers?.L?.status ?? null, literal_status: r.literal_reading?.status, qloo_calls: r.qloo?.calls ?? null, qloo_cache_hits: r.qloo?.cache_hits ?? null,
  };
}

async function runStudy(ctx, which) {
  const { config, guard, args, env, deps, cap } = ctx;
  const one = which === 'study1';
  const resultFile = path.join(args.out, one ? 'backtest-test.json' : 'backtest2-test.json');
  const logFile = path.join(args.out, one ? 'backtest-test.log' : 'backtest2-test.log');
  const lock = path.join(config.dataDir, one ? LOCK_NAME : LOCK_NAME2);
  if (existsSync(resultFile)) {
    if (!existsSync(lock)) return { status: 'refused', code: EXIT.USAGE, message: `${resultFile} exists but ${lock} does not: is DATA_DIR the one the study ran with?` };
    // The lock records the restriction the run used; Study 2 must use the same one.
    let ran = null;
    try {
      ran = readJson(lock).restrict;
    } catch {
      ran = null;
    }
    const r = studyResult(resultFile);
    return { status: 'already_run', ...(RESTRICTIONS.includes(ran) ? { restrict: ran } : {}), ...r, message: `${which} already ran; its result stays as it is` };
  }
  if (existsSync(lock)) {
    return { status: 'refused', code: EXIT.USAGE, message: `${lock} exists but ${resultFile} does not: a run started and did not finish. Read ${logFile}; restarting it is a decision for a person (RUNBOOK-KEY.md).` };
  }
  if (!one && tsiDay(deps.now()) > STUDY2_LAST_START_DAY) {
    return { status: 'not_run_deadline', reason: 'the key arrived too late for a complete run before 27 Oct', message: 'Study 2 is reported as "registered, not run" (BACKTEST-2.md "Run discipline")' };
  }
  const gate = studyGates(ctx, which);
  if (!gate.restrict) return gate;

  guard.beginStep(which, cap);
  const before = failureCounts(guard);
  const print = (line) => deps.print(String(line).replace(/^(backtest2?: stopped \([^)]*\)).*$/s, '$1. Details stay out of the console.'));
  const argv = one ? ['--split', 'test', '--restrict', gate.restrict, '--data', args.data1, '--out', args.out] : ['--restrict', gate.restrict, '--data', args.data2, '--out', args.out];
  const exit = await (one ? deps.study1 : deps.study2)(argv, env, print);
  if (exit === 0 && existsSync(resultFile)) {
    const r = studyResult(resultFile);
    // The literal reading (BACKTEST-2.md Amendment 14) runs after the main result in the same run and cannot be run again.
    const lost = !one && r.literal_status === 'stopped'
      ? ' WARNING: the literal reading (Amendment 14) stopped part-way and cannot be rerun (the lock stays); report it as stopped and tell lh-hack.'
      : '';
    return { status: 'done', restrict: gate.restrict, ...r, message: `${which} done.${lost}` };
  }
  if (exit === 3) {
    // The script removed its lock (no metric had been computed). Keep a copy of its log before a rerun writes over it.
    let stoppedLog = null;
    if (existsSync(logFile)) {
      const dir = path.join(config.dataDir, 'keyhour', 'stopped');
      mkdirSync(dir, { recursive: true });
      stoppedLog = path.join(dir, `${path.basename(logFile, '.log')}-${new Date(deps.now()).toISOString().replace(/[:.]/g, '-')}.log`);
      copyFileSync(logFile, stoppedLog);
    }
    const s = stoppedBy(guard);
    const auth = !guard.state.stop && failuresSince(guard, before).auth > 0;
    const reason = auth ? 'key_rejected' : s.reason;
    return { status: 'stopped', exit_code: exit, reason, restrict: gate.restrict, stopped_log: stoppedLog ? path.basename(stoppedLog) : null, code: auth ? EXIT.NO_KEY : s.code, message: `${which} stopped (${reason}) before any metric; its lock was removed and a rerun resumes from the cache` };
  }
  return { status: 'refused', exit_code: exit, code: EXIT.USAGE, message: `${which}: the run script refused (exit ${exit}); see the lines above` };
}

async function stepLivePlans(ctx) {
  const { config, guard, args, inputs, deps, claude } = ctx;
  if (!claude) return { status: 'skipped_no_claude_key', reason: 'no Claude key', message: 'no Claude key: live plans skipped. Rerun when the key is set; only this step will run.' };
  if (args.plans === 0) return { status: 'skipped_by_option', reason: '--plans 0', message: 'live plans skipped (--plans 0)' };
  if (!inputs.rooms?.length) return { status: 'refused', code: EXIT.USAGE, message: inputs.problems.live_plans?.join('; ') ?? 'no plannable room' };

  guard.beginStep('live_plans', PLAN_CALLS * args.plans);
  const now = deps.now;
  const today = todayISO(now());
  const budget = createBudget({ dbPath: budgetPath(config.dataDir), ...budgetOptions(config), now });
  const cache = createQlooCache({ dbPath: cachePath(config.dataDir), now });
  const qloo = createQlooClient({ apiKey: config.qloo.apiKey, baseUrl: config.qloo.baseUrl, mode: config.qloo.mode, cache, fetchImpl: guard.fetch, timeoutMs: args.requestTimeoutMs });
  const anthropic = deps.anthropic ?? (() => createAnthropic(config.anthropic.apiKey));
  const planConfig = { ...config, agentMode: 'live' };
  const stats = { plans_wanted: args.plans, plans_attempted: 0, live: 0, fallback: 0, fallback_reasons: {}, errors: {}, usd_live: [], turns: [] };
  let stop = null;
  try {
    // One dark night per room in turn (first from tomorrow on), skipping nights that already have a recorded run.
    const nightsBy = new Map();
    for (const venue of inputs.rooms) {
      const dark = nightsFor(venue, addDays(today, 1), 60, { today, listedUntil: listedUntil(venue) }).nights.filter((n) => n.status === 'dark').map((n) => n.date);
      const fresh = [];
      for (const d of dark) if (!(await findRecorded(config.dataDir, venue.id, d))) fresh.push(d);
      nightsBy.set(venue.id, fresh);
    }
    const picks = [];
    for (let k = 0; picks.length < args.plans && k < 60; k++) {
      for (const venue of inputs.rooms) if (picks.length < args.plans && nightsBy.get(venue.id)[k]) picks.push({ venue, date: nightsBy.get(venue.id)[k] });
    }
    for (const { venue, date } of picks) {
      const before = budget.snapshot().total_usd;
      const spentHere = round(stats.usd_live.reduce((t, x) => t + x, 0) + (stats.fallback_usd ?? 0));
      if (guard.state.stop) { stop = guard.state.stop; break; }
      const can = budget.canSpend();
      if (!can.ok) { stop = can.reason; break; }
      if (spentHere + KARAR_PLAN_USD.worst > args.planUsdCap) { stop = 'plan_usd_cap'; break; }
      stats.plans_attempted++;
      try {
        const result = await runPlan({ config: planConfig, budget, qloo, qlooMode: effectiveQlooMode(config), venues: inputs.venues, venue, date, today, anthropic, now });
        const usd = round(budget.snapshot().total_usd - before);
        if (result.mode?.agent === 'live') {
          stats.live++;
          stats.usd_live.push(usd);
          if (Number.isFinite(result.llm?.turns)) stats.turns.push(result.llm.turns);
        } else {
          stats.fallback++;
          stats.fallback_usd = round((stats.fallback_usd ?? 0) + usd);
          for (const f of result.fallbacks ?? []) {
            const code = /^[a-z0-9_]{1,40}$/.test(String(f.reason)) ? f.reason : 'other';
            stats.fallback_reasons[code] = (stats.fallback_reasons[code] ?? 0) + 1;
          }
        }
      } catch (err) {
        const code = err instanceof PlanError && /^[a-z0-9_]{1,40}$/.test(err.code) ? err.code : 'plan_failed';
        stats.errors[code] = (stats.errors[code] ?? 0) + 1;
        stats.fallback_usd = round((stats.fallback_usd ?? 0) + (budget.snapshot().total_usd - before));
      }
    }
    if (!stop && guard.state.stop) stop = guard.state.stop;
  } finally {
    cache.close();
    budget.close();
  }
  const total = round(stats.usd_live.reduce((t, x) => t + x, 0) + (stats.fallback_usd ?? 0));
  const mean = stats.usd_live.length ? round(stats.usd_live.reduce((t, x) => t + x, 0) / stats.usd_live.length) : null;
  const fields = {
    plans_wanted: stats.plans_wanted, plans_attempted: stats.plans_attempted, live: stats.live, fallback: stats.fallback, fallback_reasons: stats.fallback_reasons,
    errors: stats.errors, usd_total: total, usd_per_live_plan: mean, usd_max: stats.usd_live.length ? Math.max(...stats.usd_live) : null,
    turns_mean: stats.turns.length ? round(stats.turns.reduce((t, x) => t + x, 0) / stats.turns.length, 2) : null,
    karar_estimate_usd: { ...KARAR_PLAN_USD }, above_karar_alert: mean === null ? null : mean > KARAR_PLAN_USD.alert_above,
    within_karar_worst: stats.usd_live.length ? Math.max(...stats.usd_live) <= KARAR_PLAN_USD.worst : null,
  };
  if (stop && STOP_EXIT[stop]) return { status: 'stopped', reason: stop, ...fields, code: STOP_EXIT[stop], message: `live plans stopped (${stop}) after ${stats.plans_attempted} plans` };
  const note = fields.above_karar_alert ? ` Mean is above ${KARAR_PLAN_USD.alert_above} USD: write to lh-hack (KARAR.md).` : '';
  return {
    status: 'done', reason: stop ?? undefined, ...fields,
    message: `live plans: ${stats.live} live of ${stats.plans_attempted}, ${total} USD in all, ${mean ?? '-'} USD per live plan (KARAR estimate ${KARAR_PLAN_USD.typical}, worst ${KARAR_PLAN_USD.worst})${stop ? `; stopped early (${stop})` : ''}.${note}`,
  };
}

// ---------------------------------------------------------------- dry run

function dryRunReport(ctx) {
  const { config, inputs, ck, args, claude, deps } = ctx;
  const lines = ['dry run: no network, no Qloo or Claude call.'];
  const state = (s) => ck.steps[s]?.status ?? 'pending';
  const blocked = [];
  const est1 = inputs.estimate1;
  const est2 = inputs.estimate2;
  const kd = inputs.keyday;
  const kdLookups = kd ? new Set([...kd.venues, kd.placebo].filter(Boolean).flatMap((v) => (v.shows ?? []).map((s) => s.headliner))).size : null;
  lines.push(`DATA_DIR ${config.dataDir}; results ${args.out}; checkpoint: ${Object.keys(ck.steps).length} step(s) recorded`);
  lines.push(`Qloo key: ${config.qloo.apiKey ? 'set' : 'not set'} (mode ${config.qloo.mode}); Claude key: ${claude ? 'set' : 'not set'}${!claude && !args.studiesWithoutClaude ? ' -> the studies wait (exit 7) unless --studies-without-claude' : ''}`);
  lines.push(`1 key_check   ${state('key_check')}: 1 request`);
  lines.push(`2 keyday      ${state('keyday')}: 30 probes (about 25 sent) + up to ${kdLookups ?? '?'} name lookups; rooms ${kd ? kd.venues.map((v) => v.id).join(', ') : '-'} (${kd?.source ?? '-'}), placebo ${kd?.placebo?.id ?? 'none'}`);
  if (est1) lines.push(`3 study1      ${state('study1')}: searches ${est1.searches_min}-${est1.searches_max}, rankings <= ${est1.rankings_max} (${est1.room_windows} room-weeks), total <= ${est1.total_max}`);
  else lines.push(`3 study1      ${state('study1')}: data not loaded`);
  if (est2) lines.push(`4 study2      ${state('study2')}: ${est2.rows} rows, searches ${est2.searches_min}-${est2.searches_max}, rankings <= ${est2.rankings_max} + literal reading <= ${est2.literal_rankings_max}, total <= ${est2.total_max}; check sample ${inputs.sample2?.ok ? 'recorded' : 'NOT recorded'} (${inputs.sample2?.checked ?? 0}/${inputs.sample2?.rows ?? '?'}); last start day ${STUDY2_LAST_START_DAY} TSI, today ${tsiDay(deps.now())}`);
  else lines.push(`4 study2      ${state('study2')}: data not loaded`);
  lines.push(`5 live_plans  ${state('live_plans')}: ${claude ? `${args.plans} plan(s), cap ${args.planUsdCap} USD, up to ${PLAN_CALLS * args.plans} Qloo requests` : `skipped without a Claude key (with one: ${args.plans} plan(s), cap ${args.planUsdCap} USD)`}; rooms ${(inputs.rooms ?? []).map((v) => v.id).join(', ') || '-'}`);
  lines.push(`6 summary     ${path.join(config.dataDir, 'keyhour', 'summary.json')}`);
  const upper = 1 + (kdLookups ?? 0) + 30 + (est1?.total_max ?? 0) + (est2?.total_max ?? 0) + (claude ? PLAN_CALLS * args.plans : 0);
  lines.push(`Qloo allowance: ${args.maxQlooCalls} requests over all invocations (--max-qloo-calls), ${ck.qloo_sent_total ?? 0} sent so far; upper bound of the pending plan about ${upper}`);
  lines.push(`inputs committed: ${inputs.git.ok ? (inputs.git.changed ? `no, ${inputs.git.changed} path(s) changed` : 'yes') : 'unknown (git failed)'}`);
  for (const [step, list] of Object.entries(inputs.problems)) for (const p of list) blocked.push(`blocks ${step}: ${p}`);
  lines.push(...(blocked.length ? blocked : ['inputs: nothing blocks the run']));
  if (!config.qloo.apiKey && config.qloo.mode !== 'fixture') lines.push('QLOO_API_KEY is not set: a real run now would stop at once with exit 2');
  return { lines, ok: blocked.length === 0 };
}

// ---------------------------------------------------------------- main

/**
 * @param {{ argv?: string[], env?: Record<string, string | undefined>, deps?: {
 *   fetch?: typeof fetch, print?: (line: string) => void, now?: () => number, git?: (paths: string[]) => { ok: boolean, changed: number | null },
 *   anthropic?: () => { messages: { create: Function } }, study1?: Function, study2?: Function, signal?: AbortSignal } }} [opts]
 * @returns {Promise<number>} exit code
 */
export async function runKeyhour({ argv = [], env = process.env, deps: given = {} } = {}) {
  const deps = { fetch: globalThis.fetch, print: console.log, now: Date.now, git: defaultGit, study1: runStudy1Cli, study2: runStudy2Cli, ...given };
  const print = (line) => deps.print(`keyhour: ${line}`);
  let args;
  let config;
  try {
    args = parseKeyhourArgs(argv);
    config = loadConfig(env);
  } catch (err) {
    print(err.message);
    return EXIT.USAGE;
  }
  const claude = Boolean(config.anthropic.apiKey);
  const khDir = path.join(config.dataDir, 'keyhour');
  const ckFile = path.join(khDir, 'checkpoint.json');
  let ck;
  try {
    ck = loadCheckpoint(ckFile);
  } catch (err) {
    print(`${err.message}. Rename it with a .old suffix to start over.`);
    return EXIT.USAGE;
  }
  const inputs = await loadInputs(args, config, deps);
  // The call cap covers every invocation on this DATA_DIR: reruns after a stop draw on the same allowance.
  const sentBeforeAll = ck.qloo_sent_total ?? 0;
  const allowance = Math.max(0, args.maxQlooCalls - sentBeforeAll);
  const guard = createFetchGuard({ fetchImpl: args.dryRun ? () => Promise.reject(new GuardStop('dry_run')) : deps.fetch, maxCalls: args.dryRun ? 0 : allowance, requestTimeoutMs: args.requestTimeoutMs });
  const ctx = { config, args, env, deps, inputs, ck, guard, claude };

  if (args.dryRun) {
    const report = dryRunReport(ctx);
    for (const l of report.lines) print(l);
    return report.ok ? EXIT.OK : EXIT.USAGE;
  }
  if (config.qloo.mode !== 'fixture' && !config.qloo.apiKey) {
    print('no key: set QLOO_API_KEY to run the key hour. Nothing was sent.');
    return EXIT.NO_KEY;
  }

  if (args.redo.includes('keyday') && ['done', 'already_run'].includes(ck.steps.study1?.status)) {
    print('--redo keyday is refused: Study 1 has run with the key-day pool restriction, and Study 2 must use the same one. Nothing was sent.');
    return EXIT.USAGE;
  }
  mkdirSync(khDir, { recursive: true });
  const prevSteps = { ...ck.steps };
  for (const s of args.redo) delete ck.steps[s];
  ck.created_at ??= new Date(deps.now()).toISOString();
  const caps = {
    key_check: 3,
    keyday: Math.ceil(args.stepCapFactor * (40 + 2 * new Set([...(inputs.keyday?.venues ?? []), inputs.keyday?.placebo].filter(Boolean).flatMap((v) => (v.shows ?? []).map((x) => x.headliner))).size)),
    study1: Math.ceil(args.stepCapFactor * (inputs.estimate1?.total_max ?? 0)) + 50,
    study2: Math.ceil(args.stepCapFactor * (inputs.estimate2?.total_max ?? 0)) + 50,
  };
  const save = () => writeChecked(ckFile, ck, guard.seen);
  const writeSummary = () => {
    const summary = buildSummary(ck, guard, { now: deps.now, qlooMode: effectiveQlooMode(config), claude });
    writeChecked(path.join(khDir, 'summary.json'), summary, guard.seen);
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = guard.fetch; // the study scripts, keyday and the Claude SDK all take globalThis.fetch
  const onAbort = () => guard.stop('interrupted');
  deps.signal?.addEventListener('abort', onAbort, { once: true });
  let exitCode = EXIT.OK;
  try {
    const run = {
      key_check: stepKeyCheck,
      keyday: stepKeyday,
      study1: (c) => runStudy(c, 'study1'),
      study2: (c) => runStudy(c, 'study2'),
      live_plans: stepLivePlans,
    };
    for (const [i, name] of STEPS.entries()) {
      const prev = ck.steps[name];
      if (prev && DONE.has(prev.status)) {
        print(`step ${i + 1} ${name}: ${prev.status} earlier, skipped`);
        continue;
      }
      if (prev?.status === 'no_go') {
        print(`step ${i + 1} ${name}: NO-GO recorded earlier. Nothing more runs; --redo keyday repeats the probes.`);
        exitCode = EXIT.NO_GO;
        break;
      }
      if (guard.state.stop === 'interrupted') {
        exitCode = EXIT.STOPPED;
        break;
      }
      print(`step ${i + 1} ${name}: start`);
      const sentBefore = guard.state.qloo_sent;
      const timeoutMin = args.stepTimeoutMin ?? STEP_TIMEOUT_MIN[name];
      const timer = setTimeout(() => {
        // Once Study 2's main result is written, the same run goes on to the literal reading, which cannot be run again:
        // a timeout there would lose it, and the request cap and per-request timeout still bound it.
        if (name === 'study2' && existsSync(path.join(args.out, 'backtest2-test.json'))) return;
        guard.stop('step_timeout');
      }, timeoutMin * 60_000);
      timer.unref?.();
      let out;
      try {
        out = await run[name]({ ...ctx, cap: caps[name] ?? Infinity, prev: prev ?? prevSteps[name] });
      } catch (err) {
        const s = stoppedBy(guard);
        out = { status: 'stopped', reason: guard.state.stop ?? 'error', code: s.code, message: `${name} failed (${err?.code ?? err?.name ?? 'error'})` };
      } finally {
        clearTimeout(timer);
      }
      const { code, message, ...record } = out;
      const sent = guard.state.qloo_sent - sentBefore;
      ck.qloo_sent_total = (ck.qloo_sent_total ?? 0) + sent;
      ck.steps[name] = { ...record, qloo_sent: (prev?.qloo_sent ?? 0) + sent, at: new Date(deps.now()).toISOString() };
      ck.history.push({ step: name, status: record.status, qloo_sent: sent, at: ck.steps[name].at });
      save();
      print(`step ${i + 1} ${name}: ${record.status}. ${message ?? ''}`.trim());
      if (code !== undefined && code !== EXIT.OK) {
        exitCode = code;
        if (code === EXIT.RATE_LIMITED) print(`stopped on HTTP 429${guard.state.retry_after_s ? ` (Retry-After ${guard.state.retry_after_s} s)` : ''}. Wait, then rerun the same command: it resumes here.`);
        if (code === EXIT.CALL_CAP) {
          const which = guard.state.stop === 'call_cap'
            ? `--max-qloo-calls ${args.maxQlooCalls} over all invocations, ${ck.qloo_sent_total} sent so far`
            : `step cap ${guard.step.cap} for this step`;
          print(`stopped at the Qloo request cap (${which}). Check the counts, then rerun with a larger --max-qloo-calls or --step-cap-factor.`);
        }
        break;
      }
    }
  } finally {
    globalThis.fetch = realFetch;
    deps.signal?.removeEventListener('abort', onAbort);
  }
  try {
    writeSummary();
    print(`summary: ${path.join(khDir, 'summary.json')} (exit ${exitCode})`);
  } catch (err) {
    print(err.message);
    return EXIT.USAGE;
  }
  return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ac = new AbortController();
  let signals = 0;
  const onSignal = () => {
    if (++signals > 1) process.exit(130);
    console.log('keyhour: stopping after the requests in flight (press Ctrl-C again to quit at once; a study lock may then stay)');
    ac.abort();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.exitCode = await runKeyhour({ argv: process.argv.slice(2), env: process.env, deps: { signal: ac.signal } });
}
