import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOrCreateUser,
  isManagerRole,
  roleLabel,
  studentName,
  attendanceKey
} from '../../.test-build/domain-user/user-profile.js';

test('creates a user with the exact legacy defaults and stringifies the ID', () => {
  const users = {};
  const now = new Date('2026-11-22T12:00:00.000Z');
  const result = getOrCreateUser(users, 12345, now);
  assert.equal(users['12345'], result);
  assert.deepEqual(result, {
    group: '',
    role: 'student',
    createdAt: '2026-11-22T12:00:00.000Z',
    pendingPoll: null,
    pendingHomework: null,
    students: [],
    attendance: {}
  });
});

test('returns existing user object without overwriting any fields', () => {
  const existing = { role: 'starosta', group: 'БИ(ЭБ)2', custom: true };
  const users = { '77': existing };
  assert.equal(getOrCreateUser(users, '77'), existing);
  assert.deepEqual(existing, { role: 'starosta', group: 'БИ(ЭБ)2', custom: true });
});

test('manager role check recognizes only starosta and zam', () => {
  assert.equal(isManagerRole({ role: 'starosta' }), true);
  assert.equal(isManagerRole({ role: 'zam' }), true);
  assert.equal(isManagerRole({ role: 'student' }), false);
  assert.equal(isManagerRole(undefined), false);
  assert.equal(isManagerRole(null), false);
});

test('role labels preserve the existing Russian labels', () => {
  assert.equal(roleLabel('starosta'), '👑 Староста');
  assert.equal(roleLabel('zam'), '⭐ Заместитель старосты');
  assert.equal(roleLabel('student'), '👨‍🎓 Студент');
  assert.equal(roleLabel(undefined), '👨‍🎓 Студент');
});

test('student names support legacy strings and object records', () => {
  assert.equal(studentName('Иван Иванов'), 'Иван Иванов');
  assert.equal(studentName({ name: 'Иван Иванов' }), 'Иван Иванов');
  assert.equal(studentName({ name: 'Иван Иванов', username: 'ivan' }), 'Иван Иванов (@ivan)');
  assert.equal(studentName({}), 'Без имени');
  assert.equal(studentName(undefined), 'Без имени');
});

test('attendance keys prefer Telegram ID and fall back to name', () => {
  assert.equal(attendanceKey('Иван Иванов'), 'Иван Иванов');
  assert.equal(attendanceKey({ telegramId: 123, name: 'Иван' }), 123);
  assert.equal(attendanceKey({ name: 'Иван' }), 'Иван');
  assert.equal(attendanceKey({}), undefined);
});
