import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowManagerMenu } from '../domain/.build/menu-policy.js';

test('shows manager menu for owners or users with accessible groups', () => {
  assert.equal(shouldShowManagerMenu(true, false), true);
  assert.equal(shouldShowManagerMenu(false, true), true);
});

test('shows student menu when user has no management access', () => {
  assert.equal(shouldShowManagerMenu(false, false), false);
});
