import test from 'node:test';
import assert from 'node:assert/strict';
import { getCachedSchedule, getImmediateSchedule } from '../../.test-build/cache-access.js';

test('normalizes cache group and applies default seven-day horizon', async () => {
  const calls = [];
  const cache = {
    async get(group, days) { calls.push([group, days]); return ['lesson']; },
    getImmediate(group, days) { calls.push([group, days]); return { items: ['cached'], loading: true }; }
  };
  assert.deepEqual(await getCachedSchedule(cache, 42), ['lesson']);
  assert.deepEqual(calls, [['42', 7]]);
});

test('passes explicit horizon and returns immediate cache snapshot', () => {
  const calls = [];
  const cache = {
    async get(group, days) { calls.push([group, days]); return []; },
    getImmediate(group, days) { calls.push([group, days]); return { items: ['old'], loading: false }; }
  };
  assert.deepEqual(getImmediateSchedule(cache, 'BIO', 14), { items: ['old'], loading: false });
  assert.deepEqual(calls, [['BIO', 14]]);
});
