import test from 'node:test';
import assert from 'node:assert/strict';
import { registerGroup, removeGroup } from '../domain/.build/group-registry.js';

test('registers a group while preserving existing data and filling missing defaults', () => {
  const existing = {
    chatId: -1001,
    title: 'Old title',
    students: [{ name: 'А' }],
    attendance: { today: { present: ['1'] } },
    homework: [{ id: 'hw-1' }],
    addedBy: 10,
    addedAt: '2026-01-01T00:00:00.000Z'
  };
  const db = { groups: { '-1001': existing } };
  let ensured;
  let saves = 0;
  const group = registerGroup(db, { id: -1001, title: '' }, { id: 20 }, {
    ensureStudyGroups(value) { ensured = value; },
    saveDb() { saves += 1; },
    now: () => new Date('2026-11-23T10:00:00.000Z')
  });

  assert.equal(group, db.groups['-1001']);
  assert.equal(group.title, 'Old title');
  assert.equal(group.addedBy, 10);
  assert.equal(group.addedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(group.students, [{ name: 'А' }]);
  assert.deepEqual(group.attendance, { today: { present: ['1'] } });
  assert.deepEqual(group.homework, [{ id: 'hw-1' }]);
  assert.equal(ensured, group);
  assert.equal(saves, 1);
});

test('creates a new group with the same defaults as the legacy handler', () => {
  const db = { groups: {} };
  let saves = 0;
  const group = registerGroup(db, { id: '-2002', title: 'Новый чат' }, { id: 42 }, {
    ensureStudyGroups() {},
    saveDb() { saves += 1; },
    now: () => new Date('2026-11-23T10:00:00.000Z')
  });

  assert.deepEqual(group, {
    chatId: '-2002',
    title: 'Новый чат',
    addedBy: 42,
    addedAt: '2026-11-23T10:00:00.000Z',
    students: [],
    attendance: {}
  });
  assert.equal(saves, 1);
});

test('removes only the requested chat and persists the change', () => {
  const db = { groups: { '-1': { title: 'A' }, '-2': { title: 'B' } } };
  let saves = 0;
  removeGroup(db, -1, () => { saves += 1; });
  assert.deepEqual(Object.keys(db.groups), ['-2']);
  assert.equal(saves, 1);
});
