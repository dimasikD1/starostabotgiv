import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listManagedMiniAppTelegramChats,
  performMiniAppTelegramChatAction
} from '../../.test-build/api/miniapp-telegram-chats.js';

test('lists only chats the user can manage', () => {
  const groups = {
    a: { chatId: '-1', title: 'A' },
    b: { chatId: '-2', title: 'B' }
  };
  assert.deepEqual(
    listManagedMiniAppTelegramChats(groups, 7, (_user, chatId) => chatId === '-2'),
    [groups.b]
  );
});

test('opens chat with the same independent permission set', async () => {
  let call;
  const result = await performMiniAppTelegramChatAction(
    { chatId: '-1' }, 'open', {}, { id: 7 }, 'Name', {
      setChatPermissions: async (...args) => { call = args; },
      sendMessage: async () => {},
      normalizeText: () => ({ ok: true, text: 'x' }),
      formatMessage: x => x,
      createRecord: () => ({}),
      ensureStudyGroups: () => [],
      appendAnnouncement: history => history || [],
      save: () => {}
    }
  );
  assert.equal(result.ok, true);
  assert.equal(call[0], '-1');
  assert.equal(call[1].can_send_messages, true);
  assert.equal(call[1].can_send_polls, true);
  assert.deepEqual(call[2], { use_independent_chat_permissions: true });
});

test('publishes announcement before appending history and saving', async () => {
  const events = [];
  const group = {};
  const result = await performMiniAppTelegramChatAction(
    { chatId: '-1' }, 'announce', { text: 'Hello' }, { id: 7 }, 'Full Name', {
      setChatPermissions: async () => {},
      sendMessage: async (_id, message) => events.push('send:' + message),
      normalizeText: value => ({ ok: true, text: String(value) }),
      formatMessage: value => '<b>' + value + '</b>',
      createRecord: (text, id, name) => ({ text, id, name }),
      ensureStudyGroups: () => [group],
      appendAnnouncement: (history, item) => [...(history || []), item],
      save: () => events.push('save')
    }
  );
  assert.equal(result.ok, true);
  assert.equal(group.announcements[0].text, 'Hello');
  assert.deepEqual(events, ['send:<b>Hello</b>', 'save']);
});

test('validates announcement text and rejects unknown actions without side effects', async () => {
  let saves = 0;
  const deps = {
    setChatPermissions: async () => {},
    sendMessage: async () => {},
    normalizeText: () => ({ ok: false, reason: 'empty' }),
    formatMessage: value => value,
    createRecord: () => ({}),
    ensureStudyGroups: () => [],
    appendAnnouncement: history => history || [],
    save: () => saves++
  };
  assert.deepEqual(await performMiniAppTelegramChatAction(
    { chatId: '-1' }, 'announce', {}, { id: 1 }, '', deps
  ), { ok: false, reason: 'empty' });
  assert.deepEqual(await performMiniAppTelegramChatAction(
    { chatId: '-1' }, 'bad', {}, { id: 1 }, '', deps
  ), { ok: false, reason: 'unknown-action' });
  assert.equal(saves, 0);
});
