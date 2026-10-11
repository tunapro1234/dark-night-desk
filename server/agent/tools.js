// Agent tools. The live agent, the scripted planner and /api/ablate all go through these, so every mode makes the same
// Qloo calls. Each tool returns plain JSON; the session keeps every output (the validator checks the final answer
// against them), every Qloo call and every fallback. A tool that needs an earlier step runs it first.
import { nightsFor } from '../calendar/nights.js';
import { venueSummary } from '../calendar/venues.js';
import { ablate } from '../rank/ablate.js';
import { alsoLoves, neutralSignal } from '../rank/lift.js';
import { buildPool, buildSignal, normalizeName } from '../rank/pool.js';
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

/**
 * The note to an act's booking agent for one night. Never sent; no fee, ticket or capacity estimate, a blank guarantee.
 * @param {{ venue: { name: string, city: string, capacity_band: string }, day: string, act: { entity_id: string, name: string },
 *   contributors?: { name: string }[] }} args
 */
export function offerNote({ venue, day, act, contributors = [] }) {
  return {
    to: OFFER_TO,
    entity_id: act.entity_id,
    subject: `Date inquiry: ${act.name} at ${venue.name}, ${day}`,
    body: [
      'Hi,',
      '',
      `We have ${day} open at ${venue.name} in ${venue.city} and would like to talk about ${act.name} for that night.`,
      '',
      whySentence(act.name, contributors, { voice: 'our' }),
      '',
      `Room: ${venue.name}, ${venue.city} (capacity band ${venue.capacity_band})`,
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
 *   emit?: (label: string) => void }} args `emit` receives the plain-English step labels.
 */
export function createSession({ qloo, venues, venue, date, emit = () => {} }) {
  return { qloo, venues, venue, date, emit, log: [], calls: [], fallbacks: [], steps: [], state: {} };
}

/** Outputs only: the agent's own inputs never count as a source for its numbers or ids. */
export const toolOutputs = (session) => session.log.map((x) => x.output);

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
    const night = nightsFor(s.venue, s.date, 1).nights[0];
    const past = (s.venue.past_shows ?? [])
      .filter((x) => x.date < s.date)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, SIGNAL_LIMIT);
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
    const r = take(s, await buildSignal(s.qloo, s.venue, { before: s.date, limit: SIGNAL_LIMIT }));
    s.state.signal = r;
    return { signal: r.signal, counts: r.counts, needs_input: r.needs_input, unresolved: r.unresolved.map((u) => u.name) };
  },

  async build_pool(s, { window = 'season' } = {}) {
    const signal = await need(s, 'signal');
    step(s, window === 'week' ? `Keeping it to acts who played ${s.venue.city} that week` : `Keeping it to acts who played ${s.venue.city} this season`);
    const r = take(s, await buildPool(s.qloo, { venue: s.venue, venues: s.venues, date: s.date, window, excludeIds: signal.signal.map((x) => x.entity_id) }));
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
    step(s, `Switching off ${remove.length} past show${remove.length === 1 ? '' : 's'}`);
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
    description: 'Build the closed pool: headliners who played other rooms in the same city this season (90 days before to 60 days after the night). Acts from this room\'s own past program are left out.',
    input_schema: { type: 'object', properties: { window: { type: 'string', enum: ['season', 'week'] } }, additionalProperties: false },
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
