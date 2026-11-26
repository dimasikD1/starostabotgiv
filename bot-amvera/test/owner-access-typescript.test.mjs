import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwnerId } from '../domain/.build/owner-access.js';

test('matches owner identifiers after string normalization', () => {
  assert.equal(isOwnerId(123, ['123']), true);
  assert.equal(isOwnerId('123', ['123']), true);
});

test('does not match an identifier that is not in the owner list', () => {
  assert.equal(isOwnerId('456', ['123']), false);
  assert.equal(isOwnerId('', []), false);
});
