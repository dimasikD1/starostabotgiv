import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGroupBotMembershipUpdate } from '../domain/.build/group-bot-membership-handler.js';

function setup(overrides = {}) {
  const calls = [];
  const deps = {
    registerGroup: (...args) => calls.push(['register', ...args]),
    getBotMember: async () => ({ can_delete_messages: true, can_restrict_members: true, can_pin_messages: true }),
    sendMessage: async (...args) => calls.push(['send', ...args]),
    logError: (...args) => calls.push(['error', ...args]),
    ...overrides
  };
  return { calls, deps };
}
const base = {
  chat: { id: -100123, type: 'supergroup', title: 'Учебная группа' },
  from: { id: 55 },
  oldStatus: 'left',
  newStatus: 'member',
  newMember: {},
  botId: 999
};

test('registers a newly joined bot and sends setup instructions', async () => {
  const state = setup();
  await handleGroupBotMembershipUpdate(base, state.deps);
  assert.equal(state.calls[0][0], 'register');
  assert.equal(state.calls[1][0], 'send');
  assert.match(state.calls[1][2], /добавлен в этот существующий чат/);
});

test('checks permissions after administrator promotion and uses the update payload as fallback', async () => {
  const state = setup({ getBotMember: async () => { throw new Error('unavailable'); } });
  await handleGroupBotMembershipUpdate({ ...base, oldStatus: 'member', newStatus: 'administrator',
    newMember: { can_delete_messages: true, can_restrict_members: false, can_pin_messages: true } }, state.deps);
  const sent = state.calls.find(call => call[0] === 'send');
  assert.match(sent[2], /ограничение участников/);
  assert.equal(sent[3], 'HTML');
});

test('continues with permission notice when registration fails', async () => {
  const state = setup({ registerGroup: () => { throw new Error('storage failed'); } });
  await handleGroupBotMembershipUpdate({ ...base, oldStatus: 'member', newStatus: 'administrator' }, state.deps);
  assert.equal(state.calls.some(call => call[0] === 'error'), true);
  assert.equal(state.calls.some(call => call[0] === 'send'), true);
});

test('notifies about administrator demotion without checking permissions', async () => {
  const state = setup();
  await handleGroupBotMembershipUpdate({ ...base, oldStatus: 'administrator', newStatus: 'member' }, state.deps);
  assert.equal(state.calls.length, 2);
  assert.match(state.calls[1][2], /Права администратора у бота сняты/);
});

test('ignores unrelated updates and missing chat or actor', async () => {
  const state = setup();
  await handleGroupBotMembershipUpdate({ ...base, oldStatus: 'member', newStatus: 'member' }, state.deps);
  await handleGroupBotMembershipUpdate({ ...base, chat: null }, state.deps);
  await handleGroupBotMembershipUpdate({ ...base, from: null }, state.deps);
  assert.deepEqual(state.calls, []);
});
