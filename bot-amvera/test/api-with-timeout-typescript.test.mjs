import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from '../api/with-timeout-entry.mjs';

test('returns the operation result when it finishes before the deadline', async () => {
  assert.equal(await withTimeout(Promise.resolve('ok'), 100, 'timeout'), 'ok');
});

test('rejects with the supplied message when the operation exceeds the deadline', async () => {
  await assert.rejects(
    withTimeout(new Promise(resolve => setTimeout(resolve, 30)), 2, 'request timed out'),
    /request timed out/
  );
});

test('propagates an operation error', async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error('source failed')), 100, 'timeout'), /source failed/);
});
