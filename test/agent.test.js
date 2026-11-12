import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHistory, answerTurn } from '../src/agent.js';
import { createProviders } from '../src/providers.js';

test('a dated turn outranks newer unrelated conversations', () => {
  const makeTurn = (created, question) => ({ chat: 'old', created, question, result: JSON.stringify({ answer: 'Original answer' }) });
  const history = [makeTurn('2026-11-11T12:00:00Z', 'Another question'), makeTurn('2026-11-03T12:00:00Z', 'Postgres hosting?')];
  const matches = selectHistory(history, 'new', 'What did I ask on 3 November?', 'Asia/Kolkata', '2026-11-12T12:00:00Z');
  assert.equal(matches[0].question, 'Postgres hosting?');
});

test('Gemini completes the answer using existing evidence after Groq fails', async t => {
  const calls = [];
  const groq = value => Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
  t.mock.method(globalThis, 'fetch', async (url, { body }) => {
    const host = new URL(url).hostname;
    calls.push(host);
    if (host === 'api.exa.ai') {
      assert.deepEqual(JSON.parse(body), {
        query: 'Example pricing', objective: 'Prefer the vendor pricing page and extract the current price.',
        contents: { highlights: true },
      });
      return Response.json({
      results: [{ url: 'https://example.com/pricing', title: 'Official pricing', highlights: ['The current price is $20.'] }],
      });
    }
    if (host === 'api.groq.com' && calls.length === 1) return groq({
      focus: 'Verify price', review: false, queries: [{
        query: 'Example pricing', objective: 'Prefer the vendor pricing page and extract the current price.', since: null,
      }],
    });
    if (host === 'api.groq.com') return new Response('', { status: 503 });
    assert.match(body, /current price is/);
    return Response.json({ candidates: [{ content: { parts: [{
      text: JSON.stringify({ answer: 'The current price is $20 [1]. I could not verify the historical price.', citations: [1] }),
    }] } }] });
  });
  const result = await answerTurn({ question: 'Has pricing changed?', history: [], zone: 'UTC',
    now: '2026-11-12T12:00:00Z', providers: createProviders({
      GROQ_API_KEY: 'fixture', GEMINI_API_KEY: 'fixture', EXA_API_KEY: 'fixture',
    }), progress() {}, signal: new AbortController().signal });
  assert.deepEqual(calls, ['api.groq.com', 'api.exa.ai', 'api.groq.com', 'generativelanguage.googleapis.com']);
  assert.equal(result.sources[0].url, 'https://example.com/pricing');
});

test('one follow-up targets missing dated evidence and preserves verified results', async () => {
  const query = (text, since = null) => ({ query: text, objective: 'Find official evidence.', since });
  const searches = [];
  let modelCalls = 0;
  const source = (vendor, date, text) => ({ url: `https://${vendor}.example/pricing`, title: vendor, date, text });
  const result = await answerTurn({
    question: 'Has pricing changed since Monday for A, B, or C?', history: [], zone: 'UTC',
    now: '2026-11-12T12:00:00Z', progress() {}, signal: new AbortController().signal,
    providers: {
      async search(text, objective, since) {
        searches.push({ text, since });
        if (text === 'A pricing') throw new Error('Timeout');
        if (text === 'B pricing') return [source('b', null, 'Today the plan is $20.')];
        if (text === 'C pricing') return [source('c', '2026-11-11', 'The new price took effect on November 11.')];
        return [];
      },
      async model(prompt, input, validate) {
        modelCalls++;
        if (modelCalls === 1) return validate({ focus: 'Price changes', review: true,
          queries: ['A', 'B', 'C'].map(vendor => query(vendor + ' pricing')) });
        if (modelCalls === 2) {
          assert.equal(input.coverage[0].failed, true);
          assert.equal(input.evidence[0].date, null);
          return validate({ queries: [query('B dated price announcement', '2026-11-09')], read: [1] });
        }
        assert.equal(input.coverage.length, 4);
        assert.deepEqual(input.coverage[3].ids, []);
        assert.equal(input.evidence[1].domain, 'c.example');
        assert.equal(input.evidence[0].pageText, 'Pro costs $20 per month.');
        return validate({ answer: 'C changed on November 11 [2]. I could not verify changes for A or B.', citations: [2] });
      },
      async readPage(url) {
        assert.equal(url, 'https://b.example/pricing');
        return 'Pro costs $20 per month.';
      },
    },
  });
  assert.equal(modelCalls, 3);
  assert.deepEqual(searches.map(item => item.text), ['A pricing', 'B pricing', 'C pricing', 'B dated price announcement']);
  assert.equal(searches[3].since, '2026-11-09T00:00:00.000Z');
  assert.equal(result.sources[0].url, 'https://c.example/pricing');
  assert.match(result.answer, /could not verify changes for A or B/);
});
