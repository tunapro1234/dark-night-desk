// scripts/import-venues.js on a tiny synthetic venues.csv, shows.csv and listing. Offline: no network, no Qloo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isPlannable, loadVenues } from '../server/calendar/venues.js';
import { buildImport, calendarUrlOf, capacityBand, csvHeadliner, displayName, main, NOT_PUBLISHED } from '../scripts/import-venues.js';
import { checkData2 } from '../server/backtest/study2-data.js';
import { parseCsv } from '../server/backtest/data.js';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'dnd-import-'));
test.after(() => rm(tmp, { recursive: true, force: true }));

const VENUES_CSV = [
  'venue_id,name,operator,cluster,metro,tz,capacity,role,building,calendar_source',
  'room-a,Synthetic Room A,Operator A,op-a,Exampleville,America/New_York,300,test,,https://web.archive.org/ copies of https://a.example.test/calendar',
  'hall-b,Synthetic Hall B,Operator B,op-b,Exampleville,America/New_York,,pool,Synthetic House B,https://b.example.test/events/<slug>/ pages and https://b.example.test/archive',
  'house-b,Synthetic House B,Operator B,op-b,Exampleville,America/New_York,,pool,Synthetic House B,https://b.example.test/archive',
  'empty-c,Synthetic Room C,Operator C,op-c,Exampleville,America/New_York,,pool,,https://c.example.test/',
  'room-d,Synthetic Room D,Operator D,op-d,Otherville,America/Chicago,500,test,,https://d.example.test/',
  'room-e,Synthetic Room E,Operator E,op-e,Otherville,America/Chicago,,pool,,https://e.example.test/',
].join('\n');

const field = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const SHOWS_CSV = [
  'venue_id,start,date,title,performers,canceled,drop_reason,source_url,fetched_at,compiled_by,checked_by',
  ...[
    ['room-a', '2026-07-01T20:00', '2026-07-01', 'Synthetic Act 1 / Synthetic Act 2', JSON.stringify(['Synthetic Act 1', 'Synthetic Act 2']), '0', ''],
    ['room-a', '2026-07-02T20:00', '2026-07-02', 'Summer Night', JSON.stringify(['Synthetic Room A', 'Synthetic Act 3']), '0', ''],
    ['room-a', '2026-07-03T20:00', '2026-07-03', 'Synthetic Act 4 with Guests', '', '0', ''],
    ['room-a', '2026-07-04T20:00', '2026-07-04', 'Synthetic Act 5', '', '1', ''],
    ['room-a', '2026-07-05T20:00', '2026-07-05', 'Synthetic Act 6', '', '0', 'off-site'],
    ['room-a', '2026-07-06T20:00', '2026-07-06', '', '', '0', ''],
    ['room-a', '2026-07-07T20:00', '2026-07-07', 'Synthetic Act 7', '', '0', ''],
    ['room-a', '2026-07-07T22:00', '2026-07-07', 'Synthetic Act 7', '', '0', ''],
    ['hall-b', '2026-07-08T20:00', '2026-07-08', 'Synthetic Act 8', '', '0', ''],
    ['house-b', '2026-07-09T20:00', '2026-07-09', 'Synthetic Act 9', '', '0', ''],
    ['empty-c', '2026-07-10T20:00', '2026-07-10', 'Synthetic Act 10', '', '1', ''],
    ['room-d', '2026-07-11T20:00', '2026-07-11', 'Synthetic Act 11', '', '0', ''],
    ['room-e', '2026-07-12T20:00', '2026-07-12', 'Synthetic Act 12', '', '0', ''],
  ].map((r, i) => [...r, `https://archive.example.test/${i}`, i === 8 ? '2026-10-17' : '2026-10-18', 'test', ''].map(field).join(',')),
].join('\n');

const LISTING = {
  venue_id: 'room-a',
  calendar_source_url: 'https://a.example.test/calendar',
  read_at: '2026-10-19T01:00:00Z',
  listed_until: '2026-12-31',
  complete: true,
  shows: [
    { date: '2026-10-10', headliner: 'Synthetic Act 20', source_url: 'https://a.example.test/e/20' },
    { date: '2026-10-19', headliner: 'Synthetic Act 21', source_url: 'https://a.example.test/e/21' },
    { date: '2026-11-02', headliner: 'Synthetic Act 22', source_url: 'https://a.example.test/e/22' },
    { date: '2026-11-02', headliner: 'synthetic act 22', source_url: 'https://a.example.test/e/22b' },
  ],
};

const data = () => checkData2({ venues: parseCsv(VENUES_CSV), shows: parseCsv(SHOWS_CSV) });

test('headliner of a shows.csv row: performer candidate (not the room), else the title', () => {
  const room = parseCsv(VENUES_CSV)[0];
  const [r1, r2, r3, , , r6] = parseCsv(SHOWS_CSV);
  assert.equal(csvHeadliner(r1, room), 'Synthetic Act 1');
  assert.equal(csvHeadliner(r2, room), 'Synthetic Act 3');
  assert.equal(csvHeadliner(r3, room), 'Synthetic Act 4 with Guests');
  assert.equal(csvHeadliner(r6, room), null);
});

test('venues.csv fields: name with building, capacity ceiling, plain calendar URL', () => {
  const [a, b, house] = parseCsv(VENUES_CSV);
  assert.equal(displayName(a), 'Synthetic Room A');
  assert.equal(displayName(b), 'Synthetic Hall B (Synthetic House B)');
  assert.equal(displayName(house), 'Synthetic House B');
  assert.equal(capacityBand(a), 'up to 300');
  assert.equal(capacityBand(b), NOT_PUBLISHED);
  assert.equal(calendarUrlOf(a.calendar_source), 'https://a.example.test/calendar');
  assert.equal(calendarUrlOf(b.calendar_source), 'https://b.example.test/archive');
  assert.equal(calendarUrlOf('no address here'), null);
});

test('plannable room: shows from the listing, past from shows.csv plus listed past rows; neighbours of the same metro only', () => {
  const { plannable, neighbours, skipped } = buildImport(data(), [LISTING]);
  assert.equal(plannable.length, 1);
  const p = plannable[0];
  assert.equal(p.id, 's2-room-a');
  assert.equal(p.city, 'Exampleville');
  assert.equal(p.listing_complete, true);
  assert.equal(p.listed_until, '2026-12-31');
  assert.deepEqual(p.closed_weekdays, []);
  assert.deepEqual(p.shows.map((s) => [s.date, s.headliner]), [['2026-10-19', 'Synthetic Act 21'], ['2026-11-02', 'Synthetic Act 22']]);
  assert.deepEqual(p.past_shows.map((s) => [s.date, s.headliner]), [
    ['2026-07-01', 'Synthetic Act 1'],
    ['2026-07-02', 'Synthetic Act 3'],
    ['2026-07-03', 'Synthetic Act 4 with Guests'],
    ['2026-07-07', 'Synthetic Act 7'],
    ['2026-10-10', 'Synthetic Act 20'],
  ]);
  assert.equal(p.past_shows[0].source_url, 'https://archive.example.test/0');

  assert.deepEqual(neighbours.map((n) => n.id).sort(), ['s2-hall-b', 's2-house-b']);
  for (const n of neighbours) {
    assert.equal(n.listing_complete, false);
    assert.deepEqual(n.shows, []);
    assert.equal(n.city, 'Exampleville');
    assert.equal(isPlannable(n), false);
  }
  const hall = neighbours.find((n) => n.id === 's2-hall-b');
  assert.equal(hall.read_at, '2026-10-17');
  assert.equal(hall.calendar_source_url, 'https://b.example.test/archive');
  assert.deepEqual(skipped, [{ venue_id: 'empty-c', reason: 'no show rows in shows.csv' }]);
});

test('listing_complete is true only when the caller says so', () => {
  const { complete, ...rest } = LISTING;
  assert.equal(buildImport(data(), [rest]).plannable[0].listing_complete, false);
  assert.equal(buildImport(data(), [{ ...LISTING, complete: false }]).plannable[0].listing_complete, false);
  assert.throws(() => buildImport(data(), [{ ...LISTING, complete: 'yes' }]), /complete, when present/);
});

test('locality: an optional listing field, printed instead of the metro; city stays the metro', () => {
  const p = buildImport(data(), [{ ...LISTING, locality: ' Synthetic Town ' }]).plannable[0];
  assert.equal(p.city, 'Exampleville');
  assert.equal(p.locality, 'Synthetic Town');
  assert.deepEqual(Object.keys(p).slice(0, 4), ['id', 'name', 'city', 'locality']);
  assert.ok(!('locality' in buildImport(data(), [LISTING]).plannable[0]));
  assert.throws(() => buildImport(data(), [{ ...LISTING, locality: ' ' }]), /locality, when present/);
  assert.throws(() => buildImport(data(), [{ ...LISTING, locality: 7 }]), /locality, when present/);
});

test('two listed rooms of one metro: neither becomes the other one\'s neighbour', () => {
  const second = { ...LISTING, venue_id: 'hall-b', complete: false, shows: [] };
  const { plannable, neighbours } = buildImport(data(), [LISTING, second]);
  assert.deepEqual(plannable.map((p) => p.id), ['s2-room-a', 's2-hall-b']);
  assert.deepEqual(neighbours.map((n) => n.id), ['s2-house-b']);
});

test('bad listings are refused', () => {
  const bad = (patch, re) => assert.throws(() => buildImport(data(), [{ ...LISTING, ...patch }]), re);
  bad({ venue_id: 'nowhere' }, /not in venues\.csv/);
  bad({ listed_until: '2026-10-01' }, /listed_until is before read_at/);
  bad({ calendar_source_url: 'calendar' }, /calendar_source_url/);
  bad({ shows: [{ date: '2027-01-02', headliner: 'Synthetic Act 30', source_url: 'https://a.example.test/e/30' }] }, /after listed_until/);
  bad({ shows: [{ date: '2026-11-31', headliner: 'Synthetic Act 30', source_url: 'https://a.example.test/e/30' }] }, /date must be/);
  bad({ shows: [{ date: '2026-11-03', headliner: ' ', source_url: 'https://a.example.test/e/30' }] }, /headliner is required/);
  assert.throws(() => buildImport(data(), [LISTING, LISTING]), /given twice/);
});

test('CLI: dry run writes nothing; --write writes files loadVenues accepts and keeps the old file as .old', async () => {
  const dataDir = path.join(tmp, 'backtest2');
  const outDir = path.join(tmp, 'venues');
  await mkdir(dataDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(dataDir, 'venues.csv'), VENUES_CSV);
  await writeFile(path.join(dataDir, 'shows.csv'), SHOWS_CSV);
  const listingFile = path.join(tmp, 'room-a.json');
  await writeFile(listingFile, JSON.stringify(LISTING));
  const other = { id: 'fa-synthetic', _synthetic: true };
  await writeFile(path.join(outDir, 'fa-synthetic.json'), JSON.stringify(other));

  const logs = [];
  const errors = [];
  const io = { log: (x) => logs.push(x), error: (x) => errors.push(x) };
  assert.equal(await main(['--data-dir', dataDir, '--out', outDir, listingFile], io), 0);
  assert.deepEqual((await readdir(outDir)).sort(), ['fa-synthetic.json']);
  const dry = JSON.parse(logs.at(-1));
  assert.match(dry.mode, /dry run/);
  assert.deepEqual(dry.files.map((f) => [f.role, f.file]), [['plannable', 's2-room-a.json'], ['neighbour', 's2-hall-b.json'], ['neighbour', 's2-house-b.json']]);

  assert.equal(await main(['--data-dir', dataDir, '--out', outDir, '--write', listingFile], io), 0);
  const venues = await loadVenues(outDir, { onSkip: () => {} });
  assert.deepEqual(venues.map((v) => v.id).sort(), ['s2-hall-b', 's2-house-b', 's2-room-a']);
  assert.equal(venues.filter(isPlannable).map((v) => v.id).join(), 's2-room-a');
  const text = await readFile(path.join(outDir, 's2-room-a.json'), 'utf8');
  assert.match(text, /^[\x00-\x7F]*$/);

  // A neighbour run never replaces a plannable file; the plannable file replaced by a new import is kept as .old.
  const hallListing = path.join(tmp, 'hall-b.json');
  await writeFile(hallListing, JSON.stringify({ ...LISTING, venue_id: 'hall-b', shows: [] }));
  assert.equal(await main(['--data-dir', dataDir, '--out', outDir, '--write', hallListing], io), 0);
  const second = JSON.parse(logs.at(-1));
  assert.deepEqual(second.kept, [{ id: 's2-room-a', reason: 'a plannable file is already there' }]);
  assert.equal(JSON.parse(await readFile(path.join(outDir, 's2-room-a.json'), 'utf8')).listing_complete, true);
  assert.equal(JSON.parse(await readFile(path.join(outDir, 's2-hall-b.json'), 'utf8')).listing_complete, true);
  assert.equal(JSON.parse(await readFile(path.join(outDir, 's2-hall-b.json.old'), 'utf8')).listing_complete, false);
  assert.ok(!(await readdir(outDir)).some((n) => n.endsWith('.tmp')));

  // A locality set in the file survives a re-import whose listing has none; a listed locality replaces it.
  const roomFile = path.join(outDir, 's2-room-a.json');
  await writeFile(roomFile, JSON.stringify({ ...JSON.parse(await readFile(roomFile, 'utf8')), locality: 'Synthetic Town' }));
  assert.equal(await main(['--data-dir', dataDir, '--out', outDir, '--write', listingFile], io), 0);
  const again = JSON.parse(await readFile(roomFile, 'utf8'));
  assert.equal(again.locality, 'Synthetic Town');
  assert.equal(again.city, 'Exampleville');
  await writeFile(listingFile, JSON.stringify({ ...LISTING, locality: 'Synthetic Village' }));
  assert.equal(await main(['--data-dir', dataDir, '--out', outDir, '--write', listingFile], io), 0);
  assert.equal(JSON.parse(await readFile(roomFile, 'utf8')).locality, 'Synthetic Village');
  assert.ok((await loadVenues(outDir, { onSkip: () => {} })).some((v) => v.id === 's2-room-a' && v.locality === 'Synthetic Village'));

  // Usage errors exit 1 with a message.
  assert.equal(await main(['--out', outDir], io), 1);
  assert.match(errors.at(-1), /at least one listing/);
  assert.equal(await main(['--data-dir', dataDir, '--out', path.join(tmp, 'missing'), listingFile], io), 1);
  assert.match(errors.at(-1), /does not exist/);
});
