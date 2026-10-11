// Runtime configuration. Every environment variable the server reads is parsed here.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const QLOO_HACKATHON_URL = 'https://hackathon.api.qloo.com';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const QLOO_MODES = new Set(['live', 'fixture']);
const AGENT_MODES = new Set(['auto', 'live', 'recorded', 'scripted']);

// Claude Sonnet 5.5 list price, USD per million tokens (Anthropic pricing table, Oct 2026).
const DEFAULT_PRICE_IN_PER_MTOK = 2;
const DEFAULT_PRICE_OUT_PER_MTOK = 10;

export class ConfigError extends Error {
  constructor(problems) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

/**
 * Parse and validate configuration from an environment object.
 * Throws ConfigError listing every problem found.
 * @param {Record<string, string | undefined>} [env]
 */
export function loadConfig(env = process.env) {
  const problems = [];
  const str = (name, fallback) => {
    const v = env[name];
    return v === undefined || v.trim() === '' ? fallback : v.trim();
  };
  const num = (name, fallback, { integer = false, min = 0 } = {}) => {
    const raw = str(name, undefined);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || (integer && !Number.isInteger(n))) {
      problems.push(`${name} must be ${integer ? 'an integer' : 'a number'} >= ${min} (got "${raw}")`);
      return fallback;
    }
    return n;
  };
  const dir = (name, fallback) => path.resolve(REPO_ROOT, str(name, fallback));

  const nodeEnv = str('NODE_ENV', 'development');

  const host = str('HOST', '127.0.0.1');
  if (!LOOPBACK_HOSTS.has(host)) problems.push(`HOST must be a loopback address (127.0.0.1, ::1, localhost), got "${host}"`);
  const port = num('PORT', 3020, { integer: true, min: 1 });
  if (port > 65535) problems.push(`PORT must be <= 65535 (got ${port})`);

  const qlooBaseUrl = str('QLOO_BASE_URL', QLOO_HACKATHON_URL).replace(/\/+$/, '');
  if (qlooBaseUrl !== QLOO_HACKATHON_URL) {
    problems.push(`QLOO_BASE_URL must be ${QLOO_HACKATHON_URL}; other Qloo hosts are not allowed for this project (got "${qlooBaseUrl}")`);
  }
  const qlooMode = str('QLOO_MODE', 'live');
  if (!QLOO_MODES.has(qlooMode)) problems.push(`QLOO_MODE must be "live" or "fixture" (got "${qlooMode}")`);
  else if (qlooMode === 'fixture' && nodeEnv !== 'test') {
    problems.push(`QLOO_MODE=fixture is only allowed when NODE_ENV=test (NODE_ENV is "${nodeEnv}")`);
  }

  const agentMode = str('AGENT_MODE', 'auto');
  if (!AGENT_MODES.has(agentMode)) problems.push(`AGENT_MODE must be one of ${[...AGENT_MODES].join(', ')} (got "${agentMode}")`);

  const config = {
    nodeEnv,
    host,
    port,
    dataDir: dir('DATA_DIR', './var'),
    venuesDir: dir('VENUES_DIR', 'data/venues'),
    qloo: {
      apiKey: str('QLOO_API_KEY', undefined),
      baseUrl: qlooBaseUrl,
      mode: qlooMode,
    },
    anthropic: {
      apiKey: str('ANTHROPIC_API_KEY', undefined),
      model: str('CLAUDE_MODEL', 'claude-sonnet-5-5'),
      priceInPerMTok: num('CLAUDE_PRICE_IN_PER_MTOK', DEFAULT_PRICE_IN_PER_MTOK),
      priceOutPerMTok: num('CLAUDE_PRICE_OUT_PER_MTOK', DEFAULT_PRICE_OUT_PER_MTOK),
    },
    agentMode,
    budget: {
      dailyUsdCap: num('DAILY_USD_CAP', 2),
      totalUsdCap: num('TOTAL_USD_CAP', 30),
      ipDailyLimit: num('IP_DAILY_LIMIT', 20, { integer: true }),
    },
  };

  if (problems.length) throw new ConfigError(problems);
  return config;
}

/**
 * Qloo mode as reported to clients: "fixture" (tests only), "live" with a key, otherwise "no-key".
 * @param {ReturnType<typeof loadConfig>} config
 */
export function effectiveQlooMode(config) {
  if (config.qloo.mode === 'fixture') return 'fixture';
  return config.qloo.apiKey ? 'live' : 'no-key';
}

/**
 * Agent mode as reported to clients. Without an Anthropic key the agent never runs live:
 * it replays a recorded run when one exists, otherwise it follows the scripted plan.
 * @param {ReturnType<typeof loadConfig>} config
 * @param {{ hasRecordedRuns?: boolean }} [state]
 */
export function effectiveAgentMode(config, { hasRecordedRuns = false } = {}) {
  const fallback = hasRecordedRuns ? 'recorded' : 'scripted';
  switch (config.agentMode) {
    case 'scripted':
      return 'scripted';
    case 'recorded':
      return fallback;
    default:
      return config.anthropic.apiKey ? 'live' : fallback;
  }
}
