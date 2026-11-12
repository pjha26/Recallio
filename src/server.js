import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { openStore } from './store.js';
import { answerTurn, selectHistory } from './agent.js';
import { createProviders } from './providers.js';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/chat.js', ['chat.js', 'text/javascript; charset=utf-8']],
  ['/retro.css', ['retro.css', 'text/css; charset=utf-8']],
  ['/terminal.png', ['terminal.png', 'image/png']],
  ['/terminal-violet.png', ['terminal-violet.png', 'image/png']],
  ['/memory-disk.png', ['memory-disk.png', 'image/png']],
  ['/memory-run.js', ['memory-run.js', 'text/javascript; charset=utf-8']],
  ['/workbench.woff2', ['workbench.woff2', 'font/woff2']],
]);
const providers = createProviders(process.env);
mkdirSync('data', { recursive: true });
const store = openStore('data/recallio.sqlite');
const idPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const validId = value => typeof value === 'string' && idPattern.test(value);
let active = 0;

function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

async function readTurn(req) {
  const buffers = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12000) throw new Error('Message too large');
    buffers.push(chunk);
  }
  const { chat, id, question, zone } = JSON.parse(Buffer.concat(buffers));
  if (!validId(chat) || !validId(id) || typeof question !== 'string' || !question.trim() || question.length > 3000 ||
      typeof zone !== 'string' || zone.length > 100) throw new Error('Invalid chat request');
  new Intl.DateTimeFormat('en', { timeZone: zone });
  return { chat, id, question: question.trim(), zone };
}

const server = createServer(async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && assets.has(url.pathname)) {
      const [file, type] = assets.get(url.pathname);
      res.writeHead(200, { 'Content-Type': type });
      return res.end(readFileSync(new URL('../public/' + file, import.meta.url)));
    }
    let session = req.headers.cookie?.match(/(?:^|;\s*)recallio=([^;]+)/)?.[1];
    if (!validId(session)) {
      session = randomUUID();
      res.setHeader('Set-Cookie', 'recallio=' + session + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000');
    }
    if (req.method === 'GET' && url.pathname === '/api/history') {
      const chat = url.searchParams.get('chat');
      if (chat && !validId(chat)) return send(res, 400, { error: 'Invalid chat' });
      return send(res, 200, {
        chats: store.chats(session), configured: providers.available && providers.searchAvailable,
        turns: chat ? store.history(session, chat).map(({ id, question, zone, state, result }) =>
          ({ id, question, zone, state, result: result && JSON.parse(result) })) : [],
      });
    }
    if (req.method !== 'POST' || url.pathname !== '/api/chat') return send(res, 404, { error: 'Not found' });
    if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers['content-type'] !== 'application/json')
      return send(res, 415, { error: 'Expected a same-site JSON request' });
    if (!providers.available) return send(res, 503, { error: 'Set GROQ_API_KEY or GEMINI_API_KEY in .env and restart.' });
    let turn;
    try { turn = await readTurn(req); } catch { return send(res, 400, { error: 'Invalid or oversized message.' }); }
    if (active >= 4) return send(res, 503, { error: 'The server is busy. Try again shortly.' });
    const now = new Date().toISOString();
    const status = store.start(session, turn, now);
    if (status === 'busy' || status === 'conflict') return send(res, 409, { error: 'This chat already has a conflicting request.' });
    if (status !== 'started') return send(res, 200, { result: status });

    active++;
    const cancellation = new AbortController();
    res.once('close', () => cancellation.abort());
    const signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(42000)]);
    const emit = event => { if (!res.destroyed) res.write(JSON.stringify(event) + '\n'); };
    try {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
      emit({ progress: 'Reading conversation history' });
      const history = selectHistory(store.memory(session), turn.chat, turn.question, turn.zone, now);
      const result = await answerTurn({ ...turn, now, history, providers, signal, progress: progress => emit({ progress }) });
      signal.throwIfAborted();
      store.finish(session, turn.id, result);
      emit({ result });
    } catch {
      store.finish(session, turn.id, null);
      emit({ error: 'The answer was interrupted. Please retry.' });
    } finally {
      active--;
      res.end();
    }
  } catch (error) {
    console.error('Request failed:', error.name);
    if (!res.headersSent) send(res, 500, { error: 'Request failed. Please retry.' });
    else res.end();
  }
});
server.requestTimeout = 15000;
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () =>
  console.log('Recallio is listening at http://127.0.0.1:' + server.address().port));
