import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMiniAppRequestContext } from '../../.test-build/api/miniapp-request-context.js';

const telegramUser = { id: 123456, first_name: 'Анна', username: 'anna' };

test('Mini App request context rejects invalid Telegram init data without touching user or rate state', () => {
  const calls = [];
  const result = resolveMiniAppRequestContext('bad', 'GET', {
    verifyInitData(value) { calls.push(['verify', value]); throw new Error('invalid initData'); },
    getUser() { calls.push(['getUser']); return {}; },
    normalizeUser(value) { calls.push(['normalize', value]); return value; },
    checkRate() { calls.push(['rate']); return { limited: false }; }
  });
  assert.deepEqual(result, { kind: 'unauthorized', message: 'invalid initData' });
  assert.deepEqual(calls, [['verify', 'bad']]);
});

test('Mini App request context preserves verify → load/normalize → rate-limit order', () => {
  const calls = [];
  const result = resolveMiniAppRequestContext('signed-data', 'POST', {
    verifyInitData(value) { calls.push(['verify', value]); return telegramUser; },
    getUser(id) { calls.push(['getUser', id]); return { id, fullName: 'Анна' }; },
    normalizeUser(value) { calls.push(['normalize', value]); return { ...value, role: 'manager' }; },
    checkRate(id, method) { calls.push(['rate', id, method]); return { limited: false }; }
  });
  assert.equal(result.kind, 'authenticated');
  if (result.kind !== 'authenticated') assert.fail('expected authenticated context');
  assert.deepEqual(result.telegramUser, telegramUser);
  assert.deepEqual(result.user, { id: telegramUser.id, fullName: 'Анна', role: 'manager' });
  assert.deepEqual(calls.map(call => call[0]), ['verify', 'getUser', 'normalize', 'rate']);
});

test('Mini App request context returns rate-limit metadata after normalizing the user', () => {
  let normalized = false;
  const result = resolveMiniAppRequestContext('signed-data', 'POST', {
    verifyInitData() { return telegramUser; },
    getUser(id) { return { id }; },
    normalizeUser(value) { normalized = true; return value; },
    checkRate() { return { limited: true, retryAfter: 17 }; }
  });
  assert.equal(normalized, true);
  assert.deepEqual(result, { kind: 'rate-limited', retryAfter: 17 });
});
