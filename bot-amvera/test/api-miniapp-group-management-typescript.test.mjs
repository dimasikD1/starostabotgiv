import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMiniAppAccessibleGroups,
  clearMiniAppRosterAndSave
} from '../../.test-build/api/miniapp-group-management.js';

test('returns the exact accessible groups supplied by the access policy', () => {
  const expected = [{ id: 'g1' }, { id: 'g2' }];
  let received;
  const actual = getMiniAppAccessibleGroups(42, userId => {
    received = userId;
    return expected;
  });
  assert.equal(received, 42);
  assert.equal(actual, expected);
});

test('saves only when a student roster was actually cleared', () => {
  const group = { students: ['a', 'b'] };
  const events = [];
  const result = clearMiniAppRosterAndSave(
    group,
    target => {
      const deleted = target.students.length;
      target.students = [];
      return { deleted, empty: deleted === 0 };
    },
    () => events.push('save'),
    value => events.push('cleared:' + value.deleted)
  );
  assert.deepEqual(result, { deleted: 2, empty: false });
  assert.deepEqual(events, ['save', 'cleared:2']);
});

test('does not save an already empty roster', () => {
  let saves = 0;
  const result = clearMiniAppRosterAndSave(
    { students: [] },
    () => ({ deleted: 0, empty: true }),
    () => saves++
  );
  assert.deepEqual(result, { deleted: 0, empty: true });
  assert.equal(saves, 0);
});
