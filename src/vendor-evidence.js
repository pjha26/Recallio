const domains = {
  hubspot: 'hubspot.com',
  salesforce: 'salesforce.com',
  pipedrive: 'pipedrive.com',
  'zoho crm': 'zoho.com',
  freshsales: 'freshworks.com',
  attio: 'attio.com',
  close: 'close.com',
  copper: 'copper.com',
  insightly: 'insightly.com',
  supabase: 'supabase.com',
  neon: 'neon.tech',
};

const officialPages = {
  'zoho crm': { pricing: 'https://www.zoho.com/crm/zohocrm-pricing.html' },
  pipedrive: { release: 'https://www.pipedrive.com/en/product-updates' },
  supabase: { pricing: 'https://supabase.com/pricing', release: 'https://supabase.com/changelog' },
};

export function knownOfficialPage(vendor, kind) {
  const name = vendor.toLowerCase().trim();
  return Object.hasOwn(officialPages, name) ? officialPages[name][kind] : undefined;
}

export function officialDomain(vendor) {
  const name = vendor.toLowerCase().trim();
  if (Object.hasOwn(domains, name)) return domains[name];
  if (name.startsWith('supabase ')) return domains.supabase;
  if (name.startsWith('salesforce ')) return domains.salesforce;
  if (name.startsWith('hubspot ')) return domains.hubspot;
  if (name.startsWith('freshsales ')) return domains.freshsales;
  for (const vendor of ['attio', 'close', 'copper', 'insightly']) {
    if (name.startsWith(vendor + ' ')) return domains[vendor];
  }
  return undefined;
}

export function isOfficial(source, domain) {
  if (!domain || !source) return false;
  const { hostname } = new URL(source.url);
  return hostname === domain || hostname.endsWith('.' + domain);
}

export function vendorSearchQuery(vendor, kind, since) {
  const domain = officialDomain(vendor);
  return vendor + (kind === 'pricing' ? ' official pricing plans' : ' official changelog shipped releases') +
    (kind === 'release' && since ? ' since ' + since : '') + (domain ? ' site:' + domain : '');
}

export function rankSources(sources, domain, kind) {
  const relevant = kind === 'pricing' ? /pricing|plans|billing|subscription|prices?/i :
    kind === 'release' ? /changelog|releases?|product updates?|what.s new/i : null;
  return sources.toSorted((a, b) => {
    const score = source => Number(isOfficial(source, domain)) * 2 +
      Number(relevant?.test(new URL(source.url).pathname + ' ' + source.title) ?? false);
    return score(b) - score(a);
  });
}

const months = 'january february march april may june july august september october november december'.split(' ');
const namedMonth = months.map(month => month + '|' + month.slice(0, 3)).join('|');
const datePattern = new RegExp(
  '\\b(20\\d{2}-\\d{2}-\\d{2})\\b|\\b(' + namedMonth + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b' +
  '|\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + namedMonth + ')\\s+(20\\d{2})\\b', 'gi');

function explicitDates(text) {
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
  return [...dates];
}

function eventsFrom(source, kind, since, today) {
  const events = [];
  const candidates = [source.text, source.pageText ?? ''].flatMap(text =>
    text.split(/\r?\n|(?<=[.!?])\s+/).map(quote => quote.trim()));
  for (const quote of candidates) {
    if (!quote || quote.length > 700 || /\b(?:preview|beta|planned|upcoming|expected|will|would|may|might|not yet)\b/i.test(quote)) continue;
    const dates = explicitDates(quote);
    const unchanged = kind === 'pricing'
      ? /\b(?:pricing|prices?|subscription (?:rates?|fees?))\s+(?:(?:has|have|did|was|were)\s+)?(?:remain(?:s|ed)? unchanged|unchanged|not changed|not change|stayed the same)\b/i
      : /\bno (?:major |new )?(?:releases?|versions?) (?:shipped|launched|were released)\b/i;
    const interval = /\bfrom (.+?) (?:through|to) (.+)$/i.exec(quote);
    if (since && unchanged.test(quote) && interval && dates.length === 2 &&
        explicitDates(interval[1])[0] === since && explicitDates(interval[2])[0] === today) {
      events.push({ status: 'no_change_found', date: today, quote });
      continue;
    }
    const [date] = dates;
    if (dates.length !== 1 || date > today || (since && date < since)) continue;
    if (/\b(?:no|not|never|unchanged|didn['’]t|hasn['’]t|without)\b/i.test(quote)) continue;
    const changed = kind === 'pricing'
      ? /\b(?:pricing|prices?|subscription (?:rates?|fees?))\s+(?:(?:has|have|was|were)\s+)?(?:changed|increased|decreased|rose|fell|raised|lowered)\b|\b(?:new|updated) (?:prices?|pricing)\s+(?:took effect|became effective)\b/i
      : /\b(?:shipped|launched|was released|were released|went live|became generally available|is now generally available)\b/i;
    if (changed.test(quote)) events.push({ status: 'confirmed_change', date, quote });
  }
  return events;
}

export function summarizeChecks(checklist, coverage, sources, since, today) {
  return checklist.map(check => {
    const ids = [...new Set(coverage.filter(item => item.target === check.target).flatMap(item => item.ids))];
    const official = ids.filter(id => isOfficial(sources[id - 1], officialDomain(check.vendor)));
    const findings = official.filter(id => !sources[id - 1].releaseIndex).flatMap(id =>
      eventsFrom(sources[id - 1], check.kind, since, today).map(event => ({ ...event, citation: id })));
    const consistent = new Set(findings.map(finding => finding.status)).size === 1;
    const finding = consistent ? findings[0] : undefined;
    return { ...check, evidenceCount: ids.length, officialEvidenceCount: official.length,
      status: 'unable_to_verify', ...finding };
  });
}
