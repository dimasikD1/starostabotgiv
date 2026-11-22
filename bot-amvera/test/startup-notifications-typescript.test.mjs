import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldNotifyRelease,
  buildReleaseMessage,
  buildRestartMessage
} from '../domain/.build/startup-notifications.js';

const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

test('release notification is sent only for a new release and configured owners', () => {
  assert.equal(shouldNotifyRelease(['1'], '', '2026.11.22'), true);
  assert.equal(shouldNotifyRelease(['1'], '2026.11.22', '2026.11.22'), false);
  assert.equal(shouldNotifyRelease([], '', '2026.11.22'), false);
});

test('release message escapes version and notes while preserving the established format', () => {
  assert.equal(
    buildReleaseMessage('v<2>', ['Исправлен <экран>', 'A & B'], escapeHtml),
    '🚀 <b>Староста Бот обновлён</b>\n' +
    'Версия: <b>v&lt;2&gt;</b>\n\n' +
    '<b>Что нового:</b>\n' +
    '• Исправлен &lt;экран&gt;\n' +
    '• A &amp; B'
  );
});

test('restart notification keeps the existing Telegram message', () => {
  assert.equal(
    buildRestartMessage(),
    '🔄 <b>Староста Бот перезапущен</b>\nБот снова работает и готов принимать команды.'
  );
});
