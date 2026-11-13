import test from 'node:test';
import assert from 'node:assert/strict';
import { isOfficial, officialDomain, rankSources, summarizeChecks } from '../src/vendor-evidence.js';

const since = '2026-11-09';
const today = '2026-11-13';

test('only dated in-window first-party statements establish a change or no change', () => {
  const checklist = [
    { target: 1, vendor: 'HubSpot', kind: 'pricing' },
    { target: 2, vendor: 'Salesforce', kind: 'release' },
    { target: 3, vendor: 'Pipedrive', kind: 'pricing' },
    { target: 4, vendor: 'Zoho CRM', kind: 'release' },
    { target: 5, vendor: 'Freshsales', kind: 'pricing' },
  ];
  const sources = [
    { url: 'https://www.hubspot.com/pricing', text: 'The subscription price increased on November 11, 2026.' },
    { url: 'https://salesforce.com/releases', text: 'Version 4 preview announced on November 11, 2026; general availability is planned.' },
    { url: 'https://pipedrive-support.com/pricing', text: 'The subscription price increased on November 11, 2026.' },
    { url: 'https://zoho.com/crm/updates', text: 'No new releases shipped on November 12, 2026.' },
    { url: 'https://freshworks.com/pricing', text: 'Pricing remains unchanged as of November 12, 2026.' },
  ];
  const coverage = checklist.map(check => ({ target: check.target, ids: [check.target], failed: false }));
  const results = summarizeChecks(checklist, coverage, sources, since, today);
  assert.deepEqual(results.map(({ status }) => status), [
    'confirmed_change', 'unable_to_verify', 'unable_to_verify', 'no_change_found', 'no_change_found',
  ]);
  assert.equal(results[0].date, '2026-11-11');
  assert.equal(results[0].citation, 1);
  assert.equal(results[2].officialEvidenceCount, 0);
});

test('future, stale, undated, and ambiguous evidence stays unresolved', () => {
  const checklist = Array.from({ length: 4 }, (_, index) => ({
    target: index + 1, vendor: 'HubSpot', kind: 'pricing',
  }));
  const sources = [
    { url: 'https://hubspot.com/pricing', text: 'Pricing increased on November 8, 2026.' },
    { url: 'https://hubspot.com/pricing', text: 'Pricing will increase on November 12, 2026.' },
    { url: 'https://hubspot.com/pricing', text: 'Pricing increased recently.' },
    { url: 'https://hubspot.com/pricing', text: 'Pricing increased on November 10, 2026 and November 12, 2026.' },
  ];
  const results = summarizeChecks(checklist,
    checklist.map(check => ({ target: check.target, ids: [check.target] })), sources, since, today);
  assert.ok(results.every(({ status }) => status === 'unable_to_verify'));
});

test('official host matching rejects lookalike domains', () => {
  assert.equal(isOfficial({ url: 'https://support.hubspot.com/pricing' }, 'hubspot.com'), true);
  assert.equal(isOfficial({ url: 'https://hubspot.com.attacker.test/' }, 'hubspot.com'), false);
});

test('CRM aliases map to first-party hosts and relevant pages rank first', () => {
  assert.equal(officialDomain('Attio CRM'), 'attio.com');
  assert.equal(officialDomain('Close CRM'), 'close.com');
  assert.equal(officialDomain('Copper CRM'), 'copper.com');
  assert.equal(officialDomain('Insightly CRM'), 'insightly.com');
  const results = rankSources([
    { url: 'https://close.com/', title: 'Close CRM' },
    { url: 'https://blog.example.test/pricing', title: 'Pricing changes' },
    { url: 'https://close.com/pricing', title: 'Plans and pricing' },
  ], 'close.com', 'pricing');
  assert.deepEqual(results.map(({ url }) => url), [
    'https://close.com/pricing', 'https://close.com/', 'https://blog.example.test/pricing',
  ]);
});

test('no-change statements need a known comparison start', () => {
  const checks = [{ target: 1, vendor: 'HubSpot', kind: 'pricing' }];
  const coverage = [{ target: 1, ids: [1] }];
  const source = [{ url: 'https://hubspot.com/pricing', text: 'Pricing remains unchanged as of November 12, 2026.' }];
  assert.equal(summarizeChecks(checks, coverage, source, null, today)[0].status, 'unable_to_verify');
  assert.equal(summarizeChecks(checks, coverage, source, since, today)[0].status, 'no_change_found');
});
