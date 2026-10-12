import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ConfigError, REPO_ROOT, effectiveAgentMode, effectiveQlooMode, loadConfig } from '../server/config.js';

const problemsFor = (env) => {
  try {
    loadConfig(env);
  } catch (err) {
    assert.ok(err instanceof ConfigError);
    return err.problems;
  }
  assert.fail('expected ConfigError');
};

test('defaults match the documented contract', () => {
  const c = loadConfig({});
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.port, 3020);
  assert.equal(c.dataDir, path.join(REPO_ROOT, 'var'));
  assert.equal(c.venuesDir, path.join(REPO_ROOT, 'data/venues'));
  assert.equal(c.qloo.baseUrl, 'https://hackathon.api.qloo.com');
  assert.equal(c.qloo.mode, 'live');
  assert.equal(c.qloo.apiKey, undefined);
  assert.equal(c.anthropic.model, 'claude-haiku-5-5');
  assert.equal(c.anthropic.priceInPerMTok, 0.1);
  assert.equal(c.anthropic.priceOutPerMTok, 0.5);
  assert.equal(c.anthropic.longPriceInPerMTok, 0.5);
  assert.equal(c.anthropic.longPriceOutPerMTok, 2.5);
  assert.equal(c.anthropic.longPromptTokens, 100_000);
  assert.equal(c.anthropic.keyLastDay, undefined);
  assert.equal(c.agentMode, 'auto');
  assert.deepEqual(c.budget, { dailyUsdCap: 2, totalUsdCap: 30, monthlyUsdCap: 12, ipDailyLimit: 20 });
});

test('ANTHROPIC_API_KEY_FILE: key read from the file, env wins, unreadable file means no key', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const os = await import('node:os');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dnd-cfg-'));
  try {
    const file = path.join(dir, 'k');
    await writeFile(file, 'from-file\n');
    assert.equal(loadConfig({ ANTHROPIC_API_KEY_FILE: file }).anthropic.apiKey, 'from-file');
    assert.equal(loadConfig({ ANTHROPIC_API_KEY_FILE: file, ANTHROPIC_API_KEY: 'from-env' }).anthropic.apiKey, 'from-env');
    assert.equal(loadConfig({ ANTHROPIC_API_KEY_FILE: path.join(dir, 'missing') }).anthropic.apiKey, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('ANTHROPIC_KEY_LAST_DAY must be a date', () => {
  assert.equal(loadConfig({ ANTHROPIC_KEY_LAST_DAY: '2026-11-11' }).anthropic.keyLastDay, '2026-11-11');
  assert.throws(() => loadConfig({ ANTHROPIC_KEY_LAST_DAY: 'Nov 11' }), ConfigError);
});

test('environment overrides are parsed', () => {
  const c = loadConfig({
    PORT: '4100', DATA_DIR: '/tmp/dnd-data', VENUES_DIR: 'test/fixtures', DAILY_USD_CAP: '1.5',
    TOTAL_USD_CAP: '10', MONTHLY_USD_CAP: '4', IP_DAILY_LIMIT: '5', AGENT_MODE: 'scripted', CLAUDE_MODEL: 'claude-opus-5-5',
  });
  assert.equal(c.port, 4100);
  assert.equal(c.dataDir, '/tmp/dnd-data');
  assert.equal(c.venuesDir, path.join(REPO_ROOT, 'test/fixtures'));
  assert.deepEqual(c.budget, { dailyUsdCap: 1.5, totalUsdCap: 10, monthlyUsdCap: 4, ipDailyLimit: 5 });
  assert.equal(c.agentMode, 'scripted');
  assert.equal(c.anthropic.model, 'claude-opus-5-5');
});

test('only the hackathon Qloo host is accepted', () => {
  assert.equal(loadConfig({ QLOO_BASE_URL: 'https://hackathon.api.qloo.com/' }).qloo.baseUrl, 'https://hackathon.api.qloo.com');
  for (const url of ['https://api.qloo.com', 'https://staging.api.qloo.com', 'http://hackathon.api.qloo.com', 'https://hackathon.api.qloo.com.evil.test']) {
    assert.match(problemsFor({ QLOO_BASE_URL: url }).join('\n'), /QLOO_BASE_URL/, url);
  }
});

test('fixture mode only under NODE_ENV=test', () => {
  assert.equal(loadConfig({ QLOO_MODE: 'fixture', NODE_ENV: 'test' }).qloo.mode, 'fixture');
  assert.match(problemsFor({ QLOO_MODE: 'fixture' }).join('\n'), /NODE_ENV=test/);
  assert.match(problemsFor({ QLOO_MODE: 'fixture', NODE_ENV: 'production' }).join('\n'), /NODE_ENV=test/);
  assert.match(problemsFor({ QLOO_MODE: 'mock' }).join('\n'), /QLOO_MODE/);
});

test('rejects non-loopback hosts and malformed numbers, listing every problem', () => {
  const problems = problemsFor({ HOST: '0.0.0.0', PORT: 'abc', DAILY_USD_CAP: '-1', IP_DAILY_LIMIT: '2.5', AGENT_MODE: 'turbo' });
  assert.equal(problems.length, 5);
  assert.match(problems.join('\n'), /HOST/);
  assert.match(problems.join('\n'), /PORT/);
  assert.match(problems.join('\n'), /DAILY_USD_CAP/);
  assert.match(problems.join('\n'), /IP_DAILY_LIMIT/);
  assert.match(problems.join('\n'), /AGENT_MODE/);
  assert.match(problemsFor({ PORT: '70000' }).join('\n'), /PORT/);
});

test('error messages never echo API keys', () => {
  const err = (() => { try { loadConfig({ QLOO_API_KEY: 'qk-secret-123', ANTHROPIC_API_KEY: 'ak-secret-456', HOST: '0.0.0.0' }); } catch (e) { return e; } })();
  assert.ok(err instanceof ConfigError);
  assert.doesNotMatch(err.message, /secret/);
});

test('effective Qloo mode', () => {
  assert.equal(effectiveQlooMode(loadConfig({})), 'no-key');
  assert.equal(effectiveQlooMode(loadConfig({ QLOO_API_KEY: 'k' })), 'live');
  assert.equal(effectiveQlooMode(loadConfig({ QLOO_MODE: 'fixture', NODE_ENV: 'test' })), 'fixture');
});

test('effective agent mode never reports live without a key', () => {
  assert.equal(effectiveAgentMode(loadConfig({})), 'scripted');
  assert.equal(effectiveAgentMode(loadConfig({}), { hasRecordedRuns: true }), 'recorded');
  assert.equal(effectiveAgentMode(loadConfig({ AGENT_MODE: 'live' })), 'scripted');
  assert.equal(effectiveAgentMode(loadConfig({ ANTHROPIC_API_KEY: 'k' })), 'live');
  assert.equal(effectiveAgentMode(loadConfig({ ANTHROPIC_API_KEY: 'k', AGENT_MODE: 'scripted' })), 'scripted');
  assert.equal(effectiveAgentMode(loadConfig({ ANTHROPIC_API_KEY: 'k', AGENT_MODE: 'recorded' }), { hasRecordedRuns: true }), 'recorded');
  assert.equal(effectiveAgentMode(loadConfig({ AGENT_MODE: 'recorded' })), 'scripted');
});
