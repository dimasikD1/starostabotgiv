import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupConnectInstructions } from '../../.test-build/domain-user/group-connect-instructions.js';

test('preserves the current group connection instructions and required permissions', () => {
  const message = buildGroupConnectInstructions();
  assert.match(message, /Подключение к уже существующей учебной группе/);
  assert.match(message, /выбери существующий чат и добавь туда бота/);
  assert.match(message, /удаления сообщений, ограничения участников и закрепления сообщений/);
  assert.match(message, /Не выдавай право добавлять других администраторов/);
});
