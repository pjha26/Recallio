import test from 'node:test';
import assert from 'node:assert/strict';
import { answerTurn, validateEvidenceChecks } from '../src/agent.js';

test('claim checks require an exact quote that supports the kind of claim', () => {
  const cases = [
    ['base_price', 'The Pro subscription starts at $25 per month.', 'A $10 compute credit is included with the Pro plan.'],
    ['shipped', 'Version 4 shipped on November 11, 2026.', 'Version 4 preview announced on November 11, 2026; general availability is planned.'],
    ['price_change', 'The subscription price increased on November 11, 2026.', 'The current plan price is $25 per month.'],
  ];
  for (const [kind, supported, unsupported] of cases) {
    const evidence = [{ text: unsupported, pageText: supported }];
    assert.doesNotThrow(() => validateEvidenceChecks([{ kind, id: 1, quote: supported }], [1], evidence));
    assert.throws(() => validateEvidenceChecks([{ kind, id: 1, quote: unsupported }], [1], evidence));
    assert.throws(() => validateEvidenceChecks([{ kind, id: 1, quote: supported + ' Invented.' }], [1], evidence));
  }
});

test('a rejected claim returns the checked sources without repeating the claim', async () => {
  const url = 'https://example.com/pricing';
  const result = await answerTurn({
    question: 'What is the current Pro subscription price?', history: [], zone: 'UTC',
    now: '2026-11-12T15:00:00Z', progress() {}, signal: new AbortController().signal,
    providers: {
      async search() {
        return [{ url, title: 'Pricing', text: 'The Pro plan includes a $10 compute credit.' }];
      },
      async model(_prompt, input, validate) {
        if (!input.evidence) return validate({ focus: 'Pro price', review: false,
          queries: [{ query: 'Pro pricing', objective: 'Find the base price', since: null }] });
        return validate({ answer: 'The Pro price is $10 [1].', citations: [1],
          checks: [{ kind: 'base_price', id: 1, quote: 'The Pro plan includes a $10 compute credit.' }] });
      },
    },
  });
  assert.equal(result.unverified, true);
  assert.equal(result.sources[0].url, url);
  assert.doesNotMatch(result.answer, /\$10/);
});

test('an unresolved checklist cannot be contradicted by a no-change summary', async () => {
  const result = await answerTurn({
    question: 'Did ExampleCorp change pricing?', history: [], zone: 'UTC',
    now: '2026-11-12T15:00:00Z', progress() {}, signal: new AbortController().signal,
    providers: {
      async search() {
        return [{ url: 'https://example.test/pricing', title: 'Pricing', text: 'The current plan starts at $20.' }];
      },
      async model(_prompt, input, validate) {
        if (!input.evidence) return validate({ focus: 'Pricing', review: false, queries: [],
          targets: [{ vendor: 'ExampleCorp', kinds: ['pricing'] }] });
        return validate({ answer: 'There have been no reported price changes since Monday.', citations: [], checks: [] });
      },
    },
  });
  assert.equal(result.unverified, true);
  assert.match(result.answer, /couldn’t verify this check/);
  assert.equal(result.checklist[0].status, 'unable_to_verify');
});

test('partial search excerpts cannot support a claim about missing changelog entries', async () => {
  const result = await answerTurn({
    question: 'Did HubSpot ship anything since 2026-11-09?', history: [], zone: 'UTC',
    now: '2026-11-12T15:00:00Z', progress() {}, signal: new AbortController().signal,
    providers: {
      async search() {
        return [{ url: 'https://hubspot.com/changelog', title: 'Changelog', text: 'Recent product updates.' }];
      },
      async model(prompt, input, validate) {
        if (!input.evidence) return validate({ focus: 'Product updates', review: true, queries: [],
          targets: [{ vendor: 'HubSpot', kinds: ['release'] }] });
        if (prompt.startsWith('Return JSON only with a queries array')) return validate({ queries: [] });
        return validate({ answer: 'The changelog does not contain entries for that period [1].', citations: [1], checks: [] });
      },
    },
  });
  assert.equal(result.unverified, true);
  assert.equal(result.checklist[0].status, 'unable_to_verify');
  assert.doesNotMatch(result.answer, /does not contain entries/);
});

test('a price quote cannot be used to change the amount, plan, or billing period', async () => {
  const quote = 'The Pro subscription starts at $25 per month.';
  for (const [price, usedFallback] of [[quote, false], [quote.replace('$25', '$250'), true],
    [quote.replace('Pro', 'Enterprise'), true], [quote.replace('month', 'year'), true]]) {
    const result = await answerTurn({
      question: 'What does Pro cost?', history: [], zone: 'UTC', now: '2026-11-12T15:00:00Z',
      progress() {}, signal: new AbortController().signal,
      providers: {
        async search() { return [{ url: 'https://example.com/pricing', title: 'Pricing', text: quote }]; },
        async model(_prompt, input, validate) {
          if (!input.evidence) return validate({ focus: 'Pro price', review: false,
            queries: [{ query: 'Pro pricing', objective: 'Find subscription price', since: null }] });
          return validate({ answer: price === quote ? '{{price:1}}' : `“${price}” [1]`, citations: [1],
            checks: [{ kind: 'base_price', id: 1, quote }] });
        },
      },
    });
    assert.equal(Boolean(result.unverified), usedFallback);
    assert.equal(result.answer.includes(price), !usedFallback);
    assert.ok(result.answer.includes(quote));
  }
});

test('historical comparisons with an absent or invented baseline ask for clarification before search', async () => {
  for (const baseline of [null, '2026-11-01T12:00:00Z']) {
    const result = await answerTurn({
      question: 'Has Supabase pricing changed since our chat?', history: [], zone: 'UTC', now: '2026-11-12T15:00:00Z',
      progress() {}, signal: new AbortController().signal,
      providers: {
        async search() { assert.fail('Historical search requires a start date'); },
        async model(_prompt, _input, validate) {
          return validate({ focus: 'Price changes', review: false, comparison: false, queries: [],
            baseline, targets: [{ vendor: 'Supabase', kinds: ['pricing'] }] });
        },
      },
    });
    assert.match(result.answer, /couldn’t establish a start date/);
    assert.equal(result.comparisonStart, null);
    assert.equal(result.checklist[0].status, 'unable_to_verify');
  }
});

test('when search fails, the fallback recalls the matched question without inventing current facts', async () => {
  const prior = { timestamp: '2026-11-03T12:00:00Z', date: '2026-11-03',
    question: 'What does the Supabase Pro plan cost?', answer: 'It costs $25.' };
  let synthesisCalls = 0;
  const result = await answerTurn({
    question: 'What did I ask on 3 November? Is your answer still correct?', history: [prior], zone: 'UTC',
    now: '2026-11-12T15:00:00Z', progress() {}, signal: new AbortController().signal,
    providers: {
      async search() { throw new Error('Search unavailable'); },
      async model(prompt, input, validate) {
        if (!input.evidence) return validate({ focus: 'Recall and verify', queries: [], review: true,
          baseline: prior.timestamp, targets: [{ vendor: 'Supabase', kinds: ['pricing'] }] });
        if (prompt.startsWith('Return JSON only with a queries array')) return validate({ queries: [] });
        synthesisCalls++;
        throw new Error('Synthesis should be skipped');
      },
    },
  });
  assert.equal(synthesisCalls, 0);
  assert.ok(result.answer.includes(prior.question));
  assert.match(result.answer, /Web search failed/);
  assert.doesNotMatch(result.answer, /\$25/);
  assert.deepEqual(result.sources, []);
});
