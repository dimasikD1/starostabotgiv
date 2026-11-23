import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMiniAppHomeworkFields,
  validateMiniAppAttendanceMark,
  validateHomeworkRecordId
} from '../../.test-build/api/miniapp-write-validation.js';

test('validates homework fields with the existing trim and length limits', () => {
  assert.deepEqual(validateMiniAppHomeworkFields('  Математика  ', '  Решить задачи  '), {
    ok: true,
    subject: 'Математика',
    homework: 'Решить задачи'
  });
  assert.equal(validateMiniAppHomeworkFields('', 'Задание').reason, 'subject');
  assert.equal(validateMiniAppHomeworkFields('А'.repeat(101), 'Задание').reason, 'subject');
  assert.equal(validateMiniAppHomeworkFields('Предмет', ' ').reason, 'homework');
  assert.equal(validateMiniAppHomeworkFields('Предмет', 'А'.repeat(3501)).reason, 'homework');
  assert.equal(validateMiniAppHomeworkFields('А'.repeat(100), 'Б'.repeat(3500)).ok, true);
});

test('validates attendance indices, preserving numeric coercion and supported statuses', () => {
  assert.deepEqual(validateMiniAppAttendanceMark({
    studentIndex: '1', status: 'present', lessonKey: '2026-11-23|09:00|10:30|Математика'
  }, 2), {
    ok: true,
    studentIndex: 1,
    status: 'present',
    lessonKey: '2026-11-23|09:00|10:30|Математика'
  });
  assert.equal(validateMiniAppAttendanceMark({ studentIndex: 0, status: 'unmarked' }, 1).ok, true);
  assert.equal(validateMiniAppAttendanceMark({ studentIndex: 0, status: 'absent' }, 1).ok, true);
  assert.equal(validateMiniAppAttendanceMark({ studentIndex: -1, status: 'present' }, 1).ok, false);
  assert.equal(validateMiniAppAttendanceMark({ studentIndex: 1, status: 'present' }, 1).ok, false);
  assert.equal(validateMiniAppAttendanceMark({ studentIndex: 0.5, status: 'present' }, 1).ok, false);
  assert.equal(validateMiniAppAttendanceMark({ studentIndex: 0, status: 'unknown' }, 1).ok, false);
  assert.equal(validateMiniAppAttendanceMark(null, 1).ok, false);
});

test('normalizes homework record IDs and retains empty-ID rejection semantics', () => {
  assert.deepEqual(validateHomeworkRecordId(' task-123 '), { ok: true, id: ' task-123 ' });
  assert.deepEqual(validateHomeworkRecordId(123), { ok: true, id: '123' });
  assert.deepEqual(validateHomeworkRecordId(''), { ok: false, id: '' });
  assert.deepEqual(validateHomeworkRecordId(null), { ok: false, id: '' });
});
