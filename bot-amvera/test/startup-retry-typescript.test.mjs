import test from 'node:test';
import assert from 'node:assert/strict';
import { executeWithRetry } from '../domain/.build/startup-retry.js';

test('returns immediately when the startup operation succeeds', async () => {
  let calls = 0;
  const result = await executeWithRetry({
    operation: async () => { calls += 1; return 'ready'; },
    wait: async () => assert.fail('wait must not run after success'),
    createFinalError: () => new Error('unexpected')
  });
  assert.equal(result, 'ready');
  assert.equal(calls, 1);
});

test('retries with the bounded exponential backoff and returns the successful result', async () => {
  let calls = 0;
  const delays = [];
  const retryErrors = [];
  const result = await executeWithRetry({
    attempts: 5,
    operation: async () => {
      calls += 1;
      if (calls < 4) throw new Error('temporary');
      return 42;
    },
    wait: async milliseconds => { delays.push(milliseconds); },
    onRetry: (error, attempt, attempts) => retryErrors.push([error.message, attempt, attempts]),
    createFinalError: () => new Error('not expected')
  });
  assert.equal(result, 42);
  assert.equal(calls, 4);
  assert.deepEqual(delays, [1500, 3000, 6000]);
  assert.deepEqual(retryErrors.map(x => x.slice(1)), [[1, 5], [2, 5], [3, 5]]);
});

test('caps exponential backoff at ten seconds', async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(executeWithRetry({
    attempts: 5,
    operation: async () => { calls += 1; throw new Error('offline'); },
    wait: async milliseconds => { delays.push(milliseconds); },
    createFinalError: (error, attempts) => new Error(error.message + ':' + attempts)
  }), /offline:5/);
  assert.equal(calls, 5);
  assert.deepEqual(delays, [1500, 3000, 6000, 10000]);
});

test('validates retry count and delay values', async () => {
  await assert.rejects(executeWithRetry({
    attempts: 0, operation: async () => 'x', wait: async () => {},
    createFinalError: () => new Error('unexpected')
  }), /positive integer/);
  await assert.rejects(executeWithRetry({
    attempts: 2, delayForAttempt: () => -1,
    operation: async () => { throw new Error('offline'); },
    wait: async () => {}, createFinalError: () => new Error('unexpected')
  }), /non-negative finite number/);
});
