import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMiniAppDataResponse } from '../../.test-build/api/miniapp-data-response.js';

test('builds the legacy Mini App data response and keeps all composed group data', () => {
  const response = buildMiniAppDataResponse({
    telegramUser: { id: 123, first_name: 'Анна', username: 'anna' },
    user: { fullName: 'Анна Иванова', role: 'starosta' },
    group: { scheduleGroup: 'БИ(ЭБ)1-ОЗ/Бп/КД26', title: 'Первая группа', institutionId: 'inst_001' },
    isOwner: false,
    canManageTelegramChats: true,
    institutionAdmin: true,
    institution: { name: 'Краснодарский Кооперативный Институт' },
    date: '2026-11-23',
    data: { lessons: [{ subject: 'Информатика' }], attendance: { present: 1 } },
    scheduleError: '',
    scheduleLoading: true
  });

  assert.deepEqual(response, {
    user: {
      id: 123,
      firstName: 'Анна',
      fullName: 'Анна Иванова',
      username: 'anna',
      role: 'starosta',
      isOwner: false,
      canManageTelegramChats: true,
      institutionAdmin: true,
      institutionId: 'inst_001',
      institutionName: 'Краснодарский Кооперативный Институт'
    },
    group: 'БИ(ЭБ)1-ОЗ/Бп/КД26',
    date: '2026-11-23',
    lessons: [{ subject: 'Информатика' }],
    attendance: { present: 1 },
    scheduleError: '',
    scheduleLoading: true
  });
});

test('uses the same legacy fallbacks when optional Telegram and institution fields are absent', () => {
  const response = buildMiniAppDataResponse({
    telegramUser: { id: '456' },
    user: {},
    group: { title: 'Учебная группа' },
    isOwner: true,
    canManageTelegramChats: false,
    institutionAdmin: false,
    date: '2026-11-24',
    data: {},
    scheduleError: 'Расписание недоступно',
    scheduleLoading: false
  });

  assert.deepEqual(response.user, {
    id: '456',
    firstName: '',
    fullName: '',
    username: '',
    role: undefined,
    isOwner: true,
    canManageTelegramChats: false,
    institutionAdmin: false,
    institutionId: '',
    institutionName: ''
  });
  assert.equal(response.group, 'Учебная группа');
  assert.equal(response.scheduleError, 'Расписание недоступно');
});
