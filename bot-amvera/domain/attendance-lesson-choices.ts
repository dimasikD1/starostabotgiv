export interface AttendanceLessonChoice {
  timeStart?: unknown;
  timeEnd?: unknown;
  subject?: unknown;
}
export interface AttendanceLessonChoiceButton {
  text: string;
  callbackData: string;
}
/** Build the legacy lesson-picker labels and callback payloads without Telegraf. */
export function buildAttendanceLessonChoices(
  lessons: readonly AttendanceLessonChoice[]
): AttendanceLessonChoiceButton[][] {
  return lessons.map((lesson, index) => {
    const time = lesson.timeStart
      ? String(lesson.timeStart) + (lesson.timeEnd ? '–' + String(lesson.timeEnd) : '')
      : 'Время не указано';
    return [{
      text: (index + 1) + '. ' + time + ' — ' + String(lesson.subject || 'Пара').slice(0, 35),
      callbackData: 'attlesson:' + index
    }];
  });
}
