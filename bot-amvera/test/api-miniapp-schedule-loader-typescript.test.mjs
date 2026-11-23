import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMiniAppSchedule } from '../../.test-build/api/miniapp-schedule-loader.js';

test('loads the configured group schedule for seven days', () => {
  const calls = [];
  const state = loadMiniAppSchedule('БИ(ЭБ)1-ОЗ/Бп/КД26', (groupName, days) => {
    calls.push({ groupName, days });
    return { items: [{ date: '2026-11-23', subject: 'Информатика' }], loading: true };
  }, () => assert.fail('unexpected schedule error'));

  assert.deepEqual(calls, [{ groupName: 'БИ(ЭБ)1-ОЗ/Бп/КД26', days: 7 }]);
  assert.deepEqual(state, {
    items: [{ date: '2026-11-23', subject: 'Информатика' }],
    error: '',
    loading: true
  });
});

test('preserves the legacy fallback when the schedule group is missing', () => {
  const errors = [];
  const state = loadMiniAppSchedule('', () => assert.fail('schedule must not be requested'), (group, error) => {
    errors.push({ group, message: error.message });
  });

  assert.deepEqual(state, {
    items: [],
    error: 'Расписание временно недоступно. Остальные данные кабинета загружены; попробуй обновить позже.',
    loading: false
  });
  assert.deepEqual(errors, [{
    group: '',
    message: 'Для группы не указано расписание. Сначала настрой /setgroup.'
  }]);
});

test('keeps other Mini App data available when the schedule provider throws', () => {
  const errors = [];
  const state = loadMiniAppSchedule('group-a', () => {
    throw new Error('schedule source offline');
  }, (group, error) => errors.push({ group, message: error.message }));

  assert.deepEqual(state, {
    items: [],
    error: 'Расписание временно недоступно. Остальные данные кабинета загружены; попробуй обновить позже.',
    loading: false
  });
  assert.deepEqual(errors, [{ group: 'group-a', message: 'schedule source offline' }]);
});
