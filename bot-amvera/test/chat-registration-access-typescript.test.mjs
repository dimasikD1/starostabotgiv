import test from 'node:test';
import assert from 'node:assert/strict';
import { canRegisterTelegramChat } from '../../.test-build/domain/chat-registration-access.js';

test('chat owner can register a group or supergroup', () => {
  assert.equal(canRegisterTelegramChat({ chatType: 'group', isOwner: true, isGroupAdmin: false }), true);
  assert.equal(canRegisterTelegramChat({ chatType: 'supergroup', isOwner: true, isGroupAdmin: false }), true);
});

test('Telegram group administrator can register the current group', () => {
  assert.equal(canRegisterTelegramChat({ chatType: 'group', isOwner: false, isGroupAdmin: true }), true);
});

test('ordinary members and private chats cannot register a group', () => {
  assert.equal(canRegisterTelegramChat({ chatType: 'group', isOwner: false, isGroupAdmin: false }), false);
  assert.equal(canRegisterTelegramChat({ chatType: 'private', isOwner: true, isGroupAdmin: false }), false);
  assert.equal(canRegisterTelegramChat({ chatType: 'channel', isOwner: true, isGroupAdmin: false }), false);
});
