import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeeklySchedulePublicationKey,
  getPendingWeeklyScheduleTargets,
  groupScheduleTargetsByGroup,
  getScheduleChangeMonitorEnd,
  buildScheduleChangeMessage,
  isWeeklySchedulePublicationWindow,
  WEEKLY_SCHEDULE_CHECK_INTERVAL_MS,
  SCHEDULE_CHANGE_CHECK_INTERVAL_MS
} from '../../.test-build/notifications.js';

test('weekly publication key remains chat- and week-specific', () => {
  assert.equal(buildWeeklySchedulePublicationKey(-100123, '2026-11-23'), '-100123:2026-11-23');
});

test('selects only chats without a sent weekly schedule marker', () => {
  const targets = [{ chatId: -1, title: 'sent' }, { chatId: -2, title: 'pending' }, { title: 'without chat' }];
  const pending = getPendingWeeklyScheduleTargets(targets, { '-1:2026-11-23': 'sent' }, '2026-11-23');
  assert.deepEqual(pending, [{ target: targets[1], key: '-2:2026-11-23' }]);
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

test('weekly schedule publication window is Sunday from 18:00 in the configured timezone', () => {
  assert.equal(isWeeklySchedulePublicationWindow({ year: '2026', month: '11', day: '22', hour: '17' }), false);
  assert.equal(isWeeklySchedulePublicationWindow({ year: '2026', month: '11', day: '22', hour: '18' }), true);
  assert.equal(isWeeklySchedulePublicationWindow({ year: '2026', month: '11', day: '22', hour: '23' }), true);
  assert.equal(isWeeklySchedulePublicationWindow({ year: '2026', month: '11', day: '23', hour: '18' }), false);
  assert.equal(isWeeklySchedulePublicationWindow({ year: '2026', month: '02', day: '30', hour: '18' }), false);
});

test('schedule background check intervals remain unchanged', () => {
  assert.equal(WEEKLY_SCHEDULE_CHECK_INTERVAL_MS, 60_000);
  assert.equal(SCHEDULE_CHANGE_CHECK_INTERVAL_MS, 300_000);
});
