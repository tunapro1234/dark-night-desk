// Parameter x type validator for GET /v2/insights.
// Qloo answers 200 with an empty list when a parameter does not apply to the requested type,
// so every request is checked here before it is sent.

export const ENTITY_TYPES = Object.freeze([
  'artist', 'book', 'brand', 'destination', 'movie', 'person', 'place', 'podcast', 'tv_show', 'video_game',
].map((t) => `urn:entity:${t}`));

const LOCATION_TYPES = new Set(['urn:entity:place', 'urn:entity:destination']);
const BIAS_TRENDS = new Set(['off', 'low', 'medium', 'high']);

// Exact parameter names accepted besides the filter.* and signal.demographics.* families.
const KNOWN = new Set([
  'filter.type',
  'filter.results.entities',
  'filter.exclude.entities',
  'filter.popularity.min',
  'filter.popularity.max',
  'signal.interests.entities',
  'signal.interests.entities.weight',
  'signal.interests.tags',
  'signal.location',
  'signal.location.weight',
  'bias.trends',
  'diversify.by',
  'diversify.take',
  'feature.explainability',
  'take',
  'page',
]);
const NAME_RE = /^[a-z_]+(\.[a-z_]+)*$/;

const isLocationParam = (k) =>
  k === 'filter.location' || k.startsWith('filter.location.') || k === 'filter.geocode' || k.startsWith('filter.geocode.');

/** Drop undefined/null values; arrays become comma-joined strings. */
export function cleanParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null) continue;
    out[k] = Array.isArray(v) ? v.map(String).join(',') : v;
  }
  return out;
}

function checkNumber(errors, key, value, { min, max, integer = false }) {
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (String(value).trim() === '' || !Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) {
    errors.push(`${key} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`);
  }
}

/**
 * @param {Record<string, unknown>} params
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateInsightsParams(params) {
  const errors = [];
  const p = cleanParams(params);
  const type = p['filter.type'];

  if (type === undefined || String(type).trim() === '') {
    errors.push('filter.type is required');
  } else if (!ENTITY_TYPES.includes(String(type))) {
    errors.push(`filter.type "${type}" is not available on the hackathon API (use one of ${ENTITY_TYPES.join(', ')})`);
  }

  for (const [key, value] of Object.entries(p)) {
    if (!NAME_RE.test(key)) {
      errors.push(`unknown parameter "${key}"`);
      continue;
    }
    const known = KNOWN.has(key) || key.startsWith('filter.') || key.startsWith('signal.demographics.');
    if (!known) {
      errors.push(`unknown parameter "${key}" (Qloo would ignore it silently)`);
      continue;
    }
    if (isLocationParam(key) && type && !LOCATION_TYPES.has(String(type))) {
      errors.push(`${key} applies only to place and destination, not ${type}`);
    }
    if (typeof value === 'string' && value.trim() === '') errors.push(`${key} is empty`);
  }

  if (type === 'urn:entity:destination' && !p['signal.interests.entities']) {
    errors.push('signal.interests.entities is required for urn:entity:destination');
  }

  if (p.take !== undefined) checkNumber(errors, 'take', p.take, { min: 1, max: 500, integer: true });
  if (p.page !== undefined) checkNumber(errors, 'page', p.page, { min: 1, max: 1000, integer: true });
  if (p['diversify.take'] !== undefined) checkNumber(errors, 'diversify.take', p['diversify.take'], { min: 1, max: 500, integer: true });
  for (const k of ['filter.popularity.min', 'filter.popularity.max']) {
    if (p[k] !== undefined) checkNumber(errors, k, p[k], { min: 0, max: 1 });
  }
  for (const k of ['signal.interests.entities.weight', 'signal.location.weight']) {
    if (p[k] !== undefined) checkNumber(errors, k, p[k], { min: 0, max: 100 });
  }
  if (p['feature.explainability'] !== undefined && !['true', 'false'].includes(String(p['feature.explainability']))) {
    errors.push('feature.explainability must be true or false');
  }
  if (p['bias.trends'] !== undefined && !BIAS_TRENDS.has(String(p['bias.trends']))) {
    errors.push(`bias.trends must be one of ${[...BIAS_TRENDS].join(', ')}`);
  }

  return { ok: errors.length === 0, errors };
}
