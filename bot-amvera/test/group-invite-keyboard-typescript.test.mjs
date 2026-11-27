import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupInviteButton } from '../../.test-build/domain-user/group-invite-keyboard.js';

test('preserves the configured label and existing Telegram group invite URL', () => {
  assert.deepEqual(buildGroupInviteButton('Add bot'), {
    text: 'Add bot',
    url: 'https://t.me/starostagivbot?startgroup=true'
  });
});
