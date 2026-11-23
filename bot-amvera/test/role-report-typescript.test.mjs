import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupRoleReportSources,
  roleReportSourceChatIds,
  firstAssignedRoleId
} from '../domain/.build/role-report.js';

test('merges duplicate chat records by institution and study group, preserving source order', () => {
  const first = { institutionId: 'inst1', studyGroup: 'Группа 1', title: 'first', chatId: -1, starostaId: '' };
  const second = { institutionId: 'inst1', studyGroup: 'Группа 1', title: 'second', chatId: -2, starostaId: '101' };
  const otherInstitution = { institutionId: 'inst2', studyGroup: 'Группа 1', chatId: -3 };
  const otherGroup = { institutionId: 'inst1', studyGroup: 'Группа 2', chatId: -4 };
  const result = groupRoleReportSources([first, second, otherInstitution, otherGroup]);
  assert.equal(result.length, 3);
  assert.equal(result[0].title, 'first');
  assert.deepEqual(result[0]._sourceGroups, [first, second]);
  assert.deepEqual(result[1]._sourceGroups, [otherInstitution]);
  assert.deepEqual(result[2]._sourceGroups, [otherGroup]);
});

test('collects source chat ids and chooses the first non-empty role assignment', () => {
  const [group] = groupRoleReportSources([
    { institutionId: 'i', studyGroup: 'g', chatId: -1, starostaId: '' },
    { institutionId: 'i', studyGroup: 'g', chatId: -2, starostaId: '123', zamId: '456' },
    { institutionId: 'i', studyGroup: 'g', chatId: -3, starostaId: '999', zamId: '789' }
  ]);
  assert.deepEqual([...roleReportSourceChatIds(group)], ['-1', '-2', '-3']);
  assert.equal(firstAssignedRoleId(group, 'starostaId'), '123');
  assert.equal(firstAssignedRoleId(group, 'zamId'), '456');
});

import { filterRoleReportGroups } from '../domain/.build/role-report.js';

test('filters role report groups by institution and keeps all groups for platform owners', () => {
  const groups = [
    { institutionId: 'inst_a', studyGroup: 'A' },
    { institutionId: 'inst_b', studyGroup: 'B' },
    { institutionId: '', studyGroup: 'No institution' }
  ];
  assert.deepEqual(filterRoleReportGroups(groups, false, ['inst_b']), [groups[1]]);
  assert.deepEqual(filterRoleReportGroups(groups, true, []), groups);
  assert.deepEqual(filterRoleReportGroups(groups, false, []), []);
});


import { buildRoleReportMemberRows } from '../domain/.build/role-report.js';

test('builds role report rows with scoped students, owners excluded, and unlisted role holders retained', () => {
  const [group] = groupRoleReportSources([
    { institutionId: 'inst', studyGroup: 'Group A', chatId: '-10', starostaId: '101', zamId: '102' },
    { institutionId: 'inst', studyGroup: 'Group A', chatId: '-11' }
  ]);
  const users = {
    '100': { group: 'Group A', fullName: 'Student One', groupChatId: '-10' },
    '101': { group: 'Group A', fullName: 'Starosta', groupChatId: '-10' },
    '102': { group: 'Group A', username: 'deputy', groupChatId: '-11' },
    '103': { group: 'Group A', fullName: 'Other chat', groupChatId: '-99' },
    '999': { group: 'Group A', fullName: 'Platform owner' }
  };
  const rows = buildRoleReportMemberRows(group, users, id => id === '999');
  // Existing profiles retain their database insertion order; only role holders
  // missing from the roster are prepended by the legacy report behavior.
  assert.deepEqual(rows, [
    { id: '100', name: 'Student One', role: '👨‍🎓 Студент' },
    { id: '101', name: 'Starosta', role: '👑 Староста' },
    { id: '102', name: '@deputy', role: '⭐ Заместитель' }
  ]);
});

test('keeps assigned role holders even if their profile is missing', () => {
  const [group] = groupRoleReportSources([
    { institutionId: 'inst', studyGroup: 'Group B', chatId: '-20', starostaId: '201', zamId: '202' }
  ]);
  assert.deepEqual(buildRoleReportMemberRows(group, {}, () => false), [
    { id: '202', name: 'ID 202', role: '⭐ Заместитель' },
    { id: '201', name: 'ID 201', role: '👑 Староста' }
  ]);
});
