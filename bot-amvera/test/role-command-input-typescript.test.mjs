import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStudyGroupNumber } from '../../.test-build/domain/role-command-input.js';

test('parses supported numbered study groups with flexible whitespace', () => {
  assert.equal(parseStudyGroupNumber('/starosta 1'), '1');
  assert.equal(parseStudyGroupNumber('/zam    2'), '2');
  assert.equal(parseStudyGroupNumber('/setstarosta@starostagivbot 1'), '1');
});

test('rejects missing, unsupported, and malformed group numbers', () => {
  for (const value of ['', '/starosta', '/starosta 3', null, 42]) {
    assert.equal(parseStudyGroupNumber(value), null);
  }
});
