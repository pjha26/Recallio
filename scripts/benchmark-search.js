import { normalizeSearchResults, querySearxng, searchFailureReason } from '../src/providers.js';
import { isOfficial, officialDomain, vendorSearchQuery } from '../src/vendor-evidence.js';

const url = process.env.SEARXNG_URL;
if (!url || !['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Set SEARXNG_URL to a SearXNG HTTP(S) endpoint.');
const repeats = Number(process.env.SEARCH_BENCH_RUNS ?? 3);
const widths = (process.env.SEARCH_BENCH_WORKERS ?? '1,2,4').split(',').map(Number);
const groups = (process.env.SEARCH_BENCH_ENGINES ?? 'default').split(',');
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5 ||
    widths.length > 3 || widths.some(width => ![1, 2, 4].includes(width)) ||
    groups.length > 4 || groups.some(group => !/^[a-z0-9-]+$/.test(group))) {
  throw new Error('Use 1–5 runs, worker counts from 1,2,4, and up to four comma-separated SearXNG engine shortcuts.');
}

const checks = ['HubSpot', 'Salesforce', 'Pipedrive', 'Zoho CRM', 'Freshsales'].flatMap(vendor =>
  ['pricing', 'release'].map(kind => ({ vendor, kind, query: vendorSearchQuery(vendor, kind, '2026-11-09') })));

for (let run = 1; run <= repeats; run++) {
  for (const group of groups) {
    for (const workers of widths) {
      const start = performance.now();
      const results = [];
      let next = 0;
      await Promise.all(Array.from({ length: workers }, async () => {
        while (next < checks.length) {
          const index = next++;
          const { vendor, kind, query } = checks[index];
          const started = performance.now();
          const label = vendor + ' ' + kind;
          try {
            const data = await querySearxng(url, group === 'default' ? query : '!' + group + ' ' + query,
              AbortSignal.timeout(6500));
            const hits = normalizeSearchResults(data);
            const official = hits.find(source => isOfficial(source, officialDomain(vendor)));
            results[index] = { label, ms: Math.round(performance.now() - started),
              official: Boolean(official), officialUrl: official?.url,
              results: hits.length, engines: [...new Set(data.results.flatMap(item => item.engines ?? []))],
              failures: data.unresponsive_engines ?? [] };
          } catch (error) {
            results[index] = { label, ms: Math.round(performance.now() - started), official: false,
              error: searchFailureReason(error) };
          }
        }
      }));
      console.log(JSON.stringify({ run, group, workers, official: results.filter(row => row.official).length,
        expected: checks.length, elapsedMs: Math.round(performance.now() - start), results }));
    }
  }
}
