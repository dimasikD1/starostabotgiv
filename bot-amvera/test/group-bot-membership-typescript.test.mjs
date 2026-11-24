import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGroupBotMembershipTransition } from '../domain/.build/group-bot-membership.js';

test('classifies a bot joining an existing group', () => {
  assert.deepEqual(classifyGroupBotMembershipTransition({ chatType: 'supergroup', oldStatus: 'left', newStatus: 'member' }), {
    shouldHandle: true, joined: true, promoted: false, demoted: false,
    shouldRegister: true, shouldCheckPermissions: false
  });
});

test('classifies administrator promotion and requests a permission check', () => {
  const result = classifyGroupBotMembershipTransition({ chatType: 'group', oldStatus: 'member', newStatus: 'administrator' });
  assert.equal(result.shouldHandle, true);
  assert.equal(result.promoted, true);
  assert.equal(result.shouldRegister, true);
  assert.equal(result.shouldCheckPermissions, true);
});

test('classifies administrator demotion', () => {
  const result = classifyGroupBotMembershipTransition({ chatType: 'group', oldStatus: 'administrator', newStatus: 'member' });
  assert.equal(result.shouldHandle, true);
  assert.equal(result.demoted, true);
  assert.equal(result.shouldCheckPermissions, false);
});

test('ignores non-group chats, ordinary updates and bot departures', () => {
  for (const input of [
    { chatType: 'private', oldStatus: 'left', newStatus: 'member' },
    { chatType: 'group', oldStatus: 'member', newStatus: 'member' },
    { chatType: 'group', oldStatus: 'administrator', newStatus: 'left' },
    { chatType: 'supergroup', oldStatus: 'member', newStatus: 'restricted' }
  ]) assert.equal(classifyGroupBotMembershipTransition(input).shouldHandle, false);
});

test('recognizes a kicked bot re-added as administrator', () => {
  const result = classifyGroupBotMembershipTransition({ chatType: 'supergroup', oldStatus: 'kicked', newStatus: 'administrator' });
  assert.equal(result.joined, true);
  assert.equal(result.promoted, true);
  assert.equal(result.shouldCheckPermissions, true);
});
