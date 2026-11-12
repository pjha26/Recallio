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
