// HTTP application. Built from a parsed config so tests can inject requests without opening a port.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { REPO_ROOT, effectiveAgentMode, effectiveQlooMode } from './config.js';
import { nightsFor, todayISO } from './calendar/nights.js';
import { isISODate, loadVenues, venueSummary } from './calendar/venues.js';
import { budgetPath, createBudget } from './budget/budget.js';

const CALENDAR_MAX_DAYS = 120;

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
 * @param {{ logger?: boolean | object, now?: () => number, budget?: ReturnType<typeof createBudget> }} [opts]
 *   `now` fixes "today" in tests; `budget` replaces the on-disk ledger in DATA_DIR.
 */
export async function buildApp(config, { logger = false, now = Date.now, budget } = {}) {
  const app = Fastify({ logger });
  if (!budget) {
    budget = createBudget({
      dbPath: budgetPath(config.dataDir),
      dailyCap: config.budget.dailyUsdCap,
      totalCap: config.budget.totalUsdCap,
      ipLimit: config.budget.ipDailyLimit,
      prices: { inPerMTok: config.anthropic.priceInPerMTok, outPerMTok: config.anthropic.priceOutPerMTok },
      now,
    });
    app.addHook('onClose', async () => budget.close());
  }
  app.decorate('budget', budget);

  app.get('/api/health', async () => {
    const recorded = await hasRecordedRuns(config.dataDir);
    let agent = effectiveAgentMode(config, { hasRecordedRuns: recorded });
    // A spent cap means no live calls until the next UTC day (or ever, for the total cap).
    if (agent === 'live' && !budget.canSpend().ok) agent = recorded ? 'recorded' : 'scripted';
    return { ok: true, qloo: effectiveQlooMode(config), agent, budget: budget.snapshot(), version: pkg.version };
  });

  const venues = () =>
    loadVenues(config.venuesDir, {
      onSkip: (file, reason) => app.log.warn({ file: path.basename(file), reason }, 'skipped venue file'),
    });

  app.get('/api/venues', async () => (await venues()).map(venueSummary));

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
    return {
      venue: venueSummary(venue),
      ...nightsFor(venue, from, days),
      source: { url: venue.calendar_source_url, read_at: venue.read_at },
    };
  });

  await app.register(fastifyStatic, { root: path.join(REPO_ROOT, 'web') });

  return app;
}
