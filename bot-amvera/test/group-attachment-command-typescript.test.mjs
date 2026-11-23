import test from 'node:test';
import assert from 'node:assert/strict';
import { decideAttachCommand, decideDetachCommand } from '../domain/.build/group-attachment-command.js';

test('attach is restricted to group chats and their administrators', () => {
  assert.equal(decideAttachCommand('private', true), 'not-group');
  assert.equal(decideAttachCommand('channel', true), 'not-group');
  assert.equal(decideAttachCommand('group', false), 'not-admin');
  assert.equal(decideAttachCommand('supergroup', false), 'not-admin');
  assert.equal(decideAttachCommand('group', true), 'attach');
  assert.equal(decideAttachCommand('supergroup', true), 'attach');
});

test('detach silently ignores non-group chats and requires group admin rights', () => {
  assert.equal(decideDetachCommand('private', true), 'ignore');
  assert.equal(decideDetachCommand('channel', true), 'ignore');
  assert.equal(decideDetachCommand('group', false), 'not-admin');
  assert.equal(decideDetachCommand('supergroup', false), 'not-admin');
  assert.equal(decideDetachCommand('group', true), 'detach');
  assert.equal(decideDetachCommand('supergroup', true), 'detach');
});
