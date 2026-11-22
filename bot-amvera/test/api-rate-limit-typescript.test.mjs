import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiRateLimiter, API_WINDOW_MS, API_READ_LIMIT, API_WRITE_LIMIT } from '../../.test-build/rate-limit.js';

test('API rate limiter applies independent read and write limits per user', () => {
  let now = 1_000_000;
  const check = createApiRateLimiter(() => now);
  for (let i = 0; i < API_READ_LIMIT; i += 1) assert.deepEqual(check(10, 'GET'), { limited: false });
  assert.deepEqual(check(10, 'GET'), { limited: true, retryAfter: 60 });
  for (let i = 0; i < API_WRITE_LIMIT; i += 1) assert.deepEqual(check(10, 'POST'), { limited: false });
  assert.deepEqual(check(10, 'POST'), { limited: true, retryAfter: 60 });
  assert.deepEqual(check(11, 'GET'), { limited: false });
});

test('API rate limiter resets a user bucket after the fixed window', () => {
  let now = 2_000_000;
  const check = createApiRateLimiter(() => now);
  for (let i = 0; i <= API_READ_LIMIT; i += 1) check('user', 'HEAD');
  assert.equal(check('user', 'HEAD').limited, true);
  now += API_WINDOW_MS;
  assert.deepEqual(check('user', 'HEAD'), { limited: false });
});
