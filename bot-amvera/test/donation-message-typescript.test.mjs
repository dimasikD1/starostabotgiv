import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDonationMessage } from '../domain/.build/donation-message.js';

test('builds the voluntary donation prompt without implying paid access', () => {
  const message = buildDonationMessage();
  assert.match(message, /Поддержать Староста Бот/);
  assert.match(message, /полностью добровольное/);
  assert.match(message, /не открывает платные функции/);
  assert.match(message, /Выбери сумму/);
});
