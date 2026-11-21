import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttendanceHtml } from '../../.test-build/domain-user/attendance-report.js';

const fixedNow = new Date('2026-11-22T12:00:00.000Z');

const fixture = {
  title: 'Группа <БИ-1>',
  students: [
    { name: 'Анна <Тест>', telegramId: 101 },
    { name: 'Борис', telegramId: 102 }
  ],
  lessonAttendance: {
    '2026-11-21|09:00|10:30|Математика': { '101': 'present', '102': 'absent' },
    '2026-11-22|11:00||История': { '101': 'absent' },
    '2026-11-10|09:00|10:30|Старая пара': { '101': 'present', '102': 'present' }
  },
  attendance: {
    '101': { '2026-11-20': 'present' },
    '102': { '2026-11-20': 'absent' }
  }
};

test('creates HTML report with per-student totals and per-lesson details', () => {
  const html = createAttendanceHtml({
    group: fixture,
    period: 'all',
    timeZone: 'Europe/Moscow',
    now: fixedNow
  });
  assert.match(html, /Журнал посещаемости по парам/);
  assert.match(html, /Группа: <b>Группа &lt;БИ-1&gt;<\/b>/);
  assert.match(html, /Анна &lt;Тест&gt;/);
  assert.match(html, /Математика/);
  assert.match(html, /Были \(1\)/);
  assert.match(html, /Не были \(1\)/);
  assert.match(html, /Старые записи \(без привязки к паре\)/);
  assert.match(html, /Процент считается только по занятиям/);
});

test('filters lesson and legacy records to the selected 7-day period', () => {
  const html = createAttendanceHtml({
    group: fixture,
    period: 'week',
    timeZone: 'Europe/Moscow',
    now: fixedNow
  });
  assert.match(html, /2026-11-21/);
  assert.match(html, /2026-11-22/);
  assert.doesNotMatch(html, /Старая пара/);
  assert.doesNotMatch(html, /2026-11-10/);
  assert.match(html, /за последние 7 дней/);
});

test('handles an empty group and unknown period using legacy all-period label', () => {
  const html = createAttendanceHtml({
    group: { title: 'Пустая группа', students: [], attendance: {}, lessonAttendance: {} },
    period: 'unexpected',
    timeZone: 'Europe/Moscow',
    now: fixedNow
  });
  assert.match(html, /Пустая группа/);
  assert.match(html, /за весь период/);
  assert.match(html, /За выбранный период сохранённых отметок нет/);
});
