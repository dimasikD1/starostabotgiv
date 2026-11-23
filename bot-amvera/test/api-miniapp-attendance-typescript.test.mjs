import test from 'node:test';
import assert from 'node:assert/strict';
import { updateMiniAppAttendance } from '../../.test-build/api/miniapp-attendance.js';
const dependencies = (overrides = {}) => ({
  validate: () => ({ ok: true, studentIndex: 0, status: 'present', lessonKey: 'lesson-1' }),
  getTodayLessons: async () => [{ key: 'lesson-1' }],
  getLessonKey: lesson => lesson.key,
  getStudentKey: student => String(student.id),
  save: () => {},
  ...overrides
});
test('stores attendance by lesson and student and persists', async () => {
  const group = { students: [{ id: 42 }] }; let saves = 0;
  const result = await updateMiniAppAttendance(group, {}, dependencies({ save: () => saves++ }));
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(group.lessonAttendance, { 'lesson-1': { '42': 'present' } });
  assert.equal(saves, 1);
});
test('removes an unmarked attendance value', async () => {
  const group = { students: [{ id: 42 }], lessonAttendance: { 'lesson-1': { '42': 'absent' } } };
  await updateMiniAppAttendance(group, {}, dependencies({ validate: () => ({
    ok: true, studentIndex: 0, status: 'unmarked', lessonKey: 'lesson-1'
  }) }));
  assert.deepEqual(group.lessonAttendance, { 'lesson-1': {} });
});
test('rejects an invalid mark without requesting lessons or saving', async () => {
  let calls = 0;
  const result = await updateMiniAppAttendance({ students: [{ id: 1 }] }, {}, dependencies({
    validate: () => ({ ok: false }), getTodayLessons: async () => { calls++; return []; }
  }));
  assert.deepEqual(result, { ok: false, reason: 'invalid' }); assert.equal(calls, 0);
});
test('rejects marks for lessons absent from today schedule', async () => {
  const result = await updateMiniAppAttendance({ students: [{ id: 1 }] }, {}, dependencies({
    getTodayLessons: async () => []
  }));
  assert.deepEqual(result, { ok: false, reason: 'lesson-not-found' });
});
