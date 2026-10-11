import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config.js';
import { buildApp } from '../server/app.js';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'dnd-test-'));
test.after(() => rm(tmp, { recursive: true, force: true }));

async function appWith(env) {
  return buildApp(loadConfig({ DATA_DIR: path.join(tmp, 'var'), VENUES_DIR: path.join(tmp, 'none'), ...env }));
}

test('health without keys: Qloo not connected, scripted agent, default caps', async () => {
  const app = await appWith({});
  const res = await app.inject('/api/health');
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.qloo, 'no-key');
  assert.equal(body.agent, 'scripted');
  assert.deepEqual(body.budget, { day_usd: 0, total_usd: 0, day_cap: 2, total_cap: 30 });
  assert.equal(typeof body.version, 'string');
  await app.close();
});

test('health reports recorded mode when a recorded run exists', async () => {
  const dataDir = path.join(tmp, 'rec');
  await mkdir(path.join(dataDir, 'recorded'), { recursive: true });
  await writeFile(path.join(dataDir, 'recorded', 'run.json'), '{}');
  const app = await appWith({ DATA_DIR: dataDir });
  assert.equal((await app.inject('/api/health')).json().agent, 'recorded');
  await app.close();
});

test('health never exposes keys', async () => {
  const app = await appWith({ QLOO_API_KEY: 'qk-secret-123' });
  const res = await app.inject('/api/health');
  assert.equal(res.json().qloo, 'live');
  assert.doesNotMatch(res.body, /secret/);
  await app.close();
});

test('venues: missing directory gives an empty list', async () => {
  const app = await appWith({});
  assert.deepEqual((await app.inject('/api/venues')).json(), []);
  await app.close();
});

test('venues: synthetic fixture is listed with the public summary fields only', async () => {
  const app = await appWith({ VENUES_DIR: 'test/fixtures/synthetic/venues' });
  assert.deepEqual((await app.inject('/api/venues')).json(), [{
    id: 'example-room', name: 'Example Room', city: 'Exampleville', capacity_band: '250-500',
    calendar_source_url: 'https://example.org/calendar',
  }]);
  await app.close();
});

test('venues: unreadable files are skipped', async () => {
  const dir = path.join(tmp, 'mixed');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'a.json'), '{"id":"a","name":"A"}');
  await writeFile(path.join(dir, 'b.json'), '{not json');
  await writeFile(path.join(dir, 'c.json'), '{"name":"no id"}');
  await writeFile(path.join(dir, 'notes.txt'), 'ignored');
  const app = await appWith({ VENUES_DIR: dir });
  assert.deepEqual((await app.inject('/api/venues')).json().map((v) => v.id), ['a']);
  await app.close();
});

test('serves the static page at /', async () => {
  const app = await appWith({});
  const res = await app.inject('/');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.body, /Dark Night Desk/);
  assert.match(res.body, /fill the nights your venue sits empty/);
  await app.close();
});
