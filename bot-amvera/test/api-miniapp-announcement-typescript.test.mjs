import test from 'node:test';
import assert from 'node:assert/strict';
import { publishMiniAppAnnouncement } from '../../.test-build/api/miniapp-announcement.js';

const deps = overrides => ({
  normalizeText: value => value ? ({ ok: true, text: String(value).trim() }) : ({ ok: false, reason: 'empty' }),
  sendMessage: async (chatId, text) => ({ chatId, text }),
  formatMessage: text => 'FORMATTED:'+text,
  createRecord: (text, authorId, authorName) => ({ text, authorId, authorName, id: 'a1' }),
  append: (items, item) => [...items, item],
  save: () => {},
  ...overrides
});

test('publishes first, then stores the announcement and saves', async () => {
  const events = [];
  const group = { chatId: '-1001', announcements: [] };
  const result = await publishMiniAppAnnouncement(group, 'Новость', { id: 42, firstName: 'Анна' }, deps({
    sendMessage: async (chatId, text) => events.push(['send', chatId, text]),
    save: () => events.push(['save'])
  }));
  assert.deepEqual(result, { ok: true, announcement: {
    text: 'Новость', authorId: 42, authorName: 'Анна', id: 'a1'
  }});
  assert.deepEqual(events, [['send', '-1001', 'FORMATTED:Новость'], ['save']]);
  assert.equal(group.announcements.length, 1);
});

test('returns legacy validation and missing-chat outcomes without side effects', async () => {
  const group = {};
  assert.deepEqual(await publishMiniAppAnnouncement(group, '', { id: 1 }, deps()), {
    ok: false, reason: 'empty'
  });
  assert.deepEqual(await publishMiniAppAnnouncement(group, 'text', { id: 1 }, deps()), {
    ok: false, reason: 'no-chat'
  });
});

test('does not persist if Telegram publication fails', async () => {
  let saves = 0;
  await assert.rejects(() => publishMiniAppAnnouncement({ chatId: '-1001' }, 'text', { id: 1 }, deps({
    sendMessage: async () => { throw new Error('telegram offline'); },
    save: () => saves++
  })), /telegram offline/);
  assert.equal(saves, 0);
});
