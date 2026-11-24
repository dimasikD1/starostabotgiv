export interface AttendanceScheduleLesson {
  date?: string | null;
  timeStart?: string | null;
  subject?: string | null;
  room?: string | null;
}
export interface AttendanceScheduleTask {
  key: string;
  lesson: AttendanceScheduleLesson;
  sendLessonReminder: boolean;
  sendAttendancePoll: boolean;
}
export interface AttendanceSchedulePlannerInput {
  chatId: string | number;
  lessons: readonly AttendanceScheduleLesson[];
  today: string;
  currentMinutes: number;
  sentLessonNotices: Readonly<Record<string, unknown>>;
  sentAttendancePolls: Readonly<Record<string, unknown>>;
}
/** Pure scheduling decision; Telegram delivery and persistence stay in index.mjs. */
export function buildAttendanceScheduleTasks(input: AttendanceSchedulePlannerInput): AttendanceScheduleTask[] {
  const tasks: AttendanceScheduleTask[] = [];
  for (const lesson of input.lessons) {
    if (lesson.date !== input.today || !lesson.timeStart) continue;
    const match = String(lesson.timeStart).match(/^(\d{1,2}):(\d{2})$/);
    if (!match) continue;
    const startMinutes = Number(match[1]) * 60 + Number(match[2]);
    if (!Number.isInteger(startMinutes) || startMinutes < 0 || startMinutes >= 24 * 60 ||
        Number(match[2]) > 59) continue;
    const key = [input.chatId, lesson.date, lesson.timeStart, lesson.subject].map(value => String(value ?? '')).join('|');
    const sendLessonReminder = input.currentMinutes >= startMinutes - 30 &&
      input.currentMinutes <= startMinutes - 29 && !input.sentLessonNotices[key];
    const sendAttendancePoll = input.currentMinutes >= startMinutes - 10 &&
      input.currentMinutes <= startMinutes - 9 && !input.sentAttendancePolls[key];
    if (sendLessonReminder || sendAttendancePoll) {
      tasks.push({ key, lesson, sendLessonReminder, sendAttendancePoll });
    }
  }
  return tasks;
}


export interface AttendanceReminderMessageInput {
  subject: string;
  timeStart: string;
  room?: string | null;
}

/** Format the existing HTML lesson reminder; caller sends it through Telegram. */
export function buildAttendanceReminderMessage(input: AttendanceReminderMessageInput, escapeHtml: (value: string) => string): string {
  return '⏰ <b>Напоминание о занятии</b>\\n\\nЧерез 30 минут начинается: <b>' +
    escapeHtml(input.subject) + '</b>\\n🕒 Начало: ' + input.timeStart +
    (input.room ? '\\n🚪 Аудитория: ' + escapeHtml(input.room) : '');
}

/** Build the legacy non-anonymous attendance poll question. */
export function buildAttendancePollQuestion(input: Pick<AttendanceReminderMessageInput, 'subject' | 'timeStart'>): string {
  return '📋 Посещаемость: ' + input.subject + '\\nПара начинается в ' + input.timeStart + '. Ты будешь присутствовать?';
}
