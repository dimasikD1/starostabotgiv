import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDonationKeyboard } from '../../.test-build/domain-user/donation-keyboard.js';

test('preserves donation amounts and Stars callback data', () => {
  assert.deepEqual(buildDonationKeyboard(), [
    [
      { text: '⭐ 50 Stars', callbackData: 'donate:50' },
      { text: '⭐ 100 Stars', callbackData: 'donate:100' }
    ],
    [
      { text: '⭐ 250 Stars', callbackData: 'donate:250' },
      { text: '⭐ 500 Stars', callbackData: 'donate:500' }
    ]
  ]);
});
