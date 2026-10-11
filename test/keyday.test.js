import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { REPO_ROOT } from '../server/config.js';
import { createQlooClient } from '../server/qloo/client.js';
import { runKeyday } from '../scripts/keyday.js';

const show = (date, n) => ({ date, headliner: `Synthetic Act ${n}`, source_url: 'https://example.org/show' });
const devA = {
  id: 'synthetic-room-a', name: 'Example Room', city: 'Exampleville', geo: { lat: 0.001, lon: -0.001 },
  keyday: { genre_query: 'genre' },
  shows: [show('2026-02-01', 101), show('2026-03-01', 102), show('2026-04-01', 103), show('2026-05-01', 104),
    show('2026-08-01', 1), show('2026-09-01', 3)],
};
const devB = {
  id: 'synthetic-room-b', name: 'Second Example Room', city: 'Exampleville',
  shows: [show('2026-02-10', 105), show('2026-03-10', 106), show('2026-08-10', 2), show('2026-09-10', 4), show('2026-10-10', 5)],
};
const placebo = { id: 'synthetic-room-c', name: 'Other City Room', city: 'Otherville', shows: [show('2026-03-15', 106), show('2026-04-15', 105)] };

test('keyday without QLOO_API_KEY prints "no key" and exits 2', () => {
  const env = { ...process.env };
  delete env.QLOO_API_KEY;
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/keyday.js')], { env, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /no key/);
});

test('keyday runs 30 numbered probes and reports numbers only', async () => {
  let fetched = 0;
  const client = createQlooClient({ mode: 'fixture', fetchImpl: async () => { fetched++; return new Response('{}'); } });
  const s = await runKeyday({ client, venues: [devA, devB], placebo });
  assert.equal(fetched, 0);
  assert.deepEqual(s.calls.map((c) => c.n), Array.from({ length: 30 }, (_, i) => i + 1));
  const by = Object.fromEntries(s.calls.map((c) => [c.n, c]));
  assert.equal(by[7].ok, true);
  assert.equal(by[8].explained > 0, true);
  assert.equal(by[11].ok, true);
  assert.equal(by[12].status, 'skipped');
  assert.equal(by[20].status, 'skipped');
  assert.equal(by[24].ok, true, 'wrong-type parameter must be blocked');
  assert.equal(by[24].sent, false);
  assert.equal(by[25].cache, 'hit');
  for (const n of [26, 27, 28, 29, 30]) assert.equal(typeof by[n].rr, 'number', `call ${n}`);
  assert.equal(s.go.decision, 'GO');
  const text = JSON.stringify(s);
  assert.doesNotMatch(text, /Synthetic|synthetic-|Example/, 'summary must not carry names or ids');
});

test('keyday is NO-GO when base insights are empty', async () => {
  const client = createQlooClient({ mode: 'fixture', fixturesDir: path.join(REPO_ROOT, 'test', 'fixtures', 'synthetic', 'venues') });
  const s = await runKeyday({ client, venues: [devA] });
  assert.equal(s.go.decision, 'NO-GO');
  assert.equal(s.calls.length, 30);
});
