// HTTP application. Built from a parsed config so tests can inject requests without opening a port.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { REPO_ROOT, effectiveAgentMode, effectiveQlooMode } from './config.js';
import { loadVenues, venueSummary } from './venues.js';

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
 * @param {{ logger?: boolean | object }} [opts]
 */
export async function buildApp(config, { logger = false } = {}) {
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

  app.get('/api/venues', async () => {
    const venues = await loadVenues(config.venuesDir, {
      onSkip: (file, reason) => app.log.warn({ file: path.basename(file), reason }, 'skipped venue file'),
    });
    return venues.map(venueSummary);
  });

  await app.register(fastifyStatic, { root: path.join(REPO_ROOT, 'web') });

  return app;
}
