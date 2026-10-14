// Back-test metrics (BACKTEST.md "Metrics" and "Claim rule"). Pure functions, no I/O.
// Values are grouped by room: { roomId: [value per test show] }. Rooms count with equal weight.

/** 1 / rank of the positive (1-based), or 0 when it is not in the ranking. */
export function reciprocalRank(rankedIds, positiveId) {
  const i = rankedIds.indexOf(positiveId);
  return i < 0 ? 0 : 1 / (i + 1);
}

/** 1 when the positive is in the top k, else 0. */
export function hitAt(rankedIds, positiveId, k = 5) {
  const i = rankedIds.indexOf(positiveId);
  return i >= 0 && i < k ? 1 : 0;
}

/** Position of the positive scaled to 0 (top) .. 1 (bottom); 1 when it is missing, 0 for a pool of one. */
export function percentileRank(rankedIds, positiveId) {
  const i = rankedIds.indexOf(positiveId);
  if (i < 0) return 1;
  return rankedIds.length <= 1 ? 0 : i / (rankedIds.length - 1);
}

/** Random ranker (R): analytic expectations for a pool of n. */
export function randomExpectation(n, k = 5) {
  if (!(n > 0)) return { rr: 0, hit: 0, percentile: 0.5 };
  let harmonic = 0;
  for (let i = 1; i <= n; i++) harmonic += 1 / i;
  return { rr: harmonic / n, hit: Math.min(k, n) / n, percentile: n === 1 ? 0 : 0.5 };
}

/** Seeded PRNG (mulberry32): same seed, same stream. Returns floats in [0, 1). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mean = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length;

/** Linear-interpolation quantile of a sorted list (q in [0, 1]). */
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Median and interquartile range of a flat list. */
export function spread(values) {
  const s = [...values].sort((a, b) => a - b);
  return { median: quantile(s, 0.5), iqr: [quantile(s, 0.25), quantile(s, 0.75)] };
}

const roomsOf = (valuesByVenue) => Object.keys(valuesByVenue).sort().filter((k) => valuesByVenue[k]?.length);

/** Mean per room, then the mean of the room means (equal weight per room). */
export function roomMean(valuesByVenue) {
  const rooms = roomsOf(valuesByVenue);
  return rooms.length ? mean(rooms.map((r) => mean(valuesByVenue[r]))) : NaN;
}

function interval(point, stats) {
  stats.sort((a, b) => a - b);
  return { mean: point, lo: quantile(stats, 0.025), hi: quantile(stats, 0.975) };
}

/**
 * Bootstrap over rooms: draw rooms with replacement, keep each drawn room's shows as they are.
 * Meaningful only with enough rooms (the protocol's general case, N >= 8).
 * @param {Record<string, number[]>} valuesByVenue
 * @param {{ reps?: number, seed?: number }} [opts]
 * @returns {{ mean: number, lo: number, hi: number }}
 */
export function clusterBootstrap(valuesByVenue, { reps = 2000, seed = 1 } = {}) {
  const rooms = roomsOf(valuesByVenue);
  if (!rooms.length) return { mean: NaN, lo: NaN, hi: NaN };
  const roomMeans = rooms.map((r) => mean(valuesByVenue[r]));
  const rand = seededRandom(seed);
  const stats = [];
  for (let b = 0; b < reps; b++) {
    let t = 0;
    for (let i = 0; i < rooms.length; i++) t += roomMeans[Math.floor(rand() * rooms.length)];
    stats.push(t / rooms.length);
  }
  return interval(mean(roomMeans), stats);
}

/**
 * Bootstrap of shows within each room (the pilot's primary interval): every room keeps its own show count,
 * and rooms are averaged with equal weight. Shows in one room are not independent, so this interval is too narrow.
 * @param {Record<string, number[]>} valuesByVenue
 * @param {{ reps?: number, seed?: number }} [opts]
 * @returns {{ mean: number, lo: number, hi: number }}
 */
export function stratifiedBootstrap(valuesByVenue, { reps = 2000, seed = 1 } = {}) {
  const rooms = roomsOf(valuesByVenue);
  if (!rooms.length) return { mean: NaN, lo: NaN, hi: NaN };
  const rand = seededRandom(seed);
  const stats = [];
  for (let b = 0; b < reps; b++) {
    let t = 0;
    for (const r of rooms) {
      const v = valuesByVenue[r];
      let s = 0;
      for (let i = 0; i < v.length; i++) s += v[Math.floor(rand() * v.length)];
      t += s / v.length;
    }
    stats.push(t / rooms.length);
  }
  return interval(roomMean(valuesByVenue), stats);
}

/** Per-show differences a - b for two rankers on the same shows (paired). */
export function pairedDifferences(aByVenue, bByVenue) {
  const out = {};
  for (const r of roomsOf(aByVenue)) {
    const a = aByVenue[r];
    const b = bByVenue[r];
    if (!b || b.length !== a.length) throw new Error(`paired values for room ${r} do not line up`);
    out[r] = a.map((x, i) => x - b[i]);
  }
  return out;
}

/** Interval for MRR(a) - MRR(b), resampling the same shows for both rankers. */
export const clusterBootstrapDiff = (aByVenue, bByVenue, opts) => clusterBootstrap(pairedDifferences(aByVenue, bByVenue), opts);
export const stratifiedBootstrapDiff = (aByVenue, bByVenue, opts) => stratifiedBootstrap(pairedDifferences(aByVenue, bByVenue), opts);

export const CLAIM_MIN_ROOMS = 8;
export const CLAIM_MIN_SHOWS = 300;
export const CLAIM_SENTENCE =
  "On real nights at N independent venues, ranking by the room's own crowd put the actual headliner higher than popularity alone did";

// "Excludes 0" in the claim rule means Q wins: the lower bound is above 0 (BACKTEST.md Amendment 3). An interval wholly below 0
// also excludes 0, but it is a loss and never allows the sentence.
const aboveZero = (iv) => Boolean(iv) && Number.isFinite(iv.lo) && Number.isFinite(iv.hi) && iv.lo > 0;

/**
 * BACKTEST.md "Claim rule": the sentence is used only if every condition holds. Otherwise the result is a pilot.
 * @param {{ rooms: number, shows: number, qMinusP?: {lo: number, hi: number}, qMinusPlacebo?: Record<string, {lo: number, hi: number}> }} r
 */
export function claimRule({ rooms, shows, qMinusP, qMinusPlacebo = {} }) {
  const placebos = Object.values(qMinusPlacebo);
  const checks = {
    rooms_and_shows: rooms >= CLAIM_MIN_ROOMS && shows >= CLAIM_MIN_SHOWS,
    q_minus_p_above_0: aboveZero(qMinusP),
    q_minus_placebo_above_0: placebos.length > 0 && placebos.every(aboveZero),
  };
  const used = Object.values(checks).every(Boolean);
  return { used, status: used ? 'full' : 'pilot', checks };
}

// ---------- Study 2 (BACKTEST-2.md Amendment 1): rooms inside clusters ----------
// Values stay grouped by room; clusterOf maps a room to its cluster. A cluster's value is the mean of its room means,
// and clusters count with equal weight.

/** { cluster: [mean of its room means] }, the form clusterBootstrap draws from when it should draw clusters. */
export function clusterMeans(valuesByRoom, clusterOf) {
  const rooms = new Map();
  for (const r of roomsOf(valuesByRoom)) {
    const c = clusterOf(r);
    if (!rooms.has(c)) rooms.set(c, []);
    rooms.get(c).push(mean(valuesByRoom[r]));
  }
  return Object.fromEntries([...rooms].map(([c, means]) => [c, [mean(means)]]));
}

/** Bootstrap over clusters: draw clusters with replacement, each keeping its mean of room means. */
export const clusterBootstrap2 = (valuesByRoom, clusterOf, opts) => clusterBootstrap(clusterMeans(valuesByRoom, clusterOf), opts);
export const clusterBootstrap2Diff = (aByRoom, bByRoom, clusterOf, opts) => clusterBootstrap2(pairedDifferences(aByRoom, bByRoom), clusterOf, opts);

/**
 * Shows resampled within each room (too narrow: shows in a room are not independent), then room means averaged per cluster,
 * then clusters with equal weight.
 */
export function nestedStratifiedBootstrap(valuesByRoom, clusterOf, { reps = 2000, seed = 1 } = {}) {
  const rooms = roomsOf(valuesByRoom);
  if (!rooms.length) return { mean: NaN, lo: NaN, hi: NaN };
  const clusters = [...new Set(rooms.map(clusterOf))].sort();
  const members = clusters.map((c) => rooms.filter((r) => clusterOf(r) === c));
  const point = mean(members.map((rs) => mean(rs.map((r) => mean(valuesByRoom[r])))));
  const rand = seededRandom(seed);
  const stats = [];
  for (let b = 0; b < reps; b++) {
    let t = 0;
    for (const rs of members) {
      let ct = 0;
      for (const r of rs) {
        const v = valuesByRoom[r];
        let s = 0;
        for (let i = 0; i < v.length; i++) s += v[Math.floor(rand() * v.length)];
        ct += s / v.length;
      }
      t += ct / rs.length;
    }
    stats.push(t / members.length);
  }
  return interval(point, stats);
}
export const nestedStratifiedBootstrapDiff = (aByRoom, bByRoom, clusterOf, opts) =>
  nestedStratifiedBootstrap(pairedDifferences(aByRoom, bByRoom), clusterOf, opts);
