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
  if (agent === 'live') return 'Agent: live (Claude)';
  if (agent === 'recorded') return recordedAt ? `Agent: recorded run from ${fullDate(recordedAt)}` : 'Agent: recorded run';
  if (agent === 'scripted') return 'Agent: scripted plan (no LLM)';
  return 'Agent: unknown';
}
function qlooLabel(qloo) {
  if (qloo === 'live') return 'Qloo: live';
  if (qloo === 'no-key') return 'Qloo: not connected';
  if (qloo === 'fixture') return 'Qloo: synthetic test data';
  return 'Qloo: unknown';
}
const AGENT_HINT = {
  live: 'Claude chooses the steps and writes the sentences. Every name and number is checked against the tool results.',
  recorded: 'A saved run of the live agent for this room and night, played back. No Claude call is made now.',
  scripted: 'A fixed sequence of the same steps, with no language model. Shown when no live or recorded run is available.',
};
const QLOO_HINT = {
  live: 'Rankings come from the Qloo taste graph.',
  'no-key': 'This server has no Qloo key, so it ranks nothing.',
  fixture: 'Test mode: hand-written synthetic data, not real artists or Qloo results.',
};

function setBadges(agent, qloo, recordedAt) {
  const a = $('badge-agent');
  a.textContent = agentLabel(agent, recordedAt);
  a.dataset.mode = agent ?? '';
  a.title = AGENT_HINT[agent] ?? '';
  const q = $('badge-qloo');
  q.textContent = qlooLabel(qloo);
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
};
const qlooOff = () => state.health?.qloo === 'no-key';

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

// The room picked on first load when the server has it; otherwise the first venue in the list.
const DEFAULT_VENUE = 'fa-fine-line';
const WINDOW_NIGHTS = 60;

async function loadCalendar(venueId) {
  state.venueId = venueId;
  state.calendar = null;
  resetNight();
  $('dark-count').textContent = 'Reading the calendar';
  $('strip').replaceChildren();
  $('source-chip').hidden = true;
  showCalendarNotice('');
  const v = state.venues.find((x) => x.id === venueId);
  $('venue-meta').textContent = v ? `${v.locality || v.city} \u00b7 room for about ${v.capacity_band}` : '';
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
      return h('li', {},
        h('button', {
          type: 'button', class: 'sq sq-dark', 'data-date': night.date, tabindex: '-1', 'aria-pressed': 'false',
          'aria-label': `${shortDay(night.date)}, dark night`, onclick: () => pickNight(night.date),
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
  const first = strip.querySelector('.sq-dark');
  if (first) first.tabIndex = 0;
  if (qlooOff()) {
    showCalendarNotice(
      'Qloo: not connected. This server has no Qloo key, so it ranks no acts. ' +
        'You can read the calendar, but picking a night will not show a list.',
    );
  }
}

// Arrow keys move between dark nights; only one of them is in the tab order at a time.
function onStripKey(e) {
  const buttons = [...$('strip').querySelectorAll('.sq-dark')];
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

function markPicked(date) {
  for (const b of $('strip').querySelectorAll('.sq-dark')) {
    const on = b.dataset.date === date;
    b.setAttribute('aria-pressed', String(on));
    if (on) {
      for (const o of $('strip').querySelectorAll('.sq-dark')) o.tabIndex = -1;
      b.tabIndex = 0;
    }
  }
}

// ---------- night panel states ----------
function show(which) {
  for (const id of ['night-empty', 'progress', 'fail', 'poster']) $(id).hidden = id !== which;
}

function resetNight() {
  state.planAbort?.abort();
  state.planAbort = null;
  state.date = null;
  state.result = null;
  state.off.clear();
  closeWhy(false);
  show('night-empty');
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

async function pickNight(date) {
  state.planAbort?.abort();
  closeWhy(false);
  state.date = date;
  state.result = null;
  state.off.clear();
  markPicked(date);
  if (qlooOff()) {
    showFail(
      `${shortDay(date)} stays open for now`,
      'Qloo: not connected. Without the Qloo taste graph the Desk has no honest way to rank acts, so it shows no list instead of a made-up one.',
      false,
    );
    return;
  }
  $('progress-title').textContent = `Planning ${shortDay(date)}`;
  $('steps').replaceChildren();
  show('progress');
  const ctrl = new AbortController();
  state.planAbort = ctrl;
  try {
    await streamPlan({ venue_id: state.venueId, date }, ctrl.signal);
  } catch (err) {
    if (ctrl.signal.aborted) return;
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
      else if (event === 'error') return planError(payload);
    }
  }
  throw new Error('The connection closed before the plan was ready');
}

function planError(err) {
  if (err.code === 'qloo_not_connected') {
    state.health = { ...(state.health ?? {}), qloo: 'no-key' };
    setBadges(state.health.agent, 'no-key');
    showFail('Qloo: not connected', 'Without the Qloo taste graph the Desk ranks nothing, so there is no list for this night.', false);
    return;
  }
  showFail('No plan for this night', err.message || 'Something went wrong while planning.');
}

// ---------- poster card ----------
const TYPE_WORDS = { movie: 'Films', place: 'Places', brand: 'Brands' };
const fmtLift = (n) => (Math.round(n * 100) / 100).toFixed(2);

function renderResult(r) {
  state.result = r;
  setBadges(r.mode?.agent, r.mode?.qloo, r.mode?.recorded_at);
  for (const li of $('steps').children) li.className = 'done';

  $('poster-venue').textContent = r.venue ? `${r.venue.name} \u00b7 ${r.venue.locality || r.venue.city}` : '';
  $('poster-date').textContent = posterDay(r.night.date);

  const lineup = (r.shortlist ?? []).map((act) =>
    h('li', { class: `act act-${act.rank}` },
      h('span', { class: 'act-name' }, act.name ?? 'Unnamed act'),
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

  const also = r.also_loves ?? [];
  $('also').hidden = false;
  $('also-list').replaceChildren(
    ...(also.length
      ? also.map((row, i) =>
          h('li', {},
            h('span', { class: 'also-type' }, TYPE_WORDS[row.type] ?? row.type),
            ' ',
            h('span', { class: 'also-cat' }, row.category),
            h('span', { class: 'also-lift' }, ": shows up more here than at the city's average room"),
            ' ',
            h('button', { type: 'button', class: 'why-link', onclick: (e) => openWhy(null, e.currentTarget, `also-${i}`) }, 'source'),
          ))
      : [h('li', { class: 'also-none' }, "Nothing stands out against the city's average room for this crowd.")]),
  );

  $('draft-offer').hidden = !offerNotes(r).length;
  const fb = (r.fallbacks ?? []).filter(isAgentFallback);
  const note = $('fallback-note');
  note.hidden = !fb.length;
  note.textContent = fb.length ? `Ran as the ${fb.at(-1).used} because ${FALLBACK_WORDS[fb.at(-1).reason] ?? fb.at(-1).reason}.` : '';

  show('poster');
  $('poster').focus?.();
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
function contributionBars(contribs) {
  const rows = contribs.slice(0, 8);
  const rowH = 36;
  const svg = s('svg', { viewBox: `0 0 320 ${rows.length * rowH + 4}`, role: 'img', class: 'bars', 'aria-label': 'Share of the match from each past show' });
  const max = Math.max(...rows.map((c) => c.share), 0.0001);
  rows.forEach((c, i) => {
    const y = i * rowH;
    const pct = `${Math.round(c.share * 100)}%`;
    svg.append(
      s('text', { x: 0, y: y + 13, class: 'bar-label' }, c.name ?? c.entity_id),
      s('text', { x: 320, y: y + 13, class: 'bar-value', 'text-anchor': 'end' }, pct),
      s('rect', { x: 0, y: y + 19, width: 320, height: 9, rx: 2, class: 'bar-track' }),
      s('rect', { x: 0, y: y + 19, width: Math.max(2, (c.share / max) * 320), height: 9, rx: 2, class: 'bar-fill' }),
    );
  });
  const list = h('ul', { class: 'sr-only' }, rows.map((c) => h('li', {}, `${c.name}: ${Math.round(c.share * 100)}%`)));
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

function renderAlsoEvidence(r, focusRow) {
  const rows = r.also_loves ?? [];
  $('why-also').hidden = !rows.length;
  $('why-also-body').replaceChildren(
    ...rows.map((row, i) => {
      const ev = row.evidence ?? {};
      const pct = (x) => `${Math.round(x * 100)}%`;
      const depths = ev.depths ?? [];
      const lines = depths.map((d, k) => `top ${d}: ${pct(ev.room_share?.[k] ?? 0)} for this room vs ${pct(ev.city_share?.[k] ?? 0)} for the city's average room`);
      return h('div', { class: `also-ev${focusRow === `also-${i}` ? ' focus' : ''}`, id: `also-${i}` },
        h('p', {}, h('strong', {}, `${TYPE_WORDS[row.type] ?? row.type}: ${row.category}`), ` \u00b7 lift ${fmtLift(row.lift_range[0])} to ${fmtLift(row.lift_range[1])}`),
        h('p', { class: 'hint' }, `${ev.measure ?? ''}. Signal: ${ev.signal_sizes?.room ?? '?'} acts from this room, ${ev.signal_sizes?.city ?? '?'} from the city's rooms.`),
        h('ul', {}, lines.map((l) => h('li', {}, l))),
        callsTable(ev.calls));
    }),
  );
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
  $('why-calls').replaceChildren(callsTable(r.calls));
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
    out.textContent = `${body.changed} of ${body.of} changed`;
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
  $('retry').addEventListener('click', () => state.date && pickNight(state.date));
  $('draft-offer').addEventListener('click', () => openOffer());
  $('offer-act').addEventListener('change', (e) => fillOffer(e.currentTarget.value));
  $('offer-copy').addEventListener('click', copyOffer);
  $('why-night').addEventListener('click', (e) => openWhy(state.result?.shortlist?.[0]?.entity_id ?? null, e.currentTarget));
  $('why-close').addEventListener('click', () => closeWhy());
  $('why').addEventListener('keydown', (e) => e.key === 'Escape' && closeWhy());
  $('badge-backtest').addEventListener('click', () => $('backtest').showModal());
  $('venue').addEventListener('change', (e) => loadCalendar(e.target.value));

  getJSON('/api/backtest').then(renderBacktest, () => renderBacktest(null));

  try {
    state.health = await getJSON('/api/health');
    setBadges(state.health.agent, state.health.qloo);
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
  const first = venues.find((v) => v.id === DEFAULT_VENUE) ?? venues[0];
  select.value = first.id;
  await loadCalendar(first.id);
}

start();
