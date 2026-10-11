// Minimal robots.txt reader (RFC 9309): user-agent groups, Allow/Disallow with * and $, Crawl-delay.

/**
 * @param {string} text robots.txt body
 * @returns {{ agents: string[], rules: { allow: boolean, pattern: string }[], crawlDelay: number | null }[]}
 */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text ?? '').split(/\r?\n|\r/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      if (value !== '') current.rules.push({ allow: key === 'allow', pattern: value });
    } else if (key === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }
  return groups;
}

/**
 * Groups that apply to a user agent: every group naming a token found in the agent string
 * (case-insensitive), otherwise the "*" groups.
 */
export function groupsFor(groups, userAgent) {
  const ua = String(userAgent).toLowerCase();
  const named = groups.filter((g) => g.agents.some((a) => a !== '*' && a !== '' && ua.includes(a)));
  return named.length ? named : groups.filter((g) => g.agents.includes('*'));
}

function patternMatches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${re}${anchored ? '$' : ''}`).test(path);
}

/**
 * May this user agent fetch this path? The longest matching rule wins; Allow wins a tie; no match means allowed.
 * @param {string} robotsText
 * @param {string} userAgent
 * @param {string} path  path and query, for example "/shows/?start_date=20261101"
 * @returns {{ allowed: boolean, rule: string | null, crawlDelay: number | null }}
 */
export function robotsVerdict(robotsText, userAgent, path) {
  const groups = groupsFor(parseRobots(robotsText), userAgent);
  let best = null;
  for (const rule of groups.flatMap((g) => g.rules)) {
    if (!patternMatches(rule.pattern, path)) continue;
    const longer = !best || rule.pattern.length > best.pattern.length;
    const tieAllow = best && rule.pattern.length === best.pattern.length && rule.allow && !best.allow;
    if (longer || tieAllow) best = rule;
  }
  const delays = groups.map((g) => g.crawlDelay).filter((d) => d !== null);
  return {
    allowed: best ? best.allow : true,
    rule: best ? `${best.allow ? 'Allow' : 'Disallow'}: ${best.pattern}` : null,
    crawlDelay: delays.length ? Math.max(...delays) : null,
  };
}
