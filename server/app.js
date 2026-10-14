// HTTP application. Built from a parsed config so tests can inject requests without opening a port.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { REPO_ROOT, budgetOptions, effectiveAgentMode, effectiveQlooMode } from './config.js';
import { nightsFor, todayISO } from './calendar/nights.js';
import { isISODate, isPlannable, listedUntil, loadVenues, venueSummary } from './calendar/venues.js';
import { budgetPath, clientIp, createBudget } from './budget/budget.js';
import { createQlooClient } from './qloo/client.js';
import { cachePath, createQlooCache } from './qloo/cache.js';
import { createAnthropic } from './agent/loop.js';
import { PlanError, runAblate, runPlan } from './agent/plan.js';

const CALENDAR_MAX_DAYS = 120;
export const BACKTEST_FILE = path.join(REPO_ROOT, 'results', 'backtest-test.json');

const pkg = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));

async function hasRecordedRuns(dataDir) {
  try {
    return (await readdir(path.join(dataDir, 'recorded'))).some((n) => n.endsWith('.json'));
  } catch {
    return false;
  }
}

/**
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {{ logger?: boolean | object, now?: () => number, budget?: ReturnType<typeof createBudget>,
 *   qloo?: ReturnType<typeof createQlooClient>, anthropic?: () => { messages: { create: Function } } }} [opts]
 *   `now` fixes "today" in tests; `budget` replaces the on-disk ledger in DATA_DIR; `qloo` replaces the Qloo client;
 *   `anthropic` replaces the Claude client factory (tests use a stand-in, never the real API);
 *   `backtestFile` replaces results/backtest-test.json.
 */
export async function buildApp(config, { logger = false, now = Date.now, budget, qloo, anthropic, backtestFile = BACKTEST_FILE } = {}) {
  const app = Fastify({ logger });
  if (!qloo) {
    const cache = createQlooCache({ dbPath: cachePath(config.dataDir), now });
    qloo = createQlooClient({ apiKey: config.qloo.apiKey, baseUrl: config.qloo.baseUrl, mode: config.qloo.mode, cache, logger: app.log });
    app.addHook('onClose', async () => cache.close());
  }
  anthropic ??= () => createAnthropic(config.anthropic.apiKey);
  if (!budget) {
    budget = createBudget({ dbPath: budgetPath(config.dataDir), ...budgetOptions(config), now });
    app.addHook('onClose', async () => budget.close());
  }
  app.decorate('budget', budget);
  // The public demo stays out of search results. Set on the raw response so the SSE route's writeHead keeps it too.
  app.addHook('onRequest', async (req, reply) => {
    reply.raw.setHeader('x-robots-tag', 'noindex, nofollow');
  });

  app.get('/api/health', async () => {
    const recorded = await hasRecordedRuns(config.dataDir);
    let agent = effectiveAgentMode(config, { hasRecordedRuns: recorded });
    // A spent cap means no live calls until the next UTC day (or ever, for the total cap).
    if (agent === 'live' && !budget.canSpend().ok) agent = recorded ? 'recorded' : 'scripted';
    // version comes from package.json; uptime is whole seconds since the process started.
    return { ok: true, qloo: effectiveQlooMode(config), agent, budget: budget.snapshot(), version: pkg.version, uptime: Math.floor(process.uptime()) };
  });

  const venues = () =>
    loadVenues(config.venuesDir, {
      onSkip: (file, reason) => app.log.warn({ file: path.basename(file), reason }, 'skipped venue file'),
    });

  // Rooms whose source lists only some of their shows stay in the city pool but are not offered for planning.
  const NOT_PLANNABLE = 'this room is not offered: its public calendar lists only some of its shows';

  app.get('/api/venues', async () => (await venues()).filter(isPlannable).map(venueSummary));

  app.get('/api/venues/:id/calendar', async (req, reply) => {
    const from = req.query.from ?? todayISO(now());
    const daysRaw = req.query.days ?? '60';
    const days = /^\d+$/.test(String(daysRaw)) ? Number(daysRaw) : NaN;
    if (!isISODate(from)) return reply.code(400).send({ error: 'from must be a YYYY-MM-DD date' });
    if (!Number.isInteger(days) || days < 1 || days > CALENDAR_MAX_DAYS) {
      return reply.code(400).send({ error: `days must be an integer between 1 and ${CALENDAR_MAX_DAYS}` });
    }
    const venue = (await venues()).find((v) => v.id === req.params.id);
    if (!venue) return reply.code(404).send({ error: 'unknown venue' });
    if (!isPlannable(venue)) return reply.code(404).send({ error: NOT_PLANNABLE });
    return {
      venue: venueSummary(venue),
      ...nightsFor(venue, from, days, { today: todayISO(now()), listedUntil: listedUntil(venue) }),
      source: { url: venue.calendar_source_url, read_at: venue.read_at },
    };
  });

  /** Shared input check for /api/plan and /api/ablate; sends the error itself and returns null on bad input. */
  async function nightFrom(req, reply) {
    const { venue_id: venueId, date } = req.body ?? {};
    if (typeof venueId !== 'string' || !venueId) return void reply.code(400).send({ error: 'venue_id is required' });
    if (!isISODate(date)) return void reply.code(400).send({ error: 'date must be a YYYY-MM-DD date' });
    const all = await venues();
    const venue = all.find((v) => v.id === venueId);
    if (!venue) return void reply.code(404).send({ error: 'unknown venue' });
    if (!isPlannable(venue)) return void reply.code(404).send({ error: NOT_PLANNABLE });
    const today = todayISO(now());
    const status = nightsFor(venue, date, 1, { today, listedUntil: listedUntil(venue) }).nights[0].status;
    if (status === 'today' || status === 'past') {
      return void reply.code(409).send({ error: `${date} is ${status === 'today' ? 'today' : 'in the past'}; plans start from tomorrow` });
    }
    if (status === 'unlisted') {
      return void reply.code(409).send({ error: `${date} is after ${listedUntil(venue)}, the last date ${venue.name}'s calendar was read for` });
    }
    if (status !== 'dark') return void reply.code(409).send({ error: `${date} is not a dark night at ${venue.name} (${status})` });
    return { venues: all, venue, date, today };
  }

  const qlooMode = effectiveQlooMode(config);
  const QLOO_OFF = { code: 'qloo_not_connected', message: 'Qloo: not connected. Nothing is ranked without it.' };

  app.post('/api/plan', async (req, reply) => {
    const night = await nightFrom(req, reply);
    if (!night) return reply;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (qlooMode === 'no-key') {
      send('error', QLOO_OFF);
    } else {
      try {
        const result = await runPlan({
          config, budget, qloo, qlooMode, ...night, now, anthropic,
          ip: clientIp({ socket: req.raw.socket, headers: req.headers }),
          emit: (label) => send('step', { label }),
        });
        send('result', result);
      } catch (err) {
        if (err instanceof PlanError) send('error', { code: err.code, message: err.message });
        else {
          req.log.error(err, 'plan failed');
          send('error', { code: 'plan_failed', message: 'The plan could not be built. Try again in a minute.' });
        }
      }
    }
    res.end();
    return reply;
  });

  app.post('/api/ablate', async (req, reply) => {
    const night = await nightFrom(req, reply);
    if (!night) return reply;
    const remove = req.body?.remove ?? [];
    if (!Array.isArray(remove) || remove.length > 40 || !remove.every((x) => typeof x === 'string')) {
      return reply.code(400).send({ error: 'remove must be a list of at most 40 entity ids' });
    }
    if (qlooMode === 'no-key') return reply.code(409).send({ error: QLOO_OFF.message, code: QLOO_OFF.code });
    try {
      return await runAblate({ qloo, ...night, remove });
    } catch (err) {
      if (err instanceof PlanError) return reply.code(502).send({ error: err.message, code: err.code });
      throw err;
    }
  });

  // Totals only (BACKTEST.md). scripts/backtest.js writes results/backtest-test.json once; until then the answer is "not-run".
  app.get('/api/backtest', async () => {
    try {
      const summary = JSON.parse(await readFile(backtestFile, 'utf8'));
      if (summary && (summary.status === 'pilot' || summary.status === 'full')) return summary;
    } catch {
      // no summary yet
    }
    return { status: 'not-run' };
  });

  await app.register(fastifyStatic, { root: path.join(REPO_ROOT, 'web') });

  return app;
}
