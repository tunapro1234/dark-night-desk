// Parser for First Avenue's public calendar month pages (/shows/?start_date=YYYYMM01).
//
// The page lists shows in date order. Each day starts with an empty marker <div id="day-YYYY-M-D"></div>
// (month and day are not zero-padded on the live page), followed by one <div class="show_list_item"> per show.
// Inside a show: <div class="venue_name">Room</div> and an <h4><a href=".../event/<slug>/">Title</a></h4>.
// A status badge (<div class="status badge badge-postponed">) marks postponed or canceled shows.

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D', sbquo: '\u201A', bdquo: '\u201E',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', middot: '\u00B7', bull: '\u2022', star: '\u2606',
  eacute: '\u00E9', egrave: '\u00E8', ecirc: '\u00EA', euml: '\u00EB', aacute: '\u00E1', agrave: '\u00E0',
  acirc: '\u00E2', auml: '\u00E4', atilde: '\u00E3', aring: '\u00E5', iacute: '\u00ED', iuml: '\u00EF',
  oacute: '\u00F3', ouml: '\u00F6', otilde: '\u00F5', oslash: '\u00F8', uacute: '\u00FA', uuml: '\u00FC',
  ntilde: '\u00F1', ccedil: '\u00E7', szlig: '\u00DF', Eacute: '\u00C9', Aacute: '\u00C1', Oacute: '\u00D3',
  Ouml: '\u00D6', Uuml: '\u00DC', Ntilde: '\u00D1', copy: '\u00A9', reg: '\u00AE', trade: '\u2122',
};

/** Decode named and numeric HTML entities. Unknown named entities are left as written. */
export function decodeEntities(text) {
  return String(text).replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      if (code === 0xa0) return ' ';
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : whole;
  });
}

const INLINE_TAG_RE = /<\/?(?:a|abbr|b|bdi|cite|em|i|mark|small|span|strong|sub|sup|u)\b[^>]*>/gi;

/**
 * Inner HTML to plain text: inline tags (em, span, ...) are dropped so "JER</span>," stays "JER,", other tags
 * (br, div, ...) become spaces, entities are decoded, runs of white space collapse to one space.
 */
export function htmlText(fragment) {
  return decodeEntities(String(fragment).replace(INLINE_TAG_RE, '').replace(/<[^>]*>/g, ' '))
    .replace(/[\s\u00A0]+/g, ' ')
    .trim();
}

const CANCELED_RE = /\b(canceled|cancelled|postponed)\b/i;
const MARKER_RE = /<div\b[^>]*\bid="day-(\d{4})-(\d{1,2})-(\d{1,2})"[^>]*>|<div\b[^>]*\bclass="show_list_item\b[^"]*"[^>]*>/g;
const EVENT_LINK_RE = /<a\b[^>]*\bhref="([^"]*\/event\/([^/"?#]+)\/?[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;

/** True when a title or event slug says the show will not happen on that date. */
export function isCanceled(title, slug = '') {
  return CANCELED_RE.test(title) || CANCELED_RE.test(String(slug).replace(/-/g, ' '));
}

function isoFromParts(y, m, d) {
  const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const t = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === date ? date : null;
}

function absoluteUrl(href, pageUrl) {
  try {
    return new URL(decodeEntities(href), pageUrl).href;
  } catch {
    return null;
  }
}

/** The show title and link of one show block: the <h4> link first, otherwise the first event link with text. */
function eventOf(block, pageUrl) {
  const h4 = /<h4\b[^>]*>([\s\S]*?)<\/h4>/.exec(block);
  for (const scope of [h4?.[1], block]) {
    if (!scope) continue;
    for (const m of scope.matchAll(EVENT_LINK_RE)) {
      const title = htmlText(m[3]);
      const url = absoluteUrl(m[1], pageUrl);
      if (title && url) return { title, source_url: url, slug: m[2] };
    }
  }
  return null;
}

/**
 * Parse one calendar month page.
 * Rows before the first day marker, and show blocks without a room or an event link, are left out.
 * @param {string} html
 * @param {{ pageUrl?: string }} [opts]  base for relative links
 * @returns {{ date: string, room: string, title: string, source_url: string, canceled: boolean }[]}
 */
export function parseMonthPage(html, { pageUrl = 'https://first-avenue.com/shows/' } = {}) {
  const src = String(html ?? '');
  const marks = [...src.matchAll(MARKER_RE)];
  const rows = [];
  let date = null;
  marks.forEach((m, i) => {
    if (m[1]) {
      date = isoFromParts(m[1], m[2], m[3]);
      return;
    }
    if (!date) return;
    const block = src.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : src.length);
    const venue = /<div\b[^>]*\bclass="venue_name\b[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(block);
    const room = venue ? htmlText(venue[1]) : '';
    const event = eventOf(block, pageUrl);
    if (!room || !event) return;
    const badge = /class="[^"]*\bbadge-(canceled|cancelled|postponed)\b/i.test(block);
    rows.push({
      date,
      room,
      title: event.title,
      source_url: event.source_url,
      canceled: badge || isCanceled(event.title, event.slug),
    });
  });
  return rows;
}

/** The "Viewing N shows in <Month>" count printed at the top of a month page, or null when absent. */
export function listedShowCount(html) {
  const m = /Viewing(?:<\/em>)?\s*(\d+)\s*(?:<em>)?\s*shows? in/i.exec(String(html ?? ''));
  return m ? Number(m[1]) : null;
}
