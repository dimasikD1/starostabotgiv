import test from 'node:test';
import assert from 'node:assert/strict';
import { publishStartupPost } from '../domain/.build/startup-post.js';

test('publishes the startup post with HTML and navigation buttons', async () => {
  let payload;
  const logs = [];
  const result = await publishStartupPost({
    channelId: '@release', ownerId: 42, message: '<b>Project</b>',
    send: async (...args) => { payload = args; },
    logInfo: value => logs.push(value), logError: () => {}
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(payload[0], '@release');
  assert.equal(payload[1], '<b>Project</b>');
  assert.equal(payload[2].parse_mode, 'HTML');
  assert.deepEqual(payload[2].reply_markup.inline_keyboard[0].map(x => x.url), [
    'https://github.com/dimasikD1/starostabotgiv', 'https://t.me/starostagivbot'
  ]);
  assert.match(logs[0], /@release.*42/);
});

test('reports publication failure without throwing', async () => {
  const errors = [];
  const result = await publishStartupPost({
    channelId: '@release', ownerId: 42, message: 'post',
    send: async () => { throw new Error('denied'); },
    logInfo: () => {}, logError: (...args) => errors.push(args)
  });
  assert.deepEqual(result, { ok: false });
  assert.equal(errors.length, 1);
  assert.match(errors[0][0], /Не удалось опубликовать пост/);
});
