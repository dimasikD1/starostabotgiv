/**
 * Общие типы расписания.
 *
 * На первом этапе JS-модули продолжают обслуживать production.
 * Новые TypeScript-модули используют эти контракты, пока перенос
 * существующих функций идёт поэтапно.
 */
export type LessonType = 'лекция' | 'практическая' | 'лабораторная' | '';

export interface ScheduleLesson {
  date: string;
  dayOffset: number;
  time: string;
  timeStart?: string;
  timeEnd?: string;
  subject: string;
  lessonNumber?: string;
  lessonType?: LessonType;
  teacher: string;
  room: string;
  group: string;
}

export interface ScheduleRequest {
  group: string;
  days?: number;
  startDate?: string;
}

export type ScheduleProvider = (
  request: ScheduleRequest
) => Promise<ScheduleLesson[]>;
