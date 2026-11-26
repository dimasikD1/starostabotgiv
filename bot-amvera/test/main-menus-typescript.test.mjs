import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentMenuRows, buildManagerMenuRows } from '../../.test-build/domain-user/main-menus.js';

test('student menu exposes only student-facing entries and hosting support', () => {
  assert.deepEqual(buildStudentMenuRows(), [
    ['👥 Моя группа'],
    ['📚 ДЗ'],
    ['❔ Что умеет бот'],
    ['➕ Подключить бота к чату'],
    ['💛 Поддержать хостинг']
  ]);
});

test('manager menu preserves management actions and row layout', () => {
  assert.deepEqual(buildManagerMenuRows(), [
    ['📅 Сегодня', '📅 Завтра'],
    ['🗓 Неделя', '👥 Моя группа'],
    ['📊 Создать опрос', '📚 Создать ДЗ'],
    ['👨‍🎓 Список студентов', '📋 Посещаемость'],
    ['👥 Группы'],
    ['➕ Подключить бота к чату'],
    ['💛 Поддержать хостинг'],
    ['🔄 Обновить', '❔ Что умеет бот']
  ]);
});
