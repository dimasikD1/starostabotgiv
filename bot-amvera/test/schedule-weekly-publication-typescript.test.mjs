import test from 'node:test';
import assert from 'node:assert/strict';
import { publishWeeklySchedule } from '../schedule/.build/weekly-publication.js';

test('publishes and pins weekly schedule per target', async () => {
  const sent = [];
  const pinned = [];
  const result = await publishWeeklySchedule({
    groups: [{ chatId: -10, title: 'Group A' }, { chatId: -20, title: 'Group B' }],
    range: { start: '2026-11-30', end: '2026-12-06' },
    buildText: async () => ({ text: 'Schedule' }),
    sendMessage: async (chatId, text) => { sent.push([chatId, text]); return { messageId: chatId * -1 }; },
    pinMessage: async (chatId, messageId) => { pinned.push([chatId, messageId]); },
    logError: () => {}
  });
  assert.equal(result.sent, 2);
  assert.equal(result.pinned, 2);
  assert.deepEqual(sent, [[-10, 'Schedule'], [-20, 'Schedule']]);
  assert.deepEqual(pinned, [[-10, 10], [-20, 20]]);
});

test('continues after one chat send fails and records pin failure separately', async () => {
  const errors = [];
  const result = await publishWeeklySchedule({
    groups: [{ chatId: 1, title: 'A' }, { chatId: 2, title: 'B' }, { chatId: 3, title: 'C' }],
    range: { start: 'x', end: 'y' },
    buildText: async () => ({ text: 'Schedule' }),
    sendMessage: async chatId => { if (chatId === 1) throw new Error('send'); return { messageId: chatId }; },
    pinMessage: async chatId => { if (chatId === 2) throw new Error('pin'); },
    logError: label => errors.push(label)
  });
  assert.equal(result.sent, 2);
  assert.equal(result.pinned, 1);
  assert.match(result.details[0], /ошибка отправки/);
  assert.match(result.details[1], /не удалось закрепить/);
  assert.match(result.details[2], /отправлено и закреплено/);
  assert.equal(errors.length, 2);
});

test('returns explicit outcomes for missing targets and build failure', async () => {
  const base = {
    range: { start: 'x', end: 'y' },
    buildText: async () => ({ text: 'Schedule' }),
    sendMessage: async () => ({ messageId: 1 }),
    pinMessage: async () => {},
    logError: () => {}
  };
  assert.equal((await publishWeeklySchedule({ ...base, groups: [] })).error, 'no-targets');
  assert.equal((await publishWeeklySchedule({ ...base, groups: [{ chatId: 1 }], buildText: async () => { throw new Error('build'); } })).error, 'build-failed');
});

test('caps Telegram message length using the existing truncation rule', async () => {
  let delivered = '';
  await publishWeeklySchedule({
    groups: [{ chatId: 1 }],
    range: { start: 'x', end: 'y' },
    buildText: async () => ({ text: 'x'.repeat(4000) }),
    sendMessage: async (_id, text) => { delivered = text; return { messageId: 1 }; },
    pinMessage: async () => {},
    logError: () => {}
  });
  assert.equal(delivered.length, 3874);
  assert.ok(delivered.endsWith('… расписание сокращено.'));
});
