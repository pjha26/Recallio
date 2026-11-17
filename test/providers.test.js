import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviders, searchFailureReason } from '../src/providers.js';

test('SearXNG keeps partial results and reports an upstream outage without calling Exa', async t => {
  let results = [{ url: 'https://supabase.com/pricing', title: 'Pricing', content: 'Plan details' }];
  const requests = t.mock.method(globalThis, 'fetch', async () => Response.json({
    results,
    unresponsive_engines: [['example engine', 'timeout']],
  }));
  const providers = createProviders({ SEARXNG_URL: 'http://127.0.0.1:43193', EXA_API_KEY: 'unused-test-key' });
  const signal = new AbortController().signal;
  const search = () => providers.search('Supabase pricing', 'Find official pricing', null, signal);
  assert.equal((await search())[0].url, 'https://supabase.com/pricing');
  results = [];
  await assert.rejects(search(), error => searchFailureReason(error, signal) === 'upstream-engines');
  assert.equal(requests.mock.callCount(), 2);
  for (const { arguments: [url] } of requests.mock.calls) {
    assert.equal(new URL(url).hostname, '127.0.0.1');
    assert.equal(new URL(url).searchParams.get('format'), 'json');
  }
});
