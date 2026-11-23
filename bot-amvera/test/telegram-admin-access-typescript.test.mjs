import test from 'node:test';
import assert from 'node:assert/strict';
import { isTelegramGroupAdmin } from '../../.test-build/domain/telegram-admin-access.js';

test('allows group creators and administrators', async () => {
  for (const status of ['creator', 'administrator']) {
    const calls = [];
    const allowed = await isTelegramGroupAdmin(
      { id: '-100', type: 'supergroup' }, 42,
      async (...args) => (calls.push(args), { status })
    );
    assert.equal(allowed, true);
    assert.deepEqual(calls, [['-100', 42]]);
  }
});

test('does not allow regular members or unsupported chat types', async () => {
  let calls = 0;
  const getMember = async () => (calls++, { status: 'member' });
  assert.equal(await isTelegramGroupAdmin({ id: '-1', type: 'group' }, 42, getMember), false);
  assert.equal(await isTelegramGroupAdmin({ id: '42', type: 'private' }, 42, getMember), false);
  assert.equal(calls, 1);
});

test('fails closed when Telegram API fails or user is missing', async () => {
  let calls = 0;
  const getMember = async () => (calls++, Promise.reject(new Error('network error')));
  assert.equal(await isTelegramGroupAdmin({ id: '-1', type: 'group' }, 42, getMember), false);
  assert.equal(await isTelegramGroupAdmin({ id: '-1', type: 'group' }, null, getMember), false);
  assert.equal(calls, 1);
});
