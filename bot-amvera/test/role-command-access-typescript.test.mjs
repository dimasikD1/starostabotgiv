import test from 'node:test';
import assert from 'node:assert/strict';
import { isRoleCommandGroupChat, canRunGroupRoleCommand } from '../../.test-build/domain/role-command-access.js';

test('accepts only Telegram group and supergroup chats', () => {
  assert.equal(isRoleCommandGroupChat('group'), true);
  assert.equal(isRoleCommandGroupChat('supergroup'), true);
  for (const type of ['private', 'channel', undefined, null]) {
    assert.equal(isRoleCommandGroupChat(type), false);
  }
});

test('self-starosta and deputy commands allow owner or group admin only in groups', () => {
  for (const command of ['starosta', 'zam']) {
    assert.equal(canRunGroupRoleCommand(command, 'group', true, false), true);
    assert.equal(canRunGroupRoleCommand(command, 'supergroup', false, true), true);
    assert.equal(canRunGroupRoleCommand(command, 'group', false, false), false);
    assert.equal(canRunGroupRoleCommand(command, 'private', true, true), false);
  }
});

test('appoint and demote commands remain restricted to Telegram group admins', () => {
  for (const command of ['setstarosta', 'setstudent']) {
    assert.equal(canRunGroupRoleCommand(command, 'group', true, false), false);
    assert.equal(canRunGroupRoleCommand(command, 'group', false, true), true);
    assert.equal(canRunGroupRoleCommand(command, 'group', false, false), false);
    assert.equal(canRunGroupRoleCommand(command, 'private', false, true), false);
  }
});
