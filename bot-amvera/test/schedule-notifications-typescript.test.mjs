import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeeklySchedulePublicationKey,
  groupScheduleTargetsByGroup,
  getScheduleChangeMonitorEnd,
  buildScheduleChangeMessage
} from '../../.test-build/notifications.js';

test('weekly publication key remains chat- and week-specific', () => {
  assert.equal(buildWeeklySchedulePublicationKey(-100123, '2026-11-23'), '-100123:2026-11-23');
});

test('schedule notification targets are grouped by trimmed schedule group', () => {
  const grouped = groupScheduleTargetsByGroup([
    { chatId: -1, scheduleGroup: ' Group A ', title: 'one' },
    { chatId: -2, scheduleGroup: 'Group A', title: 'two' },
    { chatId: -3, scheduleGroup: 'Group B', title: 'three' },
    { chatId: -4, scheduleGroup: '  ', title: 'empty' },
    { scheduleGroup: 'Group C', title: 'no chat' }
  ]);
  assert.deepEqual([...grouped.keys()], ['Group A', 'Group B']);
  assert.deepEqual(grouped.get('Group A')?.map(x => x.chatId), [-1, -2]);
});

test('schedule monitoring end date is inclusive and crosses month/year boundaries', () => {
  assert.equal(getScheduleChangeMonitorEnd('2026-11-27'), '2026-12-04');
  assert.throws(() => getScheduleChangeMonitorEnd('not-a-date'), /Invalid schedule monitoring start date/);
});

test('schedule change message escapes values and caps each category at 12 items', () => {
  const escaped = [];
  const message = buildScheduleChangeMessage(
    'Group <A>',
    {
      added: Array.from({ length: 14 }, (_, i) => 'added ' + i),
      removed: ['removed'],
      changed: ['changed']
    },
    value => {
      escaped.push(value);
      return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    }
  );
  assert.match(message, /Group &lt;A&gt;/);
  assert.match(message, /added 11/);
  assert.doesNotMatch(message, /added 12/);
  assert.match(message, /<b>Убрано:<\/b>/);
  assert.match(message, /<b>Изменено:<\/b>/);
  assert.ok(escaped.includes('Group <A>'));
});
