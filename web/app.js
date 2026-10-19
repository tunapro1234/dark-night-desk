// Dark Night Desk front end. Plain browser JavaScript, no framework and no outside scripts.
// First screen: the room's next 60 nights. A dark night opens the plan (streamed steps, then the poster card);
// everything technical (shares, requests, timings) sits behind "why?".

const $ = (id) => document.getElementById(id);

/** Small DOM builder; text always goes in as text nodes, never as HTML. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

// ---------- dates (calendar dates are plain YYYY-MM-DD, read in UTC so the weekday never shifts) ----------
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parseDay = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
const shortDay = (iso) => {
  const d = parseDay(iso);
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const posterDay = (iso) => shortDay(iso).toUpperCase();
const monthDay = (iso) => {
  const d = parseDay(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const fullDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};

// ---------- mode labels (always on screen) ----------
function agentLabel(agent, recordedAt) {
  if (agent === 'idle') return 'Agent: idle';
  if (agent === 'idle-no-qloo') return 'Agent: idle (Qloo not connected)';
  if (agent === 'working') return 'Agent: planning';
  if (agent === 'live') return 'Agent: live (Claude)';
  if (agent === 'recorded') return recordedAt ? `Agent: recorded run from ${fullDate(recordedAt)}` : 'Agent: recorded run';
  if (agent === 'scripted') return 'Agent: fixed steps, no AI writing';
  return 'Agent: unknown';
}
function qlooLabel(qloo, recordedAt) {
  if (qloo === 'live') return 'Qloo: live';
  if (qloo === 'recorded') return recordedAt ? `Qloo: recorded ${fullDate(recordedAt)}` : 'Qloo: recorded';
  if (qloo === 'no-key') return 'Qloo: not connected';
  if (qloo === 'fixture') return 'Qloo: synthetic test data';
  return 'Qloo: unknown';
}
const AGENT_HINT = {
  idle: 'No plan is running. Pick a dark night to start one.',
  'idle-no-qloo': 'This server has no Qloo key, so no plan can run. Only nights with a recorded run can show a card.',
  live: 'Claude chooses the steps and writes the sentences. Every name and number is checked against the tool results.',
  recorded: 'A saved run of the live agent for this room and night, played back. No Claude call is made now.',
  scripted: 'A fixed sequence of the same steps, with no language model. Shown when no live or recorded run is available.',
};
const QLOO_HINT = {
  live: 'Rankings come from the Qloo taste graph.',
  recorded: 'The Qloo results on this card were saved with the run on that date. No Qloo request is made now.',
  'no-key': 'This server has no Qloo key, so it ranks nothing.',
  fixture: 'Test mode: hand-written synthetic data, not real artists or Qloo results.',
};

function setBadges(agent, qloo, recordedAt) {
  const a = $('badge-agent');
  a.textContent = agentLabel(agent, recordedAt);
  a.dataset.mode = agent ?? '';
  a.title = AGENT_HINT[agent] ?? '';
  const q = $('badge-qloo');
  q.textContent = qlooLabel(qloo, recordedAt);
  q.dataset.mode = qloo ?? '';
  q.title = QLOO_HINT[qloo] ?? '';
}

// Plain words for the reasons a plan stepped down to another mode.
const FALLBACK_WORDS = {
  daily_cap: "today's spend cap for Claude is used up",
  total_cap: 'the total spend cap for Claude is used up',
  monthly_cap: "this month's spend cap for Claude is used up",
  key_expired: 'the Claude key for this demo has expired',
  ip_daily_limit: "this address has used today's live runs",
  rejected: "Claude's answer did not pass the name and number check twice",
  llm_error: 'the Claude request failed',
  max_turns: 'Claude did not finish in time',
  max_tokens: 'Claude ran out of room for its answer',
  refusal: 'Claude declined to answer',
};
const isAgentFallback = (f) => f && (f.step === 'agent' || f.step === 'agent mode');

// Before a night is picked (or when nothing can run) the agent badge says idle; a mode label appears only on a result.
// With Qloo off, a room with no recorded run can show no card at all.
function idleBadges(noPlanCanRun = qlooOff() && !state.recorded.some((x) => x.venue_id === state.venueId)) {
  if (!state.health) return;
  setBadges(noPlanCanRun ? 'idle-no-qloo' : 'idle', state.health.qloo);
}

// ---------- state ----------
const state = {
  health: null,
  venues: [],
  venueId: null,
  calendar: null,
  date: null,
  result: null,
  off: new Set(),
  planAbort: null,
  ablateSeq: 0,
  whyOpener: null,
  recorded: [],
  // The booker's answers to the agent's "Which one played here?" for the night being planned.
  answers: [],
  // Bumped on every booked-night pick, so a slow crowd answer for an earlier pick is dropped.
  crowdSeq: 0,
  // Cards shown in this visit, by cardKey(room, night): the latest plan result for that night (live, scripted or replayed).
  cards: new Map(),
  // Recorded runs read in this visit, by cardKey(room, night): the GET's promise, and its result once it came back.
  recordedReads: new Map(),
};
const qlooOff = () => state.health?.qloo === 'no-key';
const recordedRun = (venueId, date) => state.recorded.find((x) => x.venue_id === venueId && x.date === date) ?? null;
// A recorded run that opens on a card (a thin run opens on "too little to rank on" instead).
const recordedCard = (venueId, date) => {
  const run = recordedRun(venueId, date);
  return run && !run.thin ? run : null;
};

const cardKey = (venueId, date) => `${venueId}|${date}`;

/** GET one recorded run (no Claude or Qloo call in any mode), read at most once per visit; a failed read can be tried again. */
function readRecorded(venueId, date) {
  const key = cardKey(venueId, date);
  let entry = state.recordedReads.get(key);
  if (!entry) {
    entry = { result: null };
    entry.promise = getJSON(`/api/recorded/${encodeURIComponent(venueId)}/${encodeURIComponent(date)}`).then(
      (r) => (entry.result = r),
      (err) => {
        state.recordedReads.delete(key);
        throw err;
      },
    );
    state.recordedReads.set(key, entry);
  }
  return entry.promise;
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
  return body;
}

// ---------- calendar strip ----------
function showCalendarNotice(text) {
  const n = $('calendar-notice');
  n.textContent = text;
  n.hidden = !text;
}

// The room picked on first load when the server has it (the room in the first-screen #scene line); otherwise the first venue.
const DEFAULT_VENUE = 'fa-turf-club';
const WINDOW_NIGHTS = 60;
// The room's size after its city: nothing when the venue publishes none (or it is unknown), and no "about" before "up to ...".
const sizeLine = (band) => {
  if (!band || band === 'not published' || band === 'unknown') return '';
  return ` \u00b7 room for ${/^up to /.test(band) ? '' : 'about '}${band}`;
};

async function loadCalendar(venueId) {
  state.venueId = venueId;
  state.calendar = null;
  resetNight();
  $('dark-count').textContent = 'Reading the calendar';
  $('strip').replaceChildren();
  $('source-chip').hidden = true;
  showCalendarNotice('');
  $('copy-week-status').textContent = '';
  $('week-text').hidden = true;
  updateCopyWeek();
  const v = state.venues.find((x) => x.id === venueId);
  $('venue-meta').textContent = v ? `${v.locality || v.city}${sizeLine(v.capacity_band)}` : '';
  try {
    // Today plus the next 60 nights: today is shown (too late to plan), the 60 nights from tomorrow are the window.
    const cal = await getJSON(`/api/venues/${encodeURIComponent(venueId)}/calendar?days=${WINDOW_NIGHTS + 1}`);
    if (state.venueId !== venueId) return;
    state.calendar = cal;
    renderCalendar(cal);
  } catch (err) {
    if (state.venueId !== venueId) return;
    $('dark-count').textContent = 'The calendar could not be read';
    $('dark-sub').textContent = 'open nights with no show announced on the public calendar';
    showCalendarNotice(`${err.message}. Reload the page to try again.`);
  }
}

function renderCalendar(cal) {
  const n = cal.dark_count;
  // Dark nights are counted from tomorrow (today's night is too late to book) up to the last date the calendar was read for.
  const days = cal.nights.filter((x) => !x.today && x.status !== 'past' && x.status !== 'unlisted').length;
  $('dark-count').textContent = n === 0 ? `No dark nights in the next ${days} days` : `${n} dark night${n === 1 ? '' : 's'} in the next ${days} days`;
  $('dark-sub').textContent =
    n === 0 ? 'every open night on this public calendar already has a show announced' : 'open nights with no show announced on the public calendar';
  $('legend-unlisted').hidden = !cal.nights.some((x) => x.status === 'unlisted');
  $('legend-closed').hidden = !cal.nights.some((x) => x.status === 'closed');
  const recordedNights = cal.nights.filter((x) => x.status === 'dark' && recordedCard(cal.venue?.id ?? state.venueId, x.date));
  $('legend-recorded').hidden = !recordedNights.length;
  // With Qloo off, a recorded night is the only kind that opens on a card; with Qloo on, a plan may run live instead.
  $('legend-recorded-text').textContent = qlooOff() ? 'recorded run: opens a saved card, no Qloo needed' : 'a recorded run is saved for this night';
  // A booked night shows the room's crowd from Qloo, or with Qloo off from a recorded run of this room; else it has none to show.
  const crowdShown = !qlooOff() || state.recorded.some((x) => x.venue_id === (cal.venue?.id ?? state.venueId) && !x.thin);
  $('legend-booked-text').textContent = crowdShown ? "show announced: pick one to see this room's crowd" : 'show announced';

  const chip = $('source-chip');
  if (cal.source?.url) {
    chip.href = cal.source.url;
    chip.textContent = `venue's public calendar, read ${cal.source.read_at ? monthDay(cal.source.read_at) : 'recently'}`;
    chip.hidden = false;
  }

  const strip = $('strip');
  const items = cal.nights.map((night, i) => {
    const d = parseDay(night.date);
    // Today's cell carries the "today" tag where the month label would sit, so the month moves to the next cell.
    const showMonth = !night.today && (i === 0 || d.getUTCDate() === 1 || cal.nights[i - 1]?.today);
    const label = h('span', { class: 'd', 'aria-hidden': 'true' }, String(d.getUTCDate()));
    const month = showMonth ? h('span', { class: 'm', 'aria-hidden': 'true' }, MONTHS[d.getUTCMonth()]) : null;
    const todayTag = night.today ? h('span', { class: 't', 'aria-hidden': 'true' }, 'today') : null;
    if (night.status === 'dark') {
      const rec = recordedCard(state.venueId, night.date);
      return h('li', {},
        h('button', {
          type: 'button', class: `sq sq-dark sq-pick${rec ? ' sq-rec' : ''}`, 'data-date': night.date, tabindex: '-1', 'aria-pressed': 'false',
          'aria-label': `${shortDay(night.date)}, dark night${rec ? ', recorded run' : ''}`, onclick: () => pickNight(night.date),
        }, month, label, rec ? h('span', { class: 'r', 'aria-hidden': 'true' }) : null));
    }
    if (night.status === 'booked' && !night.today) {
      // A booked night has nothing to plan; picking it shows this room's crowd rows without starting a plan.
      const said = `${shortDay(night.date)}, show announced: ${night.show?.headliner ?? 'a show'}`;
      return h('li', {},
        h('button', {
          type: 'button', class: 'sq sq-booked sq-pick', 'data-date': night.date, tabindex: '-1', 'aria-pressed': 'false', title: said,
          // The spoken label promises the crowd only where the legend does (crowdShown).
          'aria-label': crowdShown ? `${said}. Show this room's crowd` : said, onclick: () => pickBooked(night),
        }, month, label));
    }
    const what = {
      booked: `show announced: ${night.show?.headliner ?? 'a show'}`,
      closed: 'closed that weekday',
      today: 'nothing booked, too late to plan',
      past: 'already past',
      unlisted: 'past the last date the calendar was read for',
    }[night.status] ?? night.status;
    const said = `${night.today ? 'Today, ' : ''}${shortDay(night.date)}, ${what}`;
    return h('li', {},
      h('span', { class: `sq sq-${night.status}${night.today ? ' sq-is-today' : ''}`, role: 'img', title: said, 'aria-label': said }, month, todayTag, label));
  });
  strip.replaceChildren(...items);
  const first = strip.querySelector('.sq-dark') ?? strip.querySelector('.sq-pick');
  if (first) first.tabIndex = 0;
  // The week's recorded runs are read now, so "Copy this week" has their cards in hand and the click makes no request.
  const venueId = cal.venue?.id ?? state.venueId;
  for (const night of weekNights()) {
    if (night.status === 'dark' && recordedCard(venueId, night.date)) readRecorded(venueId, night.date).then(updateCopyWeek, () => {});
  }
  updateCopyWeek();
  if (qlooOff() && state.recorded.length) {
    // One line, so a phone still sees the strip and the card below it: only this room's nights (the picker names the room;
    // the key hour records two nights in every room). "for" the night, since the badge's "from" is the day it was saved.
    const here = state.recorded.filter((x) => x.venue_id === (cal.venue?.id ?? state.venueId)).map((x) => x.date).sort().map(shortDay);
    showCalendarNotice(here.length
      ? `Recorded run${here.length === 1 ? '' : 's'} for ${here.join(', ')}; other nights need Qloo.`
      : 'No recorded run for this room; its nights need Qloo.');
    $('night-empty-text').textContent =
      'Choose one of the dark squares above. A night with a recorded run shows that run; any other night tells you why there is no list.';
  } else if (qlooOff()) {
    showCalendarNotice(
      'Qloo: not connected. This server has no Qloo key, so it ranks no acts and shows no shortlist. ' +
        'What still works: the calendar and its dark nights for every room, and the back-test button at the top.',
    );
    $('night-empty-text').textContent =
      "Choose one of the dark squares above. With Qloo connected, the Desk reads this room's past shows and lines up five acts " +
      'who played the city this season. Without it, picking a night tells you why there is no list.';
  }
}

// Arrow keys move between the nights that can be picked (dark and booked); only one of them is in the tab order at a time.
function onStripKey(e) {
  const buttons = [...$('strip').querySelectorAll('.sq-pick')];
  const i = buttons.indexOf(document.activeElement);
  if (i < 0) return;
  let j = i;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = Math.min(buttons.length - 1, i + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = Math.max(0, i - 1);
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = buttons.length - 1;
  else return;
  e.preventDefault();
  buttons[i].tabIndex = -1;
  buttons[j].tabIndex = 0;
  buttons[j].focus();
}

// ---------- "Copy this week" ----------
const WEEK_NIGHTS = 7;
/** The next 7 nights after today on the strip. */
const weekNights = () => (state.calendar?.nights ?? []).filter((x) => !x.today && x.status !== 'past').slice(0, WEEK_NIGHTS);

/** The week's dark nights that have a card in hand: a plan shown in this visit, else a recorded run already read. */
function weekCards() {
  return weekNights().filter((night) => night.status === 'dark').map((night) => {
    const key = cardKey(state.venueId, night.date);
    const r = state.cards.get(key) ?? (recordedCard(state.venueId, night.date) ? state.recordedReads.get(key)?.result : null);
    return r && !r.thin_signal && r.shortlist?.length ? { date: night.date, r } : null;
  }).filter(Boolean);
}

function updateCopyWeek() {
  const b = $('copy-week');
  const n = weekCards().length;
  b.disabled = !n;
  b.title = n ? `Copy the card${n === 1 ? '' : 's'} for ${n} of the next ${WEEK_NIGHTS} nights as plain text` : `No card yet for the next ${WEEK_NIGHTS} nights`;
}

/** Plain text per night: the date, the acts in order, the first pick's reason line, the mode badges' text. */
function weekText(cards) {
  const v = state.venues.find((x) => x.id === state.venueId);
  const nights = weekNights();
  const head = `${v?.name ?? 'This room'}: ${cards.length} night${cards.length === 1 ? '' : 's'} with a card, ${monthDay(nights[0].date)} to ${monthDay(nights.at(-1).date)}`;
  const blocks = cards.map(({ date, r }) => {
    const top = r.shortlist[0];
    return [
      shortDay(date),
      ...r.shortlist.map((a) => `${a.rank}. ${a.name ?? 'Unnamed act'}`),
      top.why ? `Why ${top.name ?? 'the first pick'}: ${top.why}` : null,
      `${agentLabel(r.mode?.agent, r.mode?.recorded_at)} \u00b7 ${qlooLabel(r.mode?.qloo, r.mode?.recorded_at)}`,
    ].filter(Boolean).join('\n');
  });
  return [head, ...blocks].join('\n\n');
}

/** Copies the week's cards; no request is made. Without clipboard access the text is shown selected instead. */
async function copyWeek() {
  const cards = weekCards();
  if (!cards.length) return;
  const text = weekText(cards);
  const box = $('week-text');
  box.hidden = true;
  try {
    await navigator.clipboard.writeText(text);
    $('copy-week-status').textContent = `Copied ${cards.length} night${cards.length === 1 ? '' : 's'}. Paste it anywhere.`;
  } catch {
    box.value = text;
    box.hidden = false;
    box.focus();
    box.select();
    $('copy-week-status').textContent = 'Select all and copy with your keyboard.';
  }
}

function markPicked(date) {
  for (const b of $('strip').querySelectorAll('.sq-pick')) {
    const on = b.dataset.date === date;
    b.setAttribute('aria-pressed', String(on));
    if (on) {
      for (const o of $('strip').querySelectorAll('.sq-pick')) o.tabIndex = -1;
      b.tabIndex = 0;
    }
  }
}

// ---------- night panel states ----------
function show(which) {
  for (const id of ['night-empty', 'progress', 'fail', 'poster', 'crowd']) $(id).hidden = id !== which;
  $('ask').hidden = true;
}

function resetNight() {
  state.crowdSeq++;
  state.planAbort?.abort();
  state.planAbort = null;
  state.date = null;
  state.result = null;
  state.off.clear();
  closeWhy(false);
  show('night-empty');
  idleBadges();
}

function showFail(title, text, canRetry = true) {
  $('fail-title').textContent = title;
  $('fail-text').textContent = text;
  $('retry').hidden = !canRetry;
  show('fail');
}

function addStep(label) {
  const list = $('steps');
  for (const li of list.children) li.className = 'done';
  list.append(h('li', { class: 'now' }, label));
}

/** On a phone the night panel sits below the strip, out of view after a tap; focus stays on the night (arrow keys). */
function reveal(id) {
  $(id).scrollIntoView?.({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

async function pickNight(date, answers = []) {
  state.crowdSeq++;
  state.planAbort?.abort();
  closeWhy(false);
  state.date = date;
  state.answers = answers;
  state.result = null;
  state.off.clear();
  markPicked(date);
  if (qlooOff() && !recordedRun(state.venueId, date)) {
    idleBadges(true);
    showFail(
      `${shortDay(date)} stays open for now`,
      'Qloo: not connected. Without the Qloo taste graph the Desk has no honest way to rank acts, so it shows no list instead of a made-up one.',
      false,
    );
    reveal('fail');
    return;
  }
  $('progress-title').textContent = `Planning ${shortDay(date)}`;
  $('steps').replaceChildren();
  show('progress');
  reveal('progress');
  setBadges('working', state.health?.qloo);
  const ctrl = new AbortController();
  state.planAbort = ctrl;
  try {
    await streamPlan({ venue_id: state.venueId, date, ask: true, answers }, ctrl.signal);
  } catch (err) {
    if (ctrl.signal.aborted) return;
    idleBadges();
    showFail('The plan stopped', `${err.message || 'The connection dropped'}. Try again in a moment.`);
  }
}

/** POST /api/plan and read the server-sent events from the response body. */
async function streamPlan(body, signal) {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `the server answered ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      let payload = {};
      try {
        payload = data ? JSON.parse(data) : {};
      } catch {
        continue;
      }
      if (signal.aborted) return;
      if (event === 'step') addStep(payload.label ?? '');
      else if (event === 'result') return renderResult(payload);
      else if (event === 'question') return renderQuestion(payload);
      else if (event === 'error') return planError(payload);
    }
  }
  throw new Error('The connection closed before the plan was ready');
}

function planError(err) {
  if (err.code === 'qloo_not_connected') {
    state.health = { ...(state.health ?? {}), qloo: 'no-key' };
    idleBadges(true);
    showFail('Qloo: not connected', 'Without the Qloo taste graph the Desk ranks nothing, so there is no list for this night.', false);
    return;
  }
  idleBadges();
  showFail('No plan for this night', err.message || 'Something went wrong while planning.');
}

// ---------- the agent's question to the booker ----------
const listDays = (dates) => {
  const days = dates.map(monthDay);
  return days.length < 2 ? days.join('') : `${days.slice(0, -1).join(', ')} and ${days.at(-1)}`;
};

/** The live agent stopped to ask which artist an ambiguous past headliner was; the answer reruns the plan with it. */
function renderQuestion(q) {
  setBadges(q.mode?.agent, q.mode?.qloo);
  for (const li of $('steps').children) li.className = 'done';
  const { name, candidates = [], played_here: dates = [] } = q.question ?? {};
  $('ask-text').textContent =
    `"${name}" played here${dates.length ? ` on ${listDays(dates)}` : ''}. The taste graph has no exact match for that name, ` +
    'and the Desk does not guess. Which artist was it?';
  const answer = (entityId) => pickNight(state.date, [...state.answers, { name, entity_id: entityId }]);
  $('ask-options').replaceChildren(
    ...candidates.slice(0, 3).map((c) => h('button', { type: 'button', class: 'btn ask-option', onclick: () => answer(c.entity_id) }, c.name ?? c.entity_id)),
    h('button', { type: 'button', class: 'btn ask-option', onclick: () => answer(null) }, 'None of these'),
  );
  show('progress');
  $('ask').hidden = false;
}

// ---------- poster card ----------
const TYPE_WORDS = { movie: 'Films', place: 'Places', brand: 'Brands' };
// The brands row leads: it is the line a booker takes to a sponsor or an after-show partner.
const BRAND_LABEL = "Brand categories to pitch for this room's crowd";

/** also_loves rows, brands first, the others in the order they came; `i` stays the row's index in the result. */
const alsoOrder = (rows) => [...rows.entries()].sort(([i, a], [j, b]) => (a.type === 'brand' ? 0 : 1) - (b.type === 'brand' ? 0 : 1) || i - j);

/** The "This room's crowd also loves" list items; `source(row, i)` builds each row's source chip. */
function alsoItems(rows, source) {
  if (!rows.length) return [h('li', { class: 'also-none' }, "Nothing stands out against the city's average room for this crowd.")];
  return alsoOrder(rows).map(([i, row]) =>
    h('li', { class: row.type === 'brand' ? 'also-brand' : null },
      h('span', { class: row.type === 'brand' ? 'also-type also-pitch' : 'also-type' }, row.type === 'brand' ? BRAND_LABEL : TYPE_WORDS[row.type] ?? row.type),
      ' ',
      h('span', { class: 'also-cat' }, row.category),
      h('span', { class: 'also-lift' }, ": shows up more here than at the city's average room"),
      ' ',
      source(row, i),
    ));
}
const fmtLift = (n) => (Math.round(n * 100) / 100).toFixed(2);

/** build_pool's record of where and when an act played the city, grouped by room: "Played Room A, Jul 15 and Aug 12". */
function playedLine(played) {
  const byRoom = new Map();
  for (const p of played ?? []) {
    const room = p.venue ?? p.venue_id;
    if (!byRoom.has(room)) byRoom.set(room, []);
    byRoom.get(room).push(monthDay(p.date));
  }
  if (!byRoom.size) return null;
  return `Played ${[...byRoom].map(([room, days]) => `${room}, ${andList(days)}`).join('; ')}`;
}
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/**
 * The rooms whose calendars fed this night's pool (build_pool's `pool.rooms`: the other rooms in the city). Rooms a pick
 * played come first; names come from the picks' plays and the venue list, at most four, the rest counted.
 */
function poolLine(r) {
  const ids = r.pool?.rooms ?? [];
  if (!ids.length) return '';
  const names = new Map(state.venues.map((v) => [v.id, v.name]));
  const playedAt = new Set();
  for (const act of r.shortlist ?? []) {
    for (const p of act.played ?? []) {
      playedAt.add(p.venue_id);
      if (p.venue) names.set(p.venue_id, p.venue);
    }
  }
  const named = [...ids.filter((id) => playedAt.has(id)), ...ids.filter((id) => !playedAt.has(id))].filter((id) => names.has(id)).slice(0, 4);
  const rest = ids.length - named.length;
  const parts = named.map((id) => names.get(id));
  if (rest) parts.push(`${rest} ${named.length ? 'more' : 'other'} room${rest === 1 ? '' : 's'}`);
  return `Acts from the calendars of ${andList(parts)}`;
}

/** The ablate check the agent ran on a pick, from the ablate output: did the act stay in the top 5 without that show? */
function checkLine(act) {
  const c = act.check;
  if (!c) return null;
  const names = c.removed.map((x) => x.name ?? x.entity_id);
  const without = names.length === 1
    ? `${names[0]}, the past show this match draws on most`
    : `${names.join(' and ')} (with the past show this match draws on most)`;
  return c.in_top
    ? `Checked without ${without}: ${act.name} still ranks ${c.rank_without} of ${c.of}.`
    : `Checked without ${without}: ${act.name} drops out of the top ${c.of}, so this pick rests on that show.`;
}

function renderResult(r, { focus = true } = {}) {
  state.result = r;
  // The latest answer for a night wins: a thin-signal answer drops the card shown earlier for that night.
  const key = cardKey(r.venue?.id ?? state.venueId, r.night.date);
  if (r.shortlist?.length && !r.thin_signal) state.cards.set(key, r);
  else state.cards.delete(key);
  updateCopyWeek();
  setBadges(r.mode?.agent, r.mode?.qloo, r.mode?.recorded_at);
  for (const li of $('steps').children) li.className = 'done';
  if (r.thin_signal) {
    // The agent chose not to rank: too few of this room's past headliners were found to rank against.
    const t = r.thin_signal;
    showFail(
      `${shortDay(r.night.date)}: too little to rank on`,
      `Only ${t.found} of this room's past headliners ${t.found === 1 ? 'was' : 'were'} found in the taste graph (from ${t.shows} past shows), ` +
        `so the Desk shows no ranking. ${t.why}`,
      false,
    );
    return;
  }

  $('poster-venue').textContent = r.venue ? `${r.venue.name} \u00b7 ${r.venue.locality || r.venue.city}` : '';
  $('poster-date').textContent = posterDay(r.night.date);
  const pool = poolLine(r);
  $('poster-pool').textContent = pool;
  $('poster-pool').hidden = !pool;

  const lineup = (r.shortlist ?? []).map((act) =>
    h('li', { class: `act act-${act.rank}` },
      h('span', { class: 'act-name' }, act.name ?? 'Unnamed act'),
      playedLine(act.played) ? h('p', { class: 'act-played' }, playedLine(act.played)) : null,
      checkLine(act) ? h('p', { class: 'act-check' }, checkLine(act)) : null,
      h('p', { class: 'act-why' }, act.why,
        ' ',
        h('button', {
          type: 'button', class: 'why-link', 'aria-label': `why? ${act.name}`,
          onclick: (e) => openWhy(act.entity_id, e.currentTarget),
        }, 'why?'),
        offerFor(r, act.entity_id)
          ? [' ', h('button', {
              type: 'button', class: 'why-link offer-link', 'aria-haspopup': 'dialog', 'aria-label': `Draft offer to ${act.name}'s booking agent`,
              onclick: () => openOffer(act.entity_id),
            }, 'draft offer')]
          : null),
    ));
  if (!lineup.length) lineup.push(h('li', { class: 'act' }, h('p', { class: 'act-why' }, 'No act in this pool fits this room.')));
  $('lineup').replaceChildren(...lineup);

  $('also').hidden = false;
  $('also-list').replaceChildren(
    ...alsoItems(r.also_loves ?? [], (row, i) =>
      h('button', { type: 'button', class: 'why-link also-source', onclick: (e) => openWhy(null, e.currentTarget, `also-${i}`) }, 'source')),
  );

  $('draft-offer').hidden = !offerNotes(r).length;
  const fb = (r.fallbacks ?? []).filter(isAgentFallback);
  const note = $('fallback-note');
  note.hidden = !fb.length;
  note.textContent = fb.length ? `Ran as the ${fb.at(-1).used} because ${FALLBACK_WORDS[fb.at(-1).reason] ?? fb.at(-1).reason}.` : '';

  show('poster');
  if (focus) $('poster').focus?.();
}

// ---------- a booked night: this room's crowd, no plan ----------
/**
 * A booked night has nothing to plan. Picking it shows the room's "also loves" rows: from the Qloo taste graph when
 * Qloo is connected (no Claude call), else from the room's recorded run if it has one (no request to Qloo), else the
 * plain "Qloo: not connected" with nothing sent.
 */
async function pickBooked(night) {
  state.planAbort?.abort();
  state.planAbort = null;
  closeWhy(false);
  state.date = null;
  state.result = null;
  state.answers = [];
  state.off.clear();
  markPicked(night.date);
  idleBadges();
  const seq = ++state.crowdSeq;
  const venueId = state.venueId;
  const v = state.venues.find((x) => x.id === venueId);
  const current = () => seq === state.crowdSeq && venueId === state.venueId;
  $('crowd-venue').textContent = v ? `${v.name} \u00b7 ${v.locality || v.city}` : '';
  $('crowd-title').textContent = `${shortDay(night.date)}: ${night.show?.headliner ?? 'show announced'}`;
  // The second sentence is added only once rows are on screen (renderCrowd), so it never points at an empty panel.
  $('crowd-text').textContent = CROWD_BOOKED;
  $('crowd-also').hidden = true;
  $('crowd-list').replaceChildren();
  show('crowd');
  reveal('crowd');

  if (qlooOff()) {
    const run = state.recorded.find((x) => x.venue_id === venueId && !x.thin);
    if (!run) {
      $('crowd-note').textContent = 'Qloo: not connected. These rows come from the Qloo taste graph, so this server has none to show for this room and sends no request.';
      return;
    }
    $('crowd-note').textContent = 'Reading the recorded run';
    try {
      const r = await readRecorded(run.venue_id, run.date);
      if (!current()) return;
      renderCrowd(r.also_loves ?? []);
      const synthetic = r.mode?.qloo === 'fixture' ? ' (synthetic test data)' : '';
      $('crowd-note').textContent =
        `Qloo: not connected. These rows come from the recorded run for ${shortDay(run.date)}, saved ${fullDate(run.recorded_at)}${synthetic}; no Qloo request is made now.`;
    } catch (err) {
      if (current()) $('crowd-note').textContent = `Qloo: not connected, and the recorded run could not be read: ${err.message}.`;
    }
    return;
  }

  $('crowd-note').textContent = "Reading this room's crowd";
  try {
    const r = await getJSON(`/api/venues/${encodeURIComponent(venueId)}/crowd?date=${encodeURIComponent(night.date)}`);
    if (!current()) return;
    renderCrowd(r.also_loves ?? []);
    const calls = r.calls ?? [];
    const hits = calls.filter((c) => c.cache === 'hit').length;
    $('crowd-note').textContent = `${qlooLabel(r.mode?.qloo)}. ${calls.length} requests, ${hits} from cache; no Claude call.`;
  } catch (err) {
    if (current()) $('crowd-note').textContent = `This room's crowd could not be read: ${err.message}.`;
  }
}

const CROWD_BOOKED = 'A show is announced, so there is nothing to plan for this night; no plan is started.';
function renderCrowd(rows) {
  $('crowd-text').textContent =
    "A show is announced, so there is nothing to plan for this night. Below is what this room's crowd also loves, read from the room's past shows; no plan is started.";
  $('crowd-also').hidden = false;
  $('crowd-list').replaceChildren(
    ...alsoItems(rows, (row) => h('details', { class: 'also-src' }, h('summary', {}, 'source'), alsoEvidence(row))),
  );
}

// ---------- offer note ----------
// One note per shortlisted act (`offer_notes`); older recorded runs carry only `offer_note`, for the first pick.
const offerNotes = (r) => (r?.offer_notes?.length ? r.offer_notes : r?.offer_note ? [r.offer_note] : []);
const offerFor = (r, entityId) => offerNotes(r).find((n) => n.entity_id === entityId) ?? null;

function fillOffer(entityId) {
  const r = state.result;
  const note = offerFor(r, entityId) ?? offerNotes(r)[0];
  if (!note) return;
  const act = r.shortlist.find((a) => a.entity_id === note.entity_id);
  $('offer-act').value = note.entity_id;
  $('offer-to').textContent = `To: ${act?.name ?? note.name ?? 'the artist'}'s booking agent`;
  $('offer-subject').value = note.subject ?? '';
  $('offer-body').value = note.body ?? '';
  $('copy-status').textContent = '';
}

/** Open the note for one act; with no act given, the first pick. The picker in the dialog switches between acts. */
function openOffer(entityId) {
  const notes = offerNotes(state.result);
  if (!notes.length) return;
  const picker = $('offer-act');
  picker.replaceChildren(
    ...notes.map((n) => {
      const act = state.result.shortlist.find((a) => a.entity_id === n.entity_id);
      return h('option', { value: n.entity_id }, `${act?.rank ?? ''}. ${act?.name ?? n.name ?? 'Unnamed act'}`);
    }),
  );
  $('offer-act-row').hidden = notes.length < 2;
  fillOffer(typeof entityId === 'string' ? entityId : notes[0].entity_id);
  $('offer').showModal();
  $('offer-copy').focus();
}

async function copyOffer() {
  const text = `Subject: ${$('offer-subject').value}\n\n${$('offer-body').value}`;
  try {
    await navigator.clipboard.writeText(text);
    $('copy-status').textContent = 'Copied. Paste it into your own email.';
  } catch {
    const box = $('offer-body');
    box.focus();
    box.select();
    $('copy-status').textContent = 'Select all and copy with your keyboard.';
  }
}

// ---------- why? panel ----------
// A positive share that rounds to 0 is shown as "<1%", never as "0%".
const sharePct = (share) => (share > 0 && Math.round(share * 100) === 0 ? '<1%' : `${Math.round(share * 100)}%`);

function contributionBars(contribs) {
  const rows = contribs.slice(0, 8);
  const rowH = 36;
  const svg = s('svg', { viewBox: `0 0 320 ${rows.length * rowH + 4}`, role: 'img', class: 'bars', 'aria-label': 'Share of the match from each past show' });
  const max = Math.max(...rows.map((c) => c.share), 0.0001);
  rows.forEach((c, i) => {
    const y = i * rowH;
    const pct = sharePct(c.share);
    svg.append(
      s('text', { x: 0, y: y + 13, class: 'bar-label' }, c.name ?? c.entity_id),
      s('text', { x: 320, y: y + 13, class: 'bar-value', 'text-anchor': 'end' }, pct),
      s('rect', { x: 0, y: y + 19, width: 320, height: 9, rx: 2, class: 'bar-track' }),
      s('rect', { x: 0, y: y + 19, width: Math.max(2, (c.share / max) * 320), height: 9, rx: 2, class: 'bar-fill' }),
    );
  });
  const list = h('ul', { class: 'sr-only' }, rows.map((c) => h('li', {}, `${c.name}: ${sharePct(c.share)}`)));
  return [svg, list];
}

/** Every past show that points to any act on the card, strongest overall first. */
function pastShows(r) {
  const total = new Map();
  for (const act of r.shortlist ?? []) {
    for (const c of act.evidence?.contributions ?? []) {
      const prev = total.get(c.entity_id) ?? { entity_id: c.entity_id, name: c.name, share: 0 };
      prev.share += c.share;
      total.set(c.entity_id, prev);
    }
  }
  return [...total.values()].sort((a, b) => b.share - a.share);
}

function callsTable(calls) {
  if (!calls?.length) return h('p', { class: 'hint' }, 'No requests were made.');
  const hits = calls.filter((c) => c.cache === 'hit').length;
  const rows = calls.map((c) =>
    h('tr', {},
      h('td', {}, h('code', {}, c.endpoint)),
      h('td', {}, h('code', { class: 'params' }, Object.entries(c.params_masked ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'))),
      h('td', { class: 'num' }, `${c.ms} ms`),
      h('td', {}, h('span', { class: `cache cache-${c.cache}` }, c.cache === 'hit' ? 'cache hit' : 'cache miss')),
    ));
  return h('details', {},
    h('summary', {}, `${calls.length} requests \u00b7 ${hits} from cache \u00b7 ${calls.length - hits} sent to Qloo`),
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Endpoint'), h('th', { scope: 'col' }, 'Request (key left out)'), h('th', { scope: 'col' }, 'Time'), h('th', { scope: 'col' }, 'Cache'))),
        h('tbody', {}, rows))));
}

/** How one also_loves row was measured: the two shares at each depth and the Qloo requests behind it. */
function alsoEvidence(row, { id, focus = false } = {}) {
  const ev = row.evidence ?? {};
  const pct = (x) => `${Math.round(x * 100)}%`;
  const depths = ev.depths ?? [];
  const lines = depths.map((d, k) => `top ${d}: ${pct(ev.room_share?.[k] ?? 0)} for this room vs ${pct(ev.city_share?.[k] ?? 0)} for the city's average room`);
  return h('div', { class: `also-ev${focus ? ' focus' : ''}`, id },
    h('p', {}, h('strong', {}, `${TYPE_WORDS[row.type] ?? row.type}: ${row.category}`), ` \u00b7 lift ${fmtLift(row.lift_range[0])} to ${fmtLift(row.lift_range[1])}`),
    h('p', { class: 'hint' }, `${ev.measure ?? ''}. Signal: ${ev.signal_sizes?.room ?? '?'} acts from this room, ${ev.signal_sizes?.city ?? '?'} from the city's rooms.`),
    h('ul', {}, lines.map((l) => h('li', {}, l))),
    callsTable(ev.calls));
}

function renderAlsoEvidence(r, focusRow) {
  const rows = r.also_loves ?? [];
  $('why-also').hidden = !rows.length;
  $('why-also-body').replaceChildren(...alsoOrder(rows).map(([i, row]) => alsoEvidence(row, { id: `also-${i}`, focus: focusRow === `also-${i}` })));
}

function renderPool(r) {
  const p = r.pool;
  const out = [];
  if (p) {
    const c = p.counts ?? {};
    out.push(h('p', {}, `Acts who played ${p.city} this season (${p.window?.from ?? '?'} to ${p.window?.to ?? '?'}) at ${p.rooms?.length ?? 0} other room${p.rooms?.length === 1 ? '' : 's'}: ${c.pool ?? 0} in the pool.`));
    if (c.excluded_own_past) out.push(h('p', {}, `${c.excluded_own_past} left out because they already played this room.`));
    if (c.excluded_booked_ahead) out.push(h('p', {}, `${c.excluded_booked_ahead} left out because a ${p.city} date of theirs is already announced.`));
    if (c.needs_input || c.unresolved) out.push(h('p', {}, `${c.needs_input ?? 0} names were ambiguous and ${c.unresolved ?? 0} were not found; neither is guessed.`));
    out.push(h('p', { class: 'hint' }, `Ranking method: ${p.method ?? 'unknown'}.`));
  }
  if (r.signal) {
    const c = r.signal.counts ?? {};
    out.push(h('p', {}, `This room's crowd is read from its own past program: ${c.shows ?? '?'} shows, ${r.signal.size} acts found in the taste graph.`));
  }
  // On a replay the answer was given by whoever planned the night when the run was recorded, not by this viewer.
  const told = r.mode?.agent === 'recorded' ? 'When this run was recorded, the Desk was told' : 'You told the Desk';
  for (const a of r.answers ?? []) out.push(h('p', {}, `${told} which artist "${a.name}" was: ${a.picked ?? 'none of the matches'}.`));
  out.push(h('p', { class: 'hint' }, 'Sizing uses a popularity cap: a rough stand-in for draw; we have no ticket data.'));
  if (r.llm) out.push(h('p', { class: 'hint' }, `Claude: ${r.llm.model}, ${r.llm.turns} turns.`));
  $('why-pool').replaceChildren(...out);
}

function renderChips(r) {
  const chips = pastShows(r).map((p) =>
    h('button', {
      type: 'button', class: 'chip-toggle', 'data-id': p.entity_id, 'aria-pressed': String(!state.off.has(p.entity_id)),
      onclick: () => toggleShow(p.entity_id),
    }, p.name ?? p.entity_id));
  $('why-chips').replaceChildren(...chips);
  if (!chips.length) $('why-chips').append(h('p', { class: 'hint' }, 'No past show is linked to these acts.'));
}

function openWhy(entityId, opener, focusRow) {
  const r = state.result;
  if (!r) return;
  state.whyOpener = opener ?? null;
  const act = entityId ? r.shortlist.find((a) => a.entity_id === entityId) : null;
  $('why-act').hidden = !act;
  if (act) {
    $('why-act-title').textContent = `Which past shows point to ${act.name}`;
    $('why-method').textContent =
      act.evidence.method === 'explainability'
        ? "Method: explainability. Qloo's own breakdown of how much each past show adds to this match."
        : 'Method: leave-one-out. Each bar is how much the match drops when that past show is switched off.';
    const contribs = act.evidence.contributions ?? [];
    $('why-bars').replaceChildren(...(contribs.length ? contributionBars(contribs) : [h('p', { class: 'hint' }, 'No breakdown came back for this act.')]));
  }
  renderChips(r);
  renderAlsoEvidence(r, focusRow);
  renderPool(r);
  $('why-calls').replaceChildren(
    ...(r.mode?.agent === 'recorded'
      ? [h('p', { class: 'hint' }, `Recorded ${r.mode.recorded_at ? fullDate(r.mode.recorded_at) : ''}: these requests were made when the run was saved; none is sent now.`)]
      : []),
    callsTable(r.calls));
  const left = (r.fallbacks ?? []).filter((f) => !isAgentFallback(f));
  $('why-left').hidden = !left.length;
  $('why-left-list').replaceChildren(...left.map((f) => h('li', {}, `${f.step}: ${f.reason} (${f.used})`)));

  const panel = $('why');
  panel.hidden = false;
  document.body.classList.add('why-open');
  const target = focusRow ? $(focusRow) : panel;
  (target ?? panel).scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  panel.focus({ preventScroll: true });
}

function closeWhy(restoreFocus = true) {
  $('why').hidden = true;
  document.body.classList.remove('why-open');
  if (restoreFocus && state.whyOpener?.isConnected) state.whyOpener.focus();
  state.whyOpener = null;
}

async function toggleShow(id) {
  if (state.off.has(id)) state.off.delete(id);
  else state.off.add(id);
  for (const b of $('why-chips').querySelectorAll('.chip-toggle')) b.setAttribute('aria-pressed', String(!state.off.has(b.dataset.id)));
  const out = $('ablate-out');
  const list = $('ablate-list');
  if (!state.off.size) {
    out.textContent = 'All past shows on. This is the card above.';
    list.replaceChildren();
    return;
  }
  const seq = ++state.ablateSeq;
  if (qlooOff()) {
    out.textContent = 'Switching a show off ranks the pool again through Qloo, which is not connected on this server. The card above is the recorded run.';
    list.replaceChildren();
    return;
  }
  out.textContent = 'Ranking again without those shows';
  try {
    const res = await fetch('/api/ablate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ venue_id: state.venueId, date: state.date, remove: [...state.off] }),
    });
    const body = await res.json().catch(() => ({}));
    if (seq !== state.ablateSeq) return;
    if (!res.ok) throw new Error(body.error || `the server answered ${res.status}`);
    const before = new Set((state.result.shortlist ?? []).map((a) => a.entity_id));
    const rec = state.result.mode?.agent === 'recorded' ? state.result.mode : null;
    // On a recorded card the re-rank is made now, not from the recording, and says so.
    out.textContent = `${body.changed} of ${body.of} changed` +
      (rec ? ` in a ranking made now; the card above is the recorded run${rec.recorded_at ? ` from ${fullDate(rec.recorded_at)}` : ''}` : '');
    list.replaceChildren(
      ...(body.shortlist ?? []).map((a) =>
        h('li', { class: before.has(a.entity_id) ? '' : 'new' }, a.name ?? a.entity_id, before.has(a.entity_id) ? '' : h('span', { class: 'tag' }, 'new'))),
    );
  } catch (err) {
    if (seq !== state.ablateSeq) return;
    out.textContent = `Could not rank again: ${err.message}.`;
    list.replaceChildren();
  }
}

// ---------- back-test badge ----------
function renderBacktest(bt) {
  const badge = $('badge-backtest');
  const body = $('backtest-body');
  if (!bt) {
    badge.textContent = 'Back-test: unavailable';
    body.replaceChildren(h('p', {}, 'The back-test summary could not be read.'));
    return;
  }
  if (bt.status === 'not-run') {
    badge.textContent = 'Back-test: not run yet';
    body.replaceChildren(
      h('p', {}, 'The back-test has not been run yet.'),
      h('p', { class: 'hint' }, 'When it runs, it takes real past nights at real rooms, ranks the acts who played the city that week, and checks where the act that actually played lands. Only totals are shown.'),
    );
    return;
  }
  const rooms = bt.rooms ?? '?';
  badge.textContent = `Back-tested on ${rooms} rooms${bt.status === 'pilot' ? ' (pilot)' : ''} \u00b7 why?`;
  const fmt = (x) => (typeof x === 'number' ? x.toFixed(3) : '?');
  const iv = (m) => (m ? `${fmt(m.mean)} (${fmt(m.lo)} to ${fmt(m.hi)})` : '?');
  const rows = Object.entries(bt.rankers ?? {}).map(([name, r]) =>
    h('tr', {},
      h('th', { scope: 'row' }, `${RANKER_WORDS[name] ?? name.replace(/^placebo:/, 'Placebo: ')}${r.draw ? ` (${r.draw})` : ''}`),
      r.status === 'run'
        ? [h('td', {}, iv(r.mrr)), h('td', {}, iv(r.hit_at_5))]
        : [h('td', { colspan: '2', class: 'hint' }, `not run: ${r.reason ?? ''}`)]));
  const diffs = Object.entries(bt.differences ?? {}).map(([k, d]) => h('li', {}, `${k}: ${d.status === 'not run' ? 'not run' : iv(d)}`));
  body.replaceChildren(
    h('p', {}, h('strong', {}, bt.label ?? `${bt.status} (N = ${rooms} rooms)`)),
    h('p', { class: 'hint' }, bt.status === 'pilot'
      ? 'A pilot: too few rooms for a general claim, so the claim sentence is not used. Published as it came out.'
      : 'Every condition of the pre-registered claim rule held.'),
    h('p', { class: 'hint' }, bt.metric_note ?? ''),
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Ranker'), h('th', { scope: 'col' }, 'MRR (95% interval)'), h('th', { scope: 'col' }, 'Hit in top 5'))),
        h('tbody', {}, rows))),
    diffs.length ? h('p', {}, 'Differences in MRR:') : null,
    diffs.length ? h('ul', {}, diffs) : null,
    h('p', { class: 'hint' }, `${bt.interval?.method ?? ''}. ${bt.interval?.caveat ?? ''}`),
    bt.pool_window
      ? h('p', { class: 'hint' }, `Pool: acts from a ${bt.pool_window.days}-day window around each show; ${bt.pool_window.cut_shows} shows had their window cut at the end of the data (30 Sep).`)
      : null,
  );
}

const RANKER_WORDS = {
  Q: "Q: this room's crowd (Qloo taste)",
  P: 'P: popularity (rough stand-in for draw; no ticket data)',
  T: 'T: genre tags only',
  L: 'L: LLM only, no Qloo',
  R: 'R: random',
  Qvenue: 'Q with the room itself in the signal (leakage check)',
};

// ---------- start ----------
async function start() {
  $('strip').addEventListener('keydown', onStripKey);
  $('retry').addEventListener('click', () => state.date && pickNight(state.date, state.answers));
  $('draft-offer').addEventListener('click', () => openOffer());
  $('offer-act').addEventListener('change', (e) => fillOffer(e.currentTarget.value));
  $('offer-copy').addEventListener('click', copyOffer);
  $('copy-week').addEventListener('click', copyWeek);
  $('why-night').addEventListener('click', (e) => openWhy(state.result?.shortlist?.[0]?.entity_id ?? null, e.currentTarget));
  $('why-close').addEventListener('click', () => closeWhy());
  $('why').addEventListener('keydown', (e) => e.key === 'Escape' && closeWhy());
  $('badge-backtest').addEventListener('click', () => $('backtest').showModal());
  $('venue').addEventListener('change', (e) => loadCalendar(e.target.value));

  getJSON('/api/backtest').then(renderBacktest, () => renderBacktest(null));

  try {
    state.health = await getJSON('/api/health');
    state.recorded = (await getJSON('/api/recorded').catch(() => ({}))).runs ?? [];
    idleBadges();
  } catch {
    setBadges(null, null);
    $('badge-agent').textContent = 'Agent: server not reachable';
    $('badge-qloo').textContent = 'Qloo: server not reachable';
  }

  let venues = [];
  try {
    venues = await getJSON('/api/venues');
  } catch (err) {
    $('dark-count').textContent = 'The venue list could not be read';
    showCalendarNotice(`${err.message}. Reload the page to try again.`);
    return;
  }
  state.venues = venues;
  const select = $('venue');
  if (!venues.length) {
    select.replaceChildren(h('option', {}, 'No venues loaded'));
    $('dark-count').textContent = 'No venue calendar is loaded yet';
    showCalendarNotice('This server has no venue calendars to read.');
    return;
  }
  select.replaceChildren(...venues.map((v) => h('option', { value: v.id }, v.name)));
  select.disabled = venues.length < 2;
  // A recorded live run for a listed room opens on first load, with no click (the default room's first, if it has one).
  const runs = state.recorded.filter((x) => !x.thin && venues.some((v) => v.id === x.venue_id));
  const run = runs.find((x) => x.venue_id === DEFAULT_VENUE) ?? runs[0];
  const first = venues.find((v) => v.id === (run?.venue_id ?? DEFAULT_VENUE)) ?? venues[0];
  select.value = first.id;
  await loadCalendar(first.id);
  if (run && state.calendar && state.venueId === run.venue_id && !state.date) await openRecorded(run);
}

/** Show a recorded run as the night's card (GET, so no Claude or Qloo call is made in any mode). */
async function openRecorded(run) {
  state.date = run.date;
  markPicked(run.date);
  try {
    const r = await readRecorded(run.venue_id, run.date);
    if (state.venueId !== run.venue_id || state.date !== run.date || state.result) return;
    $('steps').replaceChildren(...(r.steps ?? []).map((label) => h('li', { class: 'done' }, label)));
    renderResult(r, { focus: false });
    // On a phone the card sits below the strip; bring it into view without moving focus.
    if (!$('poster').hidden) reveal('poster');
  } catch {
    if (state.venueId === run.venue_id && state.date === run.date && !state.result) resetNight();
  }
}

start();
