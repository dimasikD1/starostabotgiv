import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoleViewAction } from '../domain/.build/role-view-command-input.js';

test('defaults /role and /roles to showing assignments', () => {
  assert.equal(parseRoleViewAction('/role'), 'show');
  assert.equal(parseRoleViewAction('/roles   '), 'show');
});

test('accepts the student self-demotion action case-insensitively', () => {
  assert.equal(parseRoleViewAction('/role student'), 'student');
  assert.equal(parseRoleViewAction('/roles STUDENT'), 'student');
});

test('rejects unknown or extra role actions', () => {
  assert.equal(parseRoleViewAction('/role admin'), 'invalid');
  assert.equal(parseRoleViewAction('/role student extra'), 'invalid');
});
