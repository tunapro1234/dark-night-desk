// HTTP application. Built from a parsed config so tests can inject requests without opening a port.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { REPO_ROOT, effectiveAgentMode, effectiveQlooMode } from './config.js';
import { nightsFor, todayISO } from './calendar/nights.js';
import { isISODate, loadVenues, venueSummary } from './calendar/venues.js';

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
 * @param {{ logger?: boolean | object, now?: () => number }} [opts] `now` fixes "today" in tests.
 */
export async function buildApp(config, { logger = false, now = Date.now } = {}) {
  const app = Fastify({ logger });

  app.get('/api/health', async () => ({
    ok: true,
    qloo: effectiveQlooMode(config),
    agent: effectiveAgentMode(config, { hasRecordedRuns: await hasRecordedRuns(config.dataDir) }),
    // Spend tracking is not wired yet; nothing has been spent because no live call exists.
    budget: {
      day_usd: 0,
      total_usd: 0,
      day_cap: config.budget.dailyUsdCap,
      total_cap: config.budget.totalUsdCap,
    },
    version: pkg.version,
  }));

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
