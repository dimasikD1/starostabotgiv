export type MenuRows = string[][];

/** Keyboard labels for students; keep Telegram/Telegraf construction in the runtime. */
export function buildStudentMenuRows(): MenuRows {
  return [
    ['👥 Моя группа'],
    ['📚 ДЗ'],
    ['❔ Что умеет бот'],
    ['➕ Подключить бота к чату'],
    ['💛 Поддержать хостинг']
  ];
}

/** Manager-only actions are intentionally kept separate from the student menu. */
export function buildManagerMenuRows(): MenuRows {
  return [
    ['📅 Сегодня', '📅 Завтра'],
    ['🗓 Неделя', '👥 Моя группа'],
    ['📊 Создать опрос', '📚 Создать ДЗ'],
    ['👨‍🎓 Список студентов', '📋 Посещаемость'],
    ['👥 Группы'],
    ['➕ Подключить бота к чату'],
    ['💛 Поддержать хостинг'],
    ['🔄 Обновить', '❔ Что умеет бот']
  ];
}
