import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyTelegramWebAppInitData } from '../../.test-build/api/telegram-webapp-auth.js';

const token = '123456:TEST_TOKEN';
const now = 1_800_000_000_000;

function signedInitData(fields) {
  const params = new URLSearchParams(fields);
  const checkString = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => key + '=' + value).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(checkString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function validFields(authDate = Math.floor(now / 1000)) {
  return { auth_date: String(authDate), query_id: 'AAE-test', user: JSON.stringify({ id: 123456, first_name: 'Test', username: 'tester' }) };
}

test('verifies Telegram WebApp init data and returns the signed user', () => {
  const initData = signedInitData(validFields());
  assert.deepEqual(verifyTelegramWebAppInitData(initData, { token, now: () => now }), {
    id: 123456, first_name: 'Test', username: 'tester'
  });
});

test('rejects modified init data and malformed hashes', () => {
  const signed = signedInitData(validFields());
  assert.throws(() => verifyTelegramWebAppInitData(signed.replace('tester', 'intruder'), { token, now: () => now }), /Не удалось подтвердить аккаунт Telegram/);
  assert.throws(() => verifyTelegramWebAppInitData('auth_date=1&hash=bad', { token, now: () => now }), /Некорректные данные Telegram/);
});

test('rejects expired and excessively future-dated sessions', () => {
  assert.throws(() => verifyTelegramWebAppInitData(signedInitData(validFields(1)), { token, now: () => now }), /Сессия устарела/);
  assert.throws(() => verifyTelegramWebAppInitData(signedInitData(validFields(Math.floor(now / 1000) + 31)), { token, now: () => now }), /Сессия устарела/);
});

test('rejects missing or malformed Telegram user identity', () => {
  assert.throws(() => verifyTelegramWebAppInitData(signedInitData({ ...validFields(), user: '{}' }), { token, now: () => now }), /корректные данные пользователя/);
  assert.throws(() => verifyTelegramWebAppInitData(signedInitData({ ...validFields(), user: '{bad' }), { token, now: () => now }), /корректные данные пользователя/);
  assert.throws(() => verifyTelegramWebAppInitData('', { token, now: () => now }), /Открой мини-приложение/);
});
