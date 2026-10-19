// Agent tools. The live agent, the scripted planner and /api/ablate all go through these, so every mode makes the same
// Qloo calls. Each tool returns plain JSON; the session keeps every output (the validator checks the final answer
// against them), every Qloo call and every fallback. A tool that needs an earlier step runs it first.
import { nightsFor } from '../calendar/nights.js';
import { listedUntil, venueSummary } from '../calendar/venues.js';
import { ablate } from '../rank/ablate.js';
import { alsoLoves, neutralSignal } from '../rank/lift.js';
import { buildPool, buildSignal, normalizeName, splitHeadliner } from '../rank/pool.js';
import { SHORTLIST_SIZE, contributions, rankPool, topN } from '../rank/rank.js';

export const TOOL_NAMES = Object.freeze(['read_calendar', 'resolve_entities', 'build_pool', 'rank_pool', 'explain', 'ablate', 'also_loves', 'draft_offer']);
export const OFFER_TO = "artist's booking agent";
const SIGNAL_LIMIT = 40;
const RANKED_SHOWN = 15;
const POOL_SHOWN = 60;
const SMALL_ROOM_MAX = 1000;
// Popularity ceiling for rooms up to SMALL_ROOM_MAX: a 300-cap room does not get an arena headliner. This is a product
// choice only: the back-test (BACKTEST.md, "Fixed choices") applies no popularity limit and tunes nothing.
export const SMALL_ROOM_POPULARITY_MAX = 0.9;
// A signal of fewer resolved past headliners than the acts on the card is "thin": the live agent may say so instead of
// ranking. A product choice (the shortlist size), not a tuned or measured number.
export const THIN_SIGNAL_BELOW = SHORTLIST_SIZE;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Thursday, November 12" for a YYYY-MM-DD date (UTC). */
export function longDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Popularity ceiling from the room's capacity band ("250-500"); none for big rooms or an unreadable band. */
export function popularityMaxFor(capacityBand) {
  const nums = String(capacityBand ?? '').match(/\d+/g)?.map(Number) ?? [];
  if (!nums.length) return undefined;
  return Math.max(...nums) <= SMALL_ROOM_MAX ? SMALL_ROOM_POPULARITY_MAX : undefined;
}

/**
 * The one-sentence reason for an act. A and B are the two past shows that contribute most to the act's score.
 * The poster card speaks to the booker ("Your crowd came for ..."); the offer note speaks for the room to the
 * artist's booking agent ("Our crowd came for ...").
 * @param {string} act
 * @param {{ name: string }[]} contributors most important first
 * @param {{ voice?: 'your' | 'our' }} [opts]
 */
export function whySentence(act, contributors, { voice = 'your' } = {}) {
  const crowd = voice === 'our' ? 'Our crowd' : 'Your crowd';
  const [a, b] = contributors.map((c) => c.name).filter(Boolean);
  if (a && b) return `${crowd} came for ${a} and ${b}. ${act} sits right between them.`;
  if (a) return `${crowd} came for ${a}. ${act} draws on the same taste.`;
  return voice === 'our' ? `${act} ranks high against our room's past program.` : `${act} ranks high against this room's past program.`;
}

const TYPE_PLURAL = { movie: 'films', place: 'places', brand: 'brands' };

/** The also_loves row with the largest lift (lower end of the range first), or undefined. */
export const strongestAlsoLoves = (rows = []) =>
  [...rows].sort((a, b) => b.lift_range[0] - a.lift_range[0] || b.lift_range[1] - a.lift_range[1])[0];

// Scripted card lines, a few plain wordings per case. Each says only what explain's shares carry: which past shows
// lead the match and whether one, two or many of them drive it.
const ONE_SHOW_LINES = [
  (act, a) => `Most of this match comes from one past show, ${a}. ${act} draws on the same taste.`,
  (act, a) => `${act} leans on one past show above the rest: ${a}.`,
  (act, a) => `One past show drives most of this pick: ${a}. ${act} follows that taste.`,
];
const TWO_SHOW_LINES = [
  (act, a, b) => whySentence(act, [{ name: a }, { name: b }]),
  (act, a, b) => `${a} and ${b} carry most of this match. ${act} draws on both.`,
  (act, a, b) => `${act} comes mostly out of two past shows in your program: ${a} and ${b}.`,
  (act, a, b) => `${act} points back to your nights with ${a} and ${b}.`,
];
const SPREAD_LINES = [
  (act, a, b) => `No single past show drives this one; it is spread across your program, led by ${a} and ${b}.`,
  (act, a, b) => `${act} fits your program as a whole rather than one past show; ${a} and ${b} lead the list.`,
  (act, a, b) => `This match is spread across your past shows. ${a} and ${b} count most, but neither carries it alone.`,
];

/** The same act always gets the same wording: a string hash of its name, no randomness. */
const pickLine = (lines, act) => lines[[...String(act)].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) >>> 0, 7) % lines.length];

/**
 * Scripted plan only: the card line, worded by what drove the pick in explain's output. One past show with more than
 * half of the match gets a one-show line; two shows that together hold more than half get an A-and-B line; a match
 * spread wider is said to be spread. Within each case the wording is picked by a hash of the act's name, so a card of
 * five acts does not read five times the same. `also` (the strongest also_loves row) adds one fact about the room's crowd.
 * Names and categories come from tool outputs; the line carries no number.
 * @param {string} act
 * @param {{ name: string | null, share: number }[]} contributors most important first, as explain lists them
 * @param {{ also?: { type: string, category: string } }} [opts]
 */
export function scriptedWhy(act, contributors, { also } = {}) {
  const named = contributors.filter((c) => c.name);
  const [a, b] = named;
  let line;
  if (!a) line = whySentence(act, []);
  else if (!b) line = whySentence(act, [a]);
  else if (a.share > 0.5) line = pickLine(ONE_SHOW_LINES, act)(act, a.name);
  else if (a.share + b.share > 0.5) line = pickLine(TWO_SHOW_LINES, act)(act, a.name, b.name);
  else line = pickLine(SPREAD_LINES, act)(act, a.name, b.name);
  if (also?.category) line += ` This room's crowd also leans to ${also.category} ${TYPE_PLURAL[also.type] ?? 'picks'}, more than the city's average room.`;
  return line;
}

/**
 * The note to an act's booking agent for one night. Never sent; no fee, ticket or capacity estimate, a blank guarantee.
 * The note names where the room is (`locality`, else `city`).
 * @param {{ venue: { name: string, city: string, locality?: string, capacity_band: string }, day: string, act: { entity_id: string, name: string },
 *   contributors?: { name: string }[] }} args
 */
export function offerNote({ venue, day, act, contributors = [] }) {
  const where = venue.locality || venue.city;
  return {
    to: OFFER_TO,
    entity_id: act.entity_id,
    subject: `Date inquiry: ${act.name} at ${venue.name}, ${day}`,
    body: [
      'Hi,',
      '',
      `We have ${day} open at ${venue.name} in ${where} and would like to talk about ${act.name} for that night.`,
      '',
      whySentence(act.name, contributors, { voice: 'our' }),
      '',
      `Room: ${venue.name}, ${where} (capacity band ${venue.capacity_band})`,
      `Date: ${day}`,
      'Guarantee: ___',
      '',
      'If the date works, could you let us know the routing and what you would need from us?',
      '',
      'Thanks,',
    ].join('\n'),
    sent: false,
  };
}

/**
 * @param {{ qloo: ReturnType<import('../qloo/client.js').createQlooClient>, venues: object[], venue: object, date: string,
 *   today?: string, emit?: (label: string) => void }} args `emit` receives the plain-English step labels.
 *   `today` (live product) anchors the pool to the last 90 days and leaves out acts already booked into town.
 */
export function createSession({ qloo, venues, venue, date, today, answers = [], emit = () => {} }) {
  return { qloo, venues, venue, date, today, answers, emit, log: [], calls: [], fallbacks: [], steps: [], state: {} };
}

/** The room's past shows before the night, most recent first (the order buildSignal reads them in). */
const pastShowsBefore = (venue, date) =>
  (venue.past_shows ?? []).filter((x) => x.date < date).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

/**
 * The booker's answers to "Which one played here?" applied to a buildSignal result. A picked candidate joins the signal
 * in show order (most recent first); "none of these" (entity_id null) counts as not found. An id that is not one of
 * that name's candidates is ignored, so an answer can only choose among what the taste-graph search returned.
 * @param {Awaited<ReturnType<typeof buildSignal>>} r
 * @param {{ name: string, entity_id: string | null }[]} answers
 * @param {string[]} titles the room's past headliners, most recent first
 * @param {number} [limit]
 */
export function applyAnswers(r, answers, titles, limit = SIGNAL_LIMIT) {
  const byName = new Map((answers ?? []).map((a) => [normalizeName(a.name), a.entity_id ?? null]));
  const answered = [];
  const needsInput = [];
  const picked = new Map();
  const none = [];
  for (const q of r.needs_input) {
    const k = normalizeName(q.name);
    const id = byName.get(k);
    const c = q.candidates.find((x) => x.entity_id === id);
    if (!byName.has(k) || (id !== null && !c)) {
      needsInput.push(q);
      continue;
    }
    answered.push({ name: q.name, entity_id: c?.entity_id ?? null, picked: c?.name ?? null });
    if (c) picked.set(k, { entity_id: c.entity_id, name: c.name });
    else none.push({ name: q.name, reason: 'booker_none' });
  }
  if (!answered.length) return { ...r, answered };
  // A resolved artist has the same normalized name as its title (or the title's head), so the show order can be rebuilt.
  const byArtist = new Map(r.signal.map((x) => [normalizeName(x.name), x]));
  const signal = [];
  const seen = new Set();
  const add = (e) => {
    if (e && !seen.has(e.entity_id)) {
      seen.add(e.entity_id);
      signal.push(e);
    }
  };
  for (const t of titles) add(picked.get(normalizeName(t)) ?? byArtist.get(normalizeName(t)) ?? byArtist.get(normalizeName(splitHeadliner(t))));
  r.signal.forEach(add);
  return {
    ...r,
    signal: signal.slice(0, limit),
    counts: { ...r.counts, resolved: r.counts.resolved + picked.size, needs_input: needsInput.length, unresolved: r.counts.unresolved + none.length, answered: answered.length },
    needs_input: needsInput,
    unresolved: [...r.unresolved, ...none],
    answered,
  };
}

/**
 * "Which one played here?" for one ambiguous past headliner from resolve_entities (needs_input): up to 3 candidates
 * from the taste-graph search and the dates the name played this room. Null when the name is not waiting for an answer.
 */
export function bookerQuestion(session, name) {
  const q = (session.state.signal?.needs_input ?? []).find((x) => normalizeName(x.name) === normalizeName(name));
  if (!q) return null;
  const dates = pastShowsBefore(session.venue, session.date).filter((x) => normalizeName(x.headliner) === normalizeName(q.name)).map((x) => x.date);
  return { name: q.name, candidates: q.candidates.slice(0, 3).map((c) => ({ entity_id: c.entity_id, name: c.name })), played_here: dates };
}

/**
 * Outputs only: the agent's own inputs never count as a source for its numbers or ids. That includes the parts of an
 * output that only echo the input back: an unknown tool's name, and the ids ablate ignored.
 */
export const toolOutputs = (session) =>
  session.log
    .filter((x) => x.output?.error?.code !== 'unknown_tool')
    .map(({ tool, output }) => (tool === 'ablate' && output && 'ignored' in output ? { ...output, ignored: undefined } : output));

function step(session, label) {
  session.steps.push(label);
  session.emit(label);
}

const take = (session, r) => {
  session.calls.push(...(r.calls ?? []));
  session.fallbacks.push(...(r.fallbacks ?? []));
  return r;
};

async function need(session, key) {
  if (session.state[key] === undefined) await runTool(session, PREREQ[key]);
  return session.state[key];
}
const PREREQ = { calendar: 'read_calendar', signal: 'resolve_entities', pool: 'build_pool', ranking: 'rank_pool', explained: 'explain' };

const nameIndex = (session) => {
  const m = new Map();
  for (const s of session.state.signal?.signal ?? []) m.set(s.entity_id, s.name);
  for (const p of session.state.pool?.pool ?? []) m.set(p.entity_id, p.name);
  return m;
};

class ToolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const IMPL = {
  async read_calendar(s) {
    const night = nightsFor(s.venue, s.date, 1, { today: s.today, listedUntil: listedUntil(s.venue) }).nights[0];
    const past = pastShowsBefore(s.venue, s.date).slice(0, SIGNAL_LIMIT);
    step(s, `Reading your last ${past.length} shows`);
    const out = {
      venue: venueSummary(s.venue),
      night: { date: s.date, day: longDate(s.date), status: night.status },
      past_shows_read: past.length,
      past_shows: past.map((x) => ({ date: x.date, headliner: x.headliner })),
      source: { url: s.venue.calendar_source_url, read_at: s.venue.read_at },
    };
    s.state.calendar = out;
    return out;
  },

  async resolve_entities(s) {
    await need(s, 'calendar');
    step(s, 'Looking those acts up in the taste graph');
    const titles = pastShowsBefore(s.venue, s.date).map((x) => x.headliner);
    const r = applyAnswers(take(s, await buildSignal(s.qloo, s.venue, { before: s.date, limit: SIGNAL_LIMIT })), s.answers, titles);
    for (const a of r.answered) step(s, `Asked you: which ${a.name}?`);
    s.state.signal = r;
    const thin = r.signal.length < THIN_SIGNAL_BELOW;
    return {
      signal: r.signal, counts: r.counts, needs_input: r.needs_input, unresolved: r.unresolved.map((u) => u.name),
      ...(r.answered.length ? { answered_by_booker: r.answered } : {}),
      ...(thin ? { thin: { resolved: r.signal.length, below: THIN_SIGNAL_BELOW, note: 'fewer past headliners were found than acts on the card' } } : {}),
    };
  },

  async build_pool(s) {
    const signal = await need(s, 'signal');
    step(
      s,
      s.today !== undefined
        ? `Keeping it to acts who played ${s.venue.city} in the last 90 days, with no date announced in town`
        : `Keeping it to acts who played ${s.venue.city} this season`,
    );
    const r = take(
      s,
      await buildPool(s.qloo, { venue: s.venue, venues: s.venues, date: s.date, today: s.today, excludeIds: signal.signal.map((x) => x.entity_id) }),
    );
    s.state.pool = r;
    s.state.ranking = undefined;
    s.state.explained = undefined;
    return {
      city: r.city,
      window: r.window,
      rooms: r.rooms,
      counts: r.counts,
      pool: r.pool.slice(0, POOL_SHOWN).map((p) => ({ entity_id: p.entity_id, name: p.name, played: p.played.map((x) => x.date) })),
      ...(r.pool.length > POOL_SHOWN ? { note: `first ${POOL_SHOWN} of ${r.pool.length} acts listed` } : {}),
    };
  },

  async rank_pool(s) {
    const signal = await need(s, 'signal');
    const pool = await need(s, 'pool');
    const popularityMax = popularityMaxFor(s.venue.capacity_band);
    step(s, 'Sizing to your room');
    step(s, 'Finding acts your crowd also loves');
    const r = take(s, await rankPool(s.qloo, { signalIds: signal.signal.map((x) => x.entity_id), poolIds: pool.pool, popularityMax }));
    s.state.ranking = { ...r, popularityMax };
    s.state.explained = undefined;
    if (r.error) throw new ToolError(r.error.code, r.error.message);
    const played = new Map(pool.pool.map((p) => [p.entity_id, p.played.map((x) => x.date)]));
    return {
      method: r.method,
      sizing: { capacity_band: s.venue.capacity_band, popularity_max: popularityMax ?? null,
        note: 'fits a room your size (popularity proxy, not a ticket forecast)' },
      ranked: topN(r.results, RANKED_SHOWN).map((x) => ({ rank: x.rank, entity_id: x.entity_id, name: x.name, played: played.get(x.entity_id) ?? [] })),
      scored: topN(r.results, Infinity).length,
      pool_size: r.results.length,
    };
  },

  async explain(s, { entity_ids } = {}) {
    const signal = await need(s, 'signal');
    const pool = await need(s, 'pool');
    const ranking = await need(s, 'ranking');
    const top = topN(ranking.results);
    const scored = new Set(topN(ranking.results, Infinity).map((x) => x.entity_id));
    const targets = (entity_ids?.length ? entity_ids : top.map((x) => x.entity_id)).filter((id) => scored.has(id));
    if (!targets.length) throw new ToolError('unknown_entities', 'none of these acts is in the ranked pool');
    step(s, 'Checking which past shows point to each act');
    const r = await contributions(s.qloo, {
      signalIds: signal.signal.map((x) => x.entity_id), poolIds: pool.pool, ranking, targetIds: targets, popularityMax: ranking.popularityMax,
    });
    s.calls.push(...r.calls);
    const names = nameIndex(s);
    const acts = targets.map((id) => {
      const contribs = (r.contributions[id] ?? []).filter((c) => c.share > 0).map((c) => ({ entity_id: c.entity_id, name: names.get(c.entity_id) ?? null, share: c.share }));
      return { entity_id: id, name: names.get(id) ?? null, method: r.method, contributions: contribs,
        suggested_why: whySentence(names.get(id) ?? 'This act', contribs),
        suggested_offer_line: whySentence(names.get(id) ?? 'This act', contribs, { voice: 'our' }),
      };
    });
    s.state.explained = { ...(s.state.explained ?? {}), ...Object.fromEntries(acts.map((a) => [a.entity_id, a])) };
    return { method: r.method, ...(r.note ? { note: r.note } : {}), acts };
  },

  async ablate(s, { remove = [] } = {}) {
    const signal = await need(s, 'signal');
    const pool = await need(s, 'pool');
    const ranking = await need(s, 'ranking');
    // The step counts the past shows actually switched off, not what the caller sent (unknown ids are ignored).
    const off = new Set((Array.isArray(remove) ? remove : []).filter((id) => signal.signal.some((x) => x.entity_id === id))).size;
    step(s, `Switching off ${off} past show${off === 1 ? '' : 's'}`);
    const r = take(s, await ablate(s.qloo, {
      signalIds: signal.signal.map((x) => x.entity_id), poolIds: pool.pool, removeIds: remove, baseline: ranking.results, popularityMax: ranking.popularityMax,
    }));
    const names = nameIndex(s);
    const out = {
      shortlist: r.shortlist.map((x) => ({ rank: x.rank, entity_id: x.entity_id, name: x.name })),
      changed: r.changed,
      of: r.of,
      removed: r.removed.map((id) => ({ entity_id: id, name: names.get(id) ?? null })),
      ignored: r.ignored,
      method: r.method,
    };
    if (r.error) out.error = r.error;
    return out;
  },

  async also_loves(s) {
    const signal = await need(s, 'signal');
    step(s, 'Looking at the films, places and brands this crowd likes');
    const rooms = s.venues.filter((v) => normalizeName(v.city) === normalizeName(s.venue.city));
    const lists = [];
    for (const v of rooms) {
      if (v.id === s.venue.id) lists.push(signal.signal.map((x) => x.entity_id));
      else lists.push(take(s, await buildSignal(s.qloo, v, { before: s.date, limit: SIGNAL_LIMIT })).signal.map((x) => x.entity_id));
    }
    const r = take(s, await alsoLoves(s.qloo, { roomSignalIds: signal.signal.map((x) => x.entity_id), neutralSignalIds: neutralSignal(lists) }));
    s.state.alsoLoves = r.also_loves;
    return {
      also_loves: r.also_loves.map(({ type, category, lift_range, evidence }) => ({ type, category, lift_range, depths: evidence.depths })),
      city_rooms: rooms.length,
    };
  },

  async draft_offer(s, { entity_id } = {}) {
    const calendar = await need(s, 'calendar');
    const ranking = await need(s, 'ranking');
    const act = ranking.results.find((x) => x.entity_id === entity_id && x.score !== null);
    if (!act) throw new ToolError('unknown_entity', 'draft_offer needs an act from the ranked pool');
    if (!s.state.explained?.[entity_id]) await runTool(s, 'explain', { entity_ids: [entity_id] });
    step(s, `Drafting a note to ${act.name}'s booking agent`);
    const note = offerNote({
      venue: calendar.venue, day: calendar.night.day, act: { entity_id, name: act.name }, contributors: s.state.explained?.[entity_id]?.contributions ?? [],
    });
    s.state.offer = note;
    return note;
  },
};

/**
 * Run one tool and keep its output in the session. Failures come back as `{ error: { code, message } }` so the agent
 * can read them; they are kept in the log too.
 */
export async function runTool(session, name, input = {}) {
  const t0 = Date.now();
  let output;
  if (!Object.hasOwn(IMPL, name)) output = { error: { code: 'unknown_tool', message: `no tool named "${name}"` } };
  else {
    try {
      output = await IMPL[name](session, input ?? {});
    } catch (err) {
      if (!(err instanceof ToolError)) throw err;
      output = { error: { code: err.code, message: err.message } };
    }
  }
  session.log.push({ tool: name, input: input ?? {}, output, ms: Date.now() - t0 });
  return output;
}

const noInput = { type: 'object', properties: {}, additionalProperties: false };

/** Tool definitions for the Messages API. */
export const TOOL_DEFS = Object.freeze([
  { name: 'read_calendar', description: "Read the room's public calendar: the chosen night and the most recent past shows (the room's own crowd).", input_schema: noInput },
  { name: 'resolve_entities', description: "Match the room's past headliners to taste-graph artists. Ambiguous names are listed under needs_input, not guessed.", input_schema: noInput },
  {
    name: 'build_pool',
    description:
      "Build the closed pool: headliners who played other rooms in the same city in the last 90 days. Acts from this room's own past program, and acts with a show already announced in the city from today on, are left out.",
    input_schema: noInput,
  },
  { name: 'rank_pool', description: "Rank the pool against the room's past headliners, sized to the room. Returns the ranked acts; only these may be shortlisted.", input_schema: noInput },
  {
    name: 'explain',
    description: 'For ranked acts (default: the top 5), which past shows contribute most, with a suggested one-sentence reason.',
    input_schema: { type: 'object', properties: { entity_ids: { type: 'array', items: { type: 'string' } } }, additionalProperties: false },
  },
  {
    name: 'ablate',
    description: 'Switch off some past shows (signal entity ids) and see how the top 5 changes.',
    input_schema: { type: 'object', properties: { remove: { type: 'array', items: { type: 'string' } } }, required: ['remove'], additionalProperties: false },
  },
  { name: 'also_loves', description: "Film, place and brand categories this room's crowd likes more than the city's average room, as a lift range.", input_schema: noInput },
  {
    name: 'draft_offer',
    description: "Draft a first note to the act's booking agent for this night. Never sent; the booker copies it. No fee, ticket or capacity numbers.",
    input_schema: { type: 'object', properties: { entity_id: { type: 'string' } }, required: ['entity_id'], additionalProperties: false },
  },
]);

export { SHORTLIST_SIZE };
