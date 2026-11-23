import test from 'node:test';
import assert from 'node:assert/strict';
import { updateMiniAppProfile, clearMiniAppStudentRoster } from '../../.test-build/api/miniapp-profile.js';

test('updates a validated profile name and persists once', () => {
  const user = {};
  let saves = 0;
  const result = updateMiniAppProfile(user, 'Анна Иванова', {
    validateName: value => ({ ok: true, value: String(value) }),
    save: () => saves++
  });
  assert.deepEqual(result, { ok: true, fullName: 'Анна Иванова' });
  assert.equal(user.fullName, 'Анна Иванова');
  assert.equal(saves, 1);
});

test('preserves separate legacy profile validation errors', () => {
  const save = () => assert.fail('invalid profile must not be saved');
  assert.deepEqual(updateMiniAppProfile({}, 'x', {
    validateName: () => ({ ok: false, reason: 'length' }), save
  }), { ok: false, status: 400, error: 'Укажи ФИО длиной от 5 до 100 символов.' });
  assert.deepEqual(updateMiniAppProfile({}, '', {
    validateName: () => ({ ok: false, reason: 'format' }), save
  }), { ok: false, status: 400, error: 'Укажи корректные фамилию и имя (при наличии — отчество).' });
});

test('clears only the selected roster and reports the previous count', () => {
  const group = { students: [{ id: 1 }, { id: 2 }] };
  assert.deepEqual(clearMiniAppStudentRoster(group), { deleted: 2, empty: false });
  assert.deepEqual(group.students, []);
  assert.deepEqual(clearMiniAppStudentRoster(group), { deleted: 0, empty: true });
});
