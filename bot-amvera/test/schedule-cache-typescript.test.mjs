import test from 'node:test';
import assert from 'node:assert/strict';
import { ScheduleCache } from '../../.test-build/cache.js';

const quiet = { log() {}, warn() {}, error() {} };

test('returns cached items until TTL expires', async () => {
  let now = 1000;
  let calls = 0;
  const cache = new ScheduleCache({ ttlMs: 100, now: () => now, logger: quiet, load: async () => [{ subject: String(++calls) }] });
  assert.deepEqual(await cache.get('group'), [{ subject: '1' }]);
  assert.deepEqual(await cache.get('group'), [{ subject: '1' }]);
  assert.equal(calls, 1);
  now = 1200;
  assert.deepEqual(await cache.get('group'), [{ subject: '2' }]);
});

test('deduplicates simultaneous requests', async () => {
  let calls = 0;
  let resolveLoad;
  const cache = new ScheduleCache({ logger: quiet, load: async () => { calls++; return new Promise(resolve => { resolveLoad = resolve; }); } });
  const first = cache.get('group');
  const second = cache.get('group');
  assert.equal(calls, 1);
  resolveLoad([{ subject: 'Math' }]);
  assert.deepEqual(await Promise.all([first, second]), [[{ subject: 'Math' }], [{ subject: 'Math' }]]);
});

test('serves expired cache when refresh fails', async () => {
  let now = 0;
  let fail = false;
  const cache = new ScheduleCache({ ttlMs: 10, now: () => now, logger: quiet, load: async () => { if (fail) throw new Error('offline'); return [{ subject: 'History' }]; } });
  assert.deepEqual(await cache.get('group'), [{ subject: 'History' }]);
  now = 20;
  fail = true;
  assert.deepEqual(await cache.get('group'), [{ subject: 'History' }]);
});

test('Mini App receives stale data immediately and refreshes in background', async () => {
  let now = 0;
  let resolveLoad;
  let calls = 0;
  const cache = new ScheduleCache({ ttlMs: 10, now: () => now, logger: quiet, load: async () => { calls++; if (calls === 1) return [{ subject: 'Math' }]; return new Promise(resolve => { resolveLoad = resolve; }); } });
  await cache.get('group');
  now = 20;
  assert.deepEqual(cache.getImmediate('group'), { items: [{ subject: 'Math' }], loading: true });
  assert.equal(calls, 2);
  resolveLoad([{ subject: 'Physics' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(cache.getImmediate('group'), { items: [{ subject: 'Physics' }], loading: false });
});
