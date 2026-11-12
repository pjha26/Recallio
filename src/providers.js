import { readPublicPage } from './pages.js';

const timeout = (signal, ms) => AbortSignal.any([signal, AbortSignal.timeout(ms)]);

async function json(url, options) {
  const response = await fetch(url, { ...options, redirect: 'error' });
  if (!response.ok) throw Object.assign(new Error('Provider request failed'), {
    status: response.status, retryAfter: response.headers.get('retry-after'),
  });
  return response.json();
}

export function createProviders(env) {
  const models = [];
  if (env.GROQ_API_KEY) models.push({
    name: 'Groq',
    call: async (system, input, signal) => {
      const data = await json('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.GROQ_API_KEY },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 2400,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: input }],
        }),
      });
      return data.choices?.[0]?.message?.content;
    },
  });
  if (env.GEMINI_API_KEY) models.push({
    name: 'Gemini',
    call: async (system, input, signal) => {
      const data = await json('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent', {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: input }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2400 },
        }),
      });
      return data.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text).join('');
    },
  });
  const endpoint = env.SEARXNG_URL ? new URL('search', env.SEARXNG_URL.replace(/\/?$/, '/')) : null;
  if (endpoint && !['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Invalid SEARXNG_URL');
  const cooldown = new Map();
  return {
    readPage: readPublicPage,
    available: models.length > 0,
    searchAvailable: Boolean(endpoint || env.EXA_API_KEY),
    async model(system, input, validate, signal, onFallback) {
      for (const model of models) {
        if (signal.aborted) break;
        if ((cooldown.get(model.name) ?? 0) > Date.now()) continue;
        try {
          return validate(JSON.parse(await model.call(system, JSON.stringify(input), timeout(signal, 8000))));
        } catch (error) {
          if (error.status === 429) {
            const seconds = Number(error.retryAfter);
            const wait = error.retryAfter && Number.isFinite(seconds) ? seconds * 1000 :
              Math.max(1000, Date.parse(error.retryAfter) - Date.now()) || 30000;
            cooldown.set(model.name, Date.now() + wait);
          }
          if (models.length > 1 && model === models[0]) onFallback?.('Trying the backup model');
        }
      }
      throw new Error('Models are unavailable. Please retry.');
    },
    async search(query, objective, since, signal) {
      let data;
      if (endpoint) {
        const url = new URL(endpoint);
        url.search = new URLSearchParams({ q: query, format: 'json', categories: 'general' });
        data = await json(url, { signal: timeout(signal, 5500) });
        if (!data.results?.length && data.unresponsive_engines?.length) {
          throw Object.assign(new Error('Search engines unavailable'), { code: 'upstream-engines' });
        }
      } else {
        if (!env.EXA_API_KEY) throw new Error('Web search is unconfigured');
        data = await json('https://api.exa.ai/search', {
          method: 'POST', signal: timeout(signal, 4500),
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.EXA_API_KEY },
          body: JSON.stringify({ query, objective,
            ...(since ? { startPublishedDate: since } : {}), contents: { highlights: true } }),
        });
      }
      if (!Array.isArray(data.results)) throw new Error('Invalid search response');
      return data.results.slice(0, 5).flatMap(result => {
        try {
          const url = new URL(result.url);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return [];
          url.hash = '';
          const text = result.highlights?.join(' ') || result.content || result.text || '';
          return [{ url: url.href, title: String(result.title || url.hostname).slice(0, 160),
            text: String(text).slice(0, 550), date: result.publishedDate || null }];
        } catch { return []; }
      });
    },
  };
}

