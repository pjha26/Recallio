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
      focus: 'Verify price', queries: [{
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
