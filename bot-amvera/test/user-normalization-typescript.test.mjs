import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUser } from '../../.test-build/domain-user/user-normalization.js';

test('normalizes missing user fields using legacy defaults', () => {
  const user = {};
  assert.equal(normalizeUser(user), user);
  assert.deepEqual(user, {
    role: 'student',
    students: [],
    attendance: {},
    subscriptionUntil: 0,
    paymentHistory: [],
    createdAt: null
  });
});

test('preserves existing truthy values and mutates the same object', () => {
  const user = {
    role: 'starosta',
    students: [{ name: 'Тест' }],
    attendance: { '2026-11-21': true },
    subscriptionUntil: 123,
    paymentHistory: [{ id: 'payment-1' }],
    createdAt: '2026-01-01'
  };
  assert.equal(normalizeUser(user), user);
  assert.equal(user.role, 'starosta');
  assert.equal(user.subscriptionUntil, 123);
  assert.equal(user.createdAt, '2026-01-01');
  assert.equal(user.students.length, 1);
  assert.deepEqual(user.attendance, { '2026-11-21': true });
  assert.equal(user.paymentHistory.length, 1);
});

test('replaces falsy fields with the same defaults as the legacy implementation', () => {
  const user = {
    role: '',
    students: null,
    attendance: false,
    subscriptionUntil: 0,
    paymentHistory: '',
    createdAt: ''
  };
  normalizeUser(user);
  assert.equal(user.role, 'student');
  assert.deepEqual(user.students, []);
  assert.deepEqual(user.attendance, {});
  assert.equal(user.subscriptionUntil, 0);
  assert.deepEqual(user.paymentHistory, []);
  assert.equal(user.createdAt, null);
});
