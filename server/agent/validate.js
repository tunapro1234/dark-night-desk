// Server-side check on the agent's final answer. The LLM may choose and word things, but it does not invent acts or numbers:
// every shortlisted entity_id must appear in a tool output, and every number in its text must appear in a tool output too.

const NUMBER_IN_TEXT = /\d+(?:\.\d+)?%?/g;
const OFFER_FORBIDDEN = [
  { re: /[$\u00a3\u20ac\u00a5]/, why: 'a currency amount' },
  { re: /\b(tickets?|fees?|presales?|sell[- ]?outs?|sold)\b/i, why: 'a ticket or fee estimate' },
  { re: /\b(manager|management)\b/i, why: 'a manager instead of the booking agent' },
  { re: /\byour crowd\b/i, why: '"your crowd"; the note speaks for the room ("our crowd")' },
];

/** Every value under an `entity_id` key, anywhere in the tree. */
function collectEntityIds(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach((x) => collectEntityIds(x, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'entity_id' && typeof v === 'string') out.add(v);
      else collectEntityIds(v, out);
    }
  }
  return out;
}

const numbersIn = (text) => (String(text).replace(/(\d),(?=\d{3}\b)/g, '$1').match(NUMBER_IN_TEXT) ?? []);

/** Every number in the tree: numeric values and the digit runs inside strings (names, dates, ranges). */
function collectNumbers(node, out = new Set()) {
  if (typeof node === 'number' && Number.isFinite(node)) out.add(node);
  else if (typeof node === 'string') for (const n of numbersIn(node)) out.add(Number(n.replace('%', '')));
  else if (Array.isArray(node)) node.forEach((x) => collectNumbers(x, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((v) => collectNumbers(v, out));
  return out;
}

const close = (a, b) => Math.abs(a - b) < 1e-9;

/** Strings in the output that the reader sees, with a path for error messages. Ids are checked separately. */
function textsOf(output) {
  const out = [];
  const walk = (node, at) => {
    if (typeof node === 'string') out.push({ at, text: node });
    else if (Array.isArray(node)) node.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) if (k !== 'entity_id' && k !== 'type') walk(v, at ? `${at}.${k}` : k);
    }
  };
  walk(output, '');
  return out;
}

/** One error per number in the output's text (or a top-level numeric field) that no tool output carries. */
function unsourcedNumbers(output, toolOutputs) {
  const errors = [];
  const numbers = collectNumbers(toolOutputs);
  const sourced = (n) => [...numbers].some((m) => close(m, n));
  for (const { at, text } of textsOf(output)) {
    for (const raw of numbersIn(text)) {
      const pct = raw.endsWith('%');
      const n = Number(raw.replace('%', ''));
      if (sourced(n) || (pct && sourced(n / 100))) continue;
      errors.push(`${at}: the number "${raw}" does not come from any tool output`);
    }
  }
  for (const [k, v] of Object.entries(output)) {
    if (k !== 'shortlist' && typeof v === 'number' && !sourced(v)) errors.push(`${k}: the number ${v} does not come from any tool output`);
  }
  return errors;
}

/**
 * The thin-signal answer (report_thin_signal): allowed only when resolve_entities ran and found fewer past headliners
 * than `thinBelow`; its sentences follow the same number rule as a plan.
 * @param {{ why?: string }} output
 * @param {unknown[]} toolOutputs
 * @param {{ signalSize?: number, thinBelow: number }} opts `signalSize` is undefined before resolve_entities ran
 */
export function validateThinSignal(output, toolOutputs, { signalSize, thinBelow }) {
  if (!output || typeof output !== 'object') return { ok: false, errors: ['output is not an object'] };
  const errors = [];
  if (signalSize === undefined) errors.push('call resolve_entities first: a thin signal is read from its output');
  else if (signalSize >= thinBelow) errors.push(`the signal is not thin: ${signalSize} past headliners were found; rank them and call submit_plan`);
  if (typeof output.why !== 'string' || !output.why.trim()) errors.push('why must be one or two sentences to the booker');
  errors.push(...unsourcedNumbers(output, toolOutputs));
  return { ok: errors.length === 0, errors };
}

/**
 * @param {{ shortlist?: { entity_id: string, why?: string }[], offer_note?: { subject?: string, body?: string }, [k: string]: unknown }} output
 * @param {unknown[]} toolOutputs the JSON each tool returned in this session (outputs only, never the agent's own inputs)
 * @param {{ shortlistSize?: number, allowedIds?: Iterable<string> }} [opts] `allowedIds` narrows the shortlist further
 *   (for example to the ranked pool); `shortlistSize` requires an exact length.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateAgentOutput(output, toolOutputs, { shortlistSize, allowedIds } = {}) {
  const errors = [];
  if (!output || typeof output !== 'object') return { ok: false, errors: ['output is not an object'] };
  const shortlist = output.shortlist;
  if (!Array.isArray(shortlist) || !shortlist.length) errors.push('shortlist is missing or empty');

  const known = collectEntityIds(toolOutputs);
  const allowed = allowedIds ? new Set(allowedIds) : null;
  const seen = new Set();
  for (const [i, item] of (Array.isArray(shortlist) ? shortlist : []).entries()) {
    const id = item?.entity_id;
    if (typeof id !== 'string' || !id) errors.push(`shortlist[${i}] has no entity_id`);
    else if (!known.has(id)) errors.push(`shortlist[${i}].entity_id "${id}" does not appear in any tool output`);
    else if (allowed && !allowed.has(id)) errors.push(`shortlist[${i}].entity_id "${id}" is not in the ranked pool`);
    else if (seen.has(id)) errors.push(`shortlist[${i}].entity_id "${id}" is listed twice`);
    if (typeof id === 'string') seen.add(id);
    if (item?.why !== undefined && typeof item.why !== 'string') errors.push(`shortlist[${i}].why must be text`);
  }
  if (shortlistSize !== undefined && Array.isArray(shortlist) && shortlist.length !== shortlistSize) {
    errors.push(`shortlist must have exactly ${shortlistSize} acts (got ${shortlist.length})`);
  }

  errors.push(...unsourcedNumbers(output, toolOutputs));

  const note = output.offer_note;
  if (note !== undefined) {
    const text = `${note?.subject ?? ''}\n${note?.body ?? ''}`;
    if (!note?.subject || !note?.body) errors.push('offer_note needs a subject and a body');
    if (!/Guarantee: ___/.test(text)) errors.push('offer_note must keep the blank "Guarantee: ___" line');
    for (const f of OFFER_FORBIDDEN) if (f.re.test(text)) errors.push(`offer_note contains ${f.why}`);
  }
  return { ok: errors.length === 0, errors };
}
