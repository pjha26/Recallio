const domains = {
  hubspot: 'hubspot.com',
  salesforce: 'salesforce.com',
  pipedrive: 'pipedrive.com',
  'zoho crm': 'zoho.com',
  freshsales: 'freshworks.com',
  supabase: 'supabase.com',
  neon: 'neon.tech',
};

export function officialDomain(vendor) {
  const name = vendor.toLowerCase().trim();
  if (Object.hasOwn(domains, name)) return domains[name];
  if (name.startsWith('supabase ')) return domains.supabase;
  if (name.startsWith('salesforce ')) return domains.salesforce;
  if (name.startsWith('hubspot ')) return domains.hubspot;
  if (name.startsWith('freshsales ')) return domains.freshsales;
  return undefined;
}

export function isOfficial(source, domain) {
  if (!domain || !source) return false;
  const { hostname } = new URL(source.url);
  return hostname === domain || hostname.endsWith('.' + domain);
}

const months = 'january february march april may june july august september october november december'.split(' ');
const namedMonth = months.map(month => month + '|' + month.slice(0, 3)).join('|');
const datePattern = new RegExp(
  '\\b(20\\d{2}-\\d{2}-\\d{2})\\b|\\b(' + namedMonth + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b' +
  '|\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + namedMonth + ')\\s+(20\\d{2})\\b', 'gi');

function explicitDate(text) {
  const dates = new Set();
  for (const [, iso, monthFirst, daySecond, yearFirst, dayFirst, monthSecond, yearSecond] of text.matchAll(datePattern)) {
    const month = monthFirst ?? monthSecond;
    const date = iso ?? [
      yearFirst ?? yearSecond,
      String(months.findIndex(value => value.startsWith(month.toLowerCase())) + 1).padStart(2, '0'),
      (dayFirst ?? daySecond).padStart(2, '0'),
    ].join('-');
    const parsed = new Date(date);
    if (Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date) dates.add(date);
  }
  return dates.size === 1 ? dates.values().next().value : undefined;
}

function eventFrom(source, kind, since, today) {
  const candidates = [source.text, source.pageText ?? ''].flatMap(text =>
    text.split(/\r?\n|(?<=[.!?])\s+/).map(quote => quote.trim()));
  for (const quote of candidates) {
    if (!quote || quote.length > 700 || /\b(?:preview|beta|planned|upcoming|expected|will|would|may|might|not yet)\b/i.test(quote)) continue;
    const date = explicitDate(quote);
    if (!date || date > today || (since && date < since)) continue;
    const unchanged = kind === 'pricing'
      ? /\b(?:pricing|prices?|subscription (?:rates?|fees?))\s+(?:(?:has|have|will|did|was|were)\s+)?(?:remains? unchanged|unchanged|not changed|not change|stayed the same)\b/i
      : /\bno (?:major |new )?(?:releases?|versions?) (?:shipped|launched|were released)\b/i;
    if (since && unchanged.test(quote)) return { status: 'no_change_found', date, quote };
    if (/\b(?:no|not|never|unchanged|didn['’]t|hasn['’]t|without)\b/i.test(quote)) continue;
    const changed = kind === 'pricing'
      ? /\b(?:pricing|prices?|subscription (?:rates?|fees?))\s+(?:(?:has|have|was|were)\s+)?(?:changed|increased|decreased|rose|fell|raised|lowered)\b|\b(?:new|updated) (?:prices?|pricing)\s+(?:took effect|became effective)\b/i
      : /\b(?:shipped|launched|was released|were released|went live|became generally available|is now generally available)\b/i;
    if (changed.test(quote)) return { status: 'confirmed_change', date, quote };
  }
  return undefined;
}

export function summarizeChecks(checklist, coverage, sources, since, today) {
  return checklist.map(check => {
    const ids = [...new Set(coverage.filter(item => item.target === check.target).flatMap(item => item.ids))];
    const official = ids.filter(id => isOfficial(sources[id - 1], officialDomain(check.vendor)));
    const findings = official.flatMap(id => {
      const event = eventFrom(sources[id - 1], check.kind, since, today);
      return event ? [{ ...event, citation: id }] : [];
    });
    const consistent = new Set(findings.map(finding => finding.status)).size === 1;
    const finding = consistent ? findings[0] : undefined;
    return { ...check, evidenceCount: ids.length, officialEvidenceCount: official.length,
      status: 'unable_to_verify', ...finding };
  });
}

