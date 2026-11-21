import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../../.test-build/utils/html.js';

test('escapeHtml escapes HTML metacharacters in safe order', () => {
  assert.equal(escapeHtml('<tag a="b">& text'), '&lt;tag a="b"&gt;&amp; text');
});

test('escapeHtml handles nullish and non-string values', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('escapeHtml does not double-escape already escaped input differently than legacy behavior', () => {
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});
