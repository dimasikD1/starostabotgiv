import test from 'node:test';
import assert from 'node:assert/strict';
import { getMissingTelegramBotPermissions } from '../../.test-build/domain/telegram-bot-permissions.js';

test('returns no missing permissions when all required rights are enabled', () => {
  assert.deepEqual(getMissingTelegramBotPermissions({
    can_delete_messages: true,
    can_restrict_members: true,
    can_pin_messages: true
  }), []);
});

test('returns only the missing permissions in stable order', () => {
  assert.deepEqual(getMissingTelegramBotPermissions({
    can_delete_messages: true,
    can_restrict_members: false
  }), ['ограничение участников', 'закрепление сообщений']);
});

test('treats absent or incomplete Telegram rights as missing', () => {
  assert.deepEqual(getMissingTelegramBotPermissions(null), [
    'удаление сообщений',
    'ограничение участников',
    'закрепление сообщений'
  ]);
  assert.deepEqual(getMissingTelegramBotPermissions({ can_pin_messages: true }), [
    'удаление сообщений',
    'ограничение участников'
  ]);
});
