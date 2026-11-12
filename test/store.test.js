import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.js';

test('turns survive restart and retry without duplication or session leakage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'recallio-'));
  const path = join(dir, 'test.sqlite');
  const input = { id: '1', chat: 'chat', question: 'Postgres hosting?', zone: 'UTC' };
  const now = '2026-11-03T12:00:00Z';
  let store = openStore(path);
  try {
    assert.equal(store.start('alice', input, now), 'started');
    assert.equal(store.start('alice', { ...input, id: '2' }, now), 'busy');
    assert.equal(store.start('alice', { ...input, question: 'changed' }, now), 'conflict');
    store.close();
    store = openStore(path);
    assert.equal(store.history('alice', 'chat')[0].state, 'interrupted');
    assert.equal(store.start('alice', input, now), 'started');
    const result = { answer: 'Saved', sources: [] };
    store.finish('alice', input.id, result);
    assert.deepEqual(store.start('alice', input, now), result);
    assert.equal(store.history('alice', 'chat').length, 1);
    assert.equal(store.memory('bob').length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true });
  }
});
