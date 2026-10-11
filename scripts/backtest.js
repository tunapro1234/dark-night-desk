#!/usr/bin/env node
// Back-test runner for BACKTEST.md (frozen protocol; this script follows it and changes nothing in it).
// Usage:
//   node scripts/backtest.js --dry-run                         counts only, no Qloo call -> results/backtest-dryrun.json
//   node scripts/backtest.js --split test --restrict filter    the single test run -> results/backtest-test.json + .log
// --restrict is decided by the key-day test before the run: "filter" if filter.results.entities returns the requested
// entities, otherwise "take500". The test split runs once: DATA_DIR/backtest-test.lock is written when it starts and a
// second run is refused. A run that stops on a Qloo error before any metric is computed removes its lock and logs the stop.
// Rankers: Q (taste), P (popularity), T (genre tags), L (Claude only, when a key and budget exist; otherwise "not run"),
// R (random, analytic), the placebo rooms' signals, and the venue-entity variant.
// Options: --data <dir> (default data/backtest), --out <dir> (default results), --seed <int>, --reps <int>.
// Exit codes: 0 done, 1 usage/config/data error, 2 refused (lock or no Qloo key), 3 run stopped.
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, REPO_ROOT, loadConfig } from '../server/config.js';
import { budgetPath, createBudget } from '../server/budget/budget.js';
import { cachePath, createQlooCache } from '../server/qloo/cache.js';
import { createQlooClient } from '../server/qloo/client.js';
import { createAnthropic } from '../server/agent/loop.js';
import { loadBacktestData } from '../server/backtest/data.js';
import { createLlmRanker } from '../server/backtest/llm.js';
import { RESTRICTIONS } from '../server/backtest/rankers.js';
import { DEFAULT_REPS, DEFAULT_SEED, dryRun, runBacktest } from '../server/backtest/run.js';

export const LOCK_NAME = 'backtest-test.lock';

export function parseArgs(argv) {
  const out = { split: 'test', dryRun: false, data: path.join(REPO_ROOT, 'data', 'backtest'), out: path.join(REPO_ROOT, 'results'), seed: DEFAULT_SEED, reps: DEFAULT_REPS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--split') out.split = val();
    else if (a === '--restrict') out.restrict = val();
    else if (a === '--data') out.data = path.resolve(val());
    else if (a === '--out') out.out = path.resolve(val());
    else if (a === '--seed') out.seed = Number(val());
    else if (a === '--reps') out.reps = Number(val());
    else throw new Error(`unknown option ${a}`);
  }
  if (out.split === 'dev') throw new Error('BACKTEST.md has no dev rooms and tunes nothing; only --split test exists');
  if (out.split !== 'test') throw new Error('--split must be test');
  if (!Number.isInteger(out.seed) || !Number.isInteger(out.reps) || out.reps < 100) throw new Error('--seed must be an integer and --reps an integer >= 100');
  if (!out.dryRun && !RESTRICTIONS.includes(out.restrict)) throw new Error(`--restrict must be one of ${RESTRICTIONS.join(', ')} (decided by the key-day test)`);
  return out;
}

const writeJson = (file, obj) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
};

/** @returns {Promise<number>} exit code */
export async function main(argv = process.argv.slice(2), env = process.env, print = console.log) {
  let args;
  let config;
  try {
    args = parseArgs(argv);
    config = loadConfig(env);
  } catch (err) {
    print(err instanceof ConfigError ? err.message : `backtest: ${err.message}`);
    return 1;
  }
  let data;
  try {
    data = await loadBacktestData(args.data);
  } catch (err) {
    print(`backtest: ${err.message}`);
    return 1;
  }

  if (args.dryRun) {
    const summary = dryRun(data);
    writeJson(path.join(args.out, 'backtest-dryrun.json'), summary);
    print(`dry run: ${summary.test_shows_before_drops} test shows before drops, ${summary.weeks_below_min_pool_before_resolution} weeks under ${summary.min_pool} candidates`);
    return 0;
  }

  const lock = path.join(config.dataDir, LOCK_NAME);
  if (existsSync(lock)) {
    print(`backtest: refused. The test split has already run (${lock} exists). BACKTEST.md allows one run.`);
    return 2;
  }
  if (config.qloo.mode !== 'fixture' && !config.qloo.apiKey) {
    print('backtest: refused. QLOO_API_KEY is not set.');
    return 2;
  }

  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(lock, `${JSON.stringify({ started_at: new Date().toISOString(), restrict: args.restrict })}\n`, { flag: 'wx' });
  const logFile = path.join(args.out, 'backtest-test.log');
  mkdirSync(args.out, { recursive: true });
  writeFileSync(logFile, '');
  // The log holds counts and codes only: no titles, names, ids or Qloo response content.
  const log = (event) => appendFileSync(logFile, `${JSON.stringify({ t: new Date().toISOString(), ...event })}\n`);
  log({ event: 'start', split: args.split, restrict: args.restrict, seed: args.seed, reps: args.reps, qloo_mode: config.qloo.mode });

  const cache = createQlooCache({ dbPath: cachePath(config.dataDir) });
  const client = createQlooClient({ apiKey: config.qloo.apiKey, baseUrl: config.qloo.baseUrl, mode: config.qloo.mode, cache });
  let budget = null;
  let llm = null;
  let llmSkipReason = 'no Claude key before the test run';
  if (config.anthropic.apiKey) {
    budget = createBudget({
      dbPath: budgetPath(config.dataDir),
      dailyCap: config.budget.dailyUsdCap,
      totalCap: config.budget.totalUsdCap,
      ipLimit: config.budget.ipDailyLimit,
      prices: { inPerMTok: config.anthropic.priceInPerMTok, outPerMTok: config.anthropic.priceOutPerMTok },
    });
    const spend = budget.canSpend();
    if (spend.ok) llm = createLlmRanker({ anthropic: createAnthropic(config.anthropic.apiKey), model: config.anthropic.model, budget });
    else llmSkipReason = `the Claude spend cap is used up (${spend.reason})`;
  }
  log({ event: 'llm', run: Boolean(llm), reason: llm ? null : llmSkipReason });

  try {
    const summary = await runBacktest({ client, data, restrict: args.restrict, llm, llmSkipReason, seed: args.seed, reps: args.reps, log });
    writeJson(path.join(args.out, 'backtest-test.json'), summary);
    log({ event: 'done', label: summary.label, dropped: summary.dropped, qloo: summary.qloo });
    print(`backtest: ${summary.label}. Written to ${path.join(args.out, 'backtest-test.json')}`);
    return 0;
  } catch (err) {
    // Rankings come before any metric, so a stop here has shown no result: the lock goes and the stop stays in the log.
    log({ event: 'stopped', code: err?.code ?? 'error', lock_removed: true }); // the code only: a message may quote a Qloo response
    rmSync(lock, { force: true });
    print(`backtest: stopped (${err?.code ?? 'error'}): ${err?.message ?? err}`);
    return 3;
  } finally {
    cache.close?.();
    budget?.close?.();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
