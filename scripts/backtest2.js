#!/usr/bin/env node
// Study 2 runner for BACKTEST-2.md (registered 14 Oct 2026, Amendments 1-14; this script follows it and changes nothing in it).
// Usage:
//   node scripts/backtest2.js --dry-run                         counts only, no Qloo call -> results/backtest2-dryrun.json
//   node scripts/backtest2.js --check-sample                    the 10% second-pass rows (seed 3) -> results/backtest2-check-sample.json
//   node scripts/backtest2.js --restrict filter                 the single test run -> results/backtest2-test.json + .log
// --restrict is the key-day decision, the same one Study 1 uses. The test run happens once: DATA_DIR/backtest2-test.lock is
// written when it starts and a second run is refused. A run that stops on a Qloo error before any metric removes its lock.
// Options: --data <dir> (default data/backtest2), --out <dir> (default results), --seed <int> and --reps <int> (bootstrap).
// The test run uses the protocol's seed 1 and 2,000 resamples; other values are refused outside fixture mode (tests).
// The placebo seed (2) and the check-sample seed (3) are fixed by the protocol and are not options.
// Before the lock, the run refuses data whose roles do not match coverage on shows.csv (Amendment 12) and data without
// ln-aeg.csv (Amendment 14; a file with only the header names no company). After the main result is written, the same run
// reports the literal reading of Amendment 1 beside it (descriptive, no LLM ranker); the dry run reports its clusters. The log
// records the commit and the SHA-256 of the data files. A stopped run prints only the error code for Qloo errors, never a response body.
// Exit codes: 0 done, 1 usage/config/data error, 2 refused (lock or no Qloo key), 3 run stopped.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, REPO_ROOT, budgetOptions, loadConfig } from '../server/config.js';
import { budgetPath, createBudget } from '../server/budget/budget.js';
import { cachePath, createQlooCache } from '../server/qloo/cache.js';
import { createQlooClient } from '../server/qloo/client.js';
import { createAnthropic } from '../server/agent/loop.js';
import { createLlmRanker } from '../server/backtest/llm.js';
import { RESTRICTIONS } from '../server/backtest/rankers.js';
import { checkSample, coverageProblems, literalReading, loadStudy2Data } from '../server/backtest/study2-data.js';
import { DEFAULT_REPS2, DEFAULT_SEED2, LITERAL_NOTE, dryRun2, literalStudy2, runStudy2 } from '../server/backtest/study2.js';

export const LOCK_NAME2 = 'backtest2-test.lock';
// Errors raised by this code, whose messages hold no Qloo content and may be printed.
const LOCAL_CODES = new Set(['coverage', 'no_test_rooms', 'bad_restrict']);

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
function commitOf(dir) {
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() !== '';
    return { commit: head, dirty };
  } catch {
    return { commit: null, dirty: null };
  }
}

export function parseArgs2(argv) {
  const out = { dryRun: false, checkSample: false, data: path.join(REPO_ROOT, 'data', 'backtest2'), out: path.join(REPO_ROOT, 'results'), seed: DEFAULT_SEED2, reps: DEFAULT_REPS2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--check-sample') out.checkSample = true;
    else if (a === '--restrict') out.restrict = val();
    else if (a === '--data') out.data = path.resolve(val());
    else if (a === '--out') out.out = path.resolve(val());
    else if (a === '--seed') out.seed = Number(val());
    else if (a === '--reps') out.reps = Number(val());
    else throw new Error(`unknown option ${a}`);
  }
  if (out.dryRun && out.checkSample) throw new Error('--dry-run and --check-sample are separate commands');
  if (!Number.isInteger(out.seed) || !Number.isInteger(out.reps) || out.reps < 100) throw new Error('--seed must be an integer and --reps an integer >= 100');
  if (!out.dryRun && !out.checkSample && !RESTRICTIONS.includes(out.restrict)) throw new Error(`--restrict must be one of ${RESTRICTIONS.join(', ')} (decided by the key-day test)`);
  return out;
}

const writeJson = (file, obj) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
};

/** @returns {Promise<number>} exit code */
export async function main2(argv = process.argv.slice(2), env = process.env, print = console.log) {
  let args;
  let config;
  try {
    args = parseArgs2(argv);
    config = loadConfig(env);
  } catch (err) {
    print(err instanceof ConfigError ? err.message : `backtest2: ${err.message}`);
    return 1;
  }
  let data;
  try {
    data = await loadStudy2Data(args.data);
  } catch (err) {
    print(`backtest2: ${err.message}`);
    return 1;
  }

  if (args.checkSample) {
    const rows = checkSample(data.shows.map((x) => x.row));
    writeJson(path.join(args.out, 'backtest2-check-sample.json'), { seed: 3, share: 0.1, of_rows: data.shows.length, shows_csv_lines: rows });
    print(`check sample: ${rows.length} of ${data.shows.length} rows (seed 3)`);
    return 0;
  }
  if (args.dryRun) {
    let summary;
    try {
      summary = dryRun2(data);
      summary.literal_reading = data.lnAeg
        ? { status: 'counted', ...literalReading(data, data.lnAeg).report, note: LITERAL_NOTE }
        : { status: 'not run', reason: 'ln-aeg.csv is missing', note: LITERAL_NOTE };
    } catch (err) {
      print(`backtest2: ${err.message}`);
      return 1;
    }
    writeJson(path.join(args.out, 'backtest2-dryrun.json'), summary);
    print(
      `dry run: ${summary.clusters} clusters, ${summary.test_rooms} test rooms, ${summary.test_rows_S2_live} live S2 test rows, ` +
        `${summary.pool_candidates_by_window.length} metro windows, ${summary.windows_below_min_pool_before_resolution} under ${summary.min_pool} candidates, ` +
        `${summary.coverage_problems.length} coverage problems; literal reading: ` +
        (summary.literal_reading.status === 'counted' ? `${summary.literal_reading.clusters} clusters` : summary.literal_reading.reason),
    );
    return 0;
  }

  if (config.qloo.mode !== 'fixture' && (args.seed !== DEFAULT_SEED2 || args.reps !== DEFAULT_REPS2)) {
    print(`backtest2: the test run uses seed ${DEFAULT_SEED2} and ${DEFAULT_REPS2} resamples (BACKTEST-2.md); --seed and --reps are for tests only.`);
    return 1;
  }
  const problems = coverageProblems(data.venues, data.shows);
  if (problems.length) {
    print(`backtest2: venues.csv roles do not match shows.csv (Amendment 12):\n  ${problems.join('\n  ')}`);
    return 1;
  }
  if (!data.lnAeg) {
    print(`backtest2: ${path.join(args.data, 'ln-aeg.csv')} is missing. The literal reading needs it (Amendment 14); a file with only the header names no company.`);
    return 1;
  }
  const lock = path.join(config.dataDir, LOCK_NAME2);
  if (existsSync(lock)) {
    print(`backtest2: refused. Study 2 has already run (${lock} exists). BACKTEST-2.md allows one run.`);
    return 2;
  }
  if (config.qloo.mode !== 'fixture' && !config.qloo.apiKey) {
    print('backtest2: refused. QLOO_API_KEY is not set.');
    return 2;
  }

  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(lock, `${JSON.stringify({ started_at: new Date().toISOString(), restrict: args.restrict })}\n`, { flag: 'wx' });
  const logFile = path.join(args.out, 'backtest2-test.log');
  mkdirSync(args.out, { recursive: true });
  writeFileSync(logFile, '');
  // The log holds counts, codes and venue ids only: no titles, act names, entity ids or Qloo response content.
  const log = (event) => appendFileSync(logFile, `${JSON.stringify({ t: new Date().toISOString(), ...event })}\n`);
  log({
    event: 'start', restrict: args.restrict, seed: args.seed, reps: args.reps, qloo_mode: config.qloo.mode, ...commitOf(REPO_ROOT),
    data_sha256: Object.fromEntries(['venues.csv', 'shows.csv', 'ln-aeg.csv'].map((f) => [f, sha256(path.join(args.data, f))])),
  });

  const cache = createQlooCache({ dbPath: cachePath(config.dataDir) });
  const client = createQlooClient({ apiKey: config.qloo.apiKey, baseUrl: config.qloo.baseUrl, mode: config.qloo.mode, cache });
  let budget = null;
  let llm = null;
  let llmSkipReason = 'no Claude key before the test run';
  if (config.anthropic.apiKey) {
    budget = createBudget({ dbPath: budgetPath(config.dataDir), ...budgetOptions(config) });
    const spend = budget.canSpend();
    if (spend.ok) llm = createLlmRanker({ anthropic: createAnthropic(config.anthropic.apiKey), model: config.anthropic.model, budget, log });
    else llmSkipReason = `the Claude spend cap is used up (${spend.reason})`;
  }
  log({ event: 'llm', run: Boolean(llm), reason: llm ? null : llmSkipReason });

  try {
    const summary = await runStudy2({ client, data, restrict: args.restrict, llm, llmSkipReason, seed: args.seed, reps: args.reps, log });
    writeJson(path.join(args.out, 'backtest2-test.json'), summary);
    log({ event: 'done', label: summary.label, dropped: summary.dropped, qloo: summary.qloo });
    print(`backtest2: ${summary.label}. Written to ${path.join(args.out, 'backtest2-test.json')}`);
    // Amendment 14: the literal reading, beside the main result. The main result is already written and the lock stays.
    const literalLog = (event) => log({ reading: 'literal', ...event });
    try {
      summary.literal_reading = await literalStudy2({ client, data, lnAeg: data.lnAeg, restrict: args.restrict, seed: args.seed, reps: args.reps, log: literalLog });
    } catch (err) {
      summary.literal_reading = { status: 'stopped', code: err?.code ?? 'error', note: LITERAL_NOTE };
    }
    writeJson(path.join(args.out, 'backtest2-test.json'), summary);
    literalLog({ event: 'done', status: summary.literal_reading.status, label: summary.literal_reading.label ?? null });
    print(`backtest2: literal reading (Amendment 14): ${summary.literal_reading.label ?? summary.literal_reading.reason ?? summary.literal_reading.code}`);
    return 0;
  } catch (err) {
    log({ event: 'stopped', code: err?.code ?? 'error', lock_removed: true });
    rmSync(lock, { force: true });
    const code = err?.code ?? 'error';
    print(LOCAL_CODES.has(code) ? `backtest2: stopped (${code}): ${err.message}` : `backtest2: stopped (${code}). Details stay out of the console; the lock was removed.`);
    return 3;
  } finally {
    cache.close?.();
    budget?.close?.();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main2();
}
