import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateChat } from '../domain/private-chat-entry.mjs';

test('isPrivateChat recognizes private chats', () => {
  assert.equal(isPrivateChat({ chat: { type: 'private' } }), true);
});

test('isPrivateChat rejects groups and missing chats', () => {
  assert.equal(isPrivateChat({ chat: { type: 'group' } }), false);
  assert.equal(isPrivateChat({ chat: { type: 'supergroup' } }), false);
  assert.equal(isPrivateChat({}), false);
  assert.equal(isPrivateChat({ chat: null }), false);
});
