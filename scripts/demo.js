import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../src/store.js';

const directory = mkdtempSync(join(tmpdir(), 'recallio-demo-'));
const session = randomUUID();
const chat = randomUUID();
const headers = { Cookie: 'recallio=' + session };
let child;

async function start() {
  const fixture = new URL('./demo-provider.js', import.meta.url).href;
  const server = fileURLToPath(new URL('../src/server.js', import.meta.url));
  child = spawn(process.execPath, ['--import', fixture, server], {
    cwd: directory, env: { ...process.env, PORT: '0', GROQ_API_KEY: 'demo-fixture',
      GEMINI_API_KEY: '', EXA_API_KEY: '', SEARXNG_URL: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const signal = AbortSignal.timeout(6000);
  const [chunk] = await Promise.race([
    once(child.stdout, 'data', { signal }),
    once(child, 'exit', { signal }).then(([code]) => { throw new Error('Server exited during startup with code ' + code); }),
  ]);
  const address = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  assert.ok(address, 'Server did not announce a localhost address');
  return address;
}

async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}

try {
  mkdirSync(join(directory, 'data'));
  const store = openStore(join(directory, 'data', 'recallio.sqlite'));
  const id = randomUUID();
  try {
    store.start(session, { id, chat, zone: 'UTC', question: 'What project codename did we choose?' }, new Date().toISOString());
    store.finish(session, id, { answer: 'The codename was Copper Kestrel.', sources: [] });
  } finally {
    store.close();
  }
  let base = await start();
  const previous = await fetch(base + '/api/history?chat=' + chat, { headers, signal: AbortSignal.timeout(5000) });
  assert.equal((await previous.json()).turns[0]?.result?.answer, 'The codename was Copper Kestrel.');
  await stop();
  base = await start();
  const result = await fetch(base + '/api/chat', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: randomUUID(), chat: randomUUID(), question: 'Using only our saved chat history, what project codename did we choose in the earlier chat? Do not search the web.', zone: 'UTC' }),
    signal: AbortSignal.timeout(45000) });
  assert.ok(result.ok);
  const events = (await result.text()).trim().split('\n').map(line => JSON.parse(line));
  const reply = events.find(event => event.result)?.result;
  assert.match(reply?.answer ?? '', /Copper Kestrel/i, 'New chat did not recall the saved codename');
  assert.equal(reply.coverage.length, 0, 'Recall-only request should not search the web');
  console.log('PASS: restarted the server and recalled the saved answer from a new chat.');
} finally {
  await stop();
  rmSync(directory, { recursive: true });
}
