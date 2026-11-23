import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoleRemovalTargetId } from '../domain/.build/role-removal-input.js';

test('reads the numeric target ID from /delrole and /removerole text', () => {
  assert.equal(parseRoleRemovalTargetId('/delrole 123456'), '123456');
  assert.equal(parseRoleRemovalTargetId('/removerole@starostagivbot 987654 extra'), '987654');
});

test('rejects missing and non-numeric target IDs', () => {
  assert.equal(parseRoleRemovalTargetId('/delrole'), undefined);
  assert.equal(parseRoleRemovalTargetId('/delrole abc'), undefined);
  assert.equal(parseRoleRemovalTargetId('/delrole 123abc'), undefined);
});
