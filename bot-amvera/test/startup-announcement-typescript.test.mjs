import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStartupAnnouncementMessage } from '../domain/.build/startup-announcement.js';

test('builds the established startup announcement with expected sections and HTML', () => {
  const message = buildStartupAnnouncementMessage();
  assert.match(message, /^👋 <b>Привет! Я — «Староста Бот»\.<\/b> 🤖/u);
  assert.match(message, /📚 <b>Возможности для студентов<\/b>/u);
  assert.match(message, /🧑‍🏫 <b>Инструменты для старост и заместителей<\/b>/u);
  assert.match(message, /🏫 <b>Возможности для администрации<\/b>/u);
  assert.match(message, /📲 <b>Mini App<\/b>/u);
  assert.match(message, /Это только начало! ❤️$/u);
  assert.equal(message.includes('\\n'), false);
});
