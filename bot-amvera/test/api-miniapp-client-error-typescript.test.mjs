import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMiniAppClientError } from '../api/.build/miniapp-client-error.js';

test('sanitizes browser diagnostics and preserves the expected log shape', () => {
  const result = sanitizeMiniAppClientError({
    kind: 'unhandledrejection',
    message: 'broken\nscript\tload',
    source: '/app.js',
    line: '12',
    column: 4,
    stage: 'startup',
    stack: 'Error: broken\n at app.js:12'
  }, '2026-11-23T12:00:00.000Z');

  assert.deepEqual(result, {
    kind: 'unhandledrejection',
    message: 'broken script load',
    source: '/app.js',
    line: 12,
    column: 4,
    stage: 'startup',
    stack: 'Error: broken  at app.js:12',
    receivedAt: '2026-11-23T12:00:00.000Z'
  });
});

test('applies legacy defaults to missing or non-object payloads', () => {
  assert.deepEqual(sanitizeMiniAppClientError(null, 'fixed-time'), {
    kind: 'error',
    message: 'unknown',
    source: '',
    line: 0,
    column: 0,
    stage: 'unknown',
    stack: '',
    receivedAt: 'fixed-time'
  });
  assert.equal(sanitizeMiniAppClientError(['ignored'], 'fixed-time').message, 'unknown');
});

test('caps every text field and rejects unsafe numeric positions', () => {
  const result = sanitizeMiniAppClientError({
    kind: 'k'.repeat(60),
    message: 'm'.repeat(600),
    source: 's'.repeat(600),
    line: Number.MAX_SAFE_INTEGER + 1,
    column: 'not-a-number',
    stage: 'x'.repeat(140),
    stack: 'z'.repeat(3000)
  }, 'fixed-time');

  assert.equal(result.kind.length, 40);
  assert.equal(result.message.length, 500);
  assert.equal(result.source.length, 500);
  assert.equal(result.line, 0);
  assert.equal(result.column, 0);
  assert.equal(result.stage.length, 120);
  assert.equal(result.stack.length, 2500);
});
