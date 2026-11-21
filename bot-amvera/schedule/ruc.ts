import { getSchedule as getLegacySchedule } from './ruc.mjs';
import type { LessonType, ScheduleLesson } from './types.js';

const LESSON_TYPES = new Set<LessonType>([
  '',
  'лекция',
  'практическая',
  'лабораторная'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScheduleLesson(value: unknown): value is ScheduleLesson {
  if (!isRecord(value)) return false;

  return (
    typeof value.date === 'string' &&
    typeof value.dayOffset === 'number' &&
    Number.isFinite(value.dayOffset) &&
    typeof value.time === 'string' &&
    typeof value.subject === 'string' &&
    typeof value.teacher === 'string' &&
    typeof value.room === 'string' &&
    typeof value.group === 'string' &&
    (value.timeStart === undefined || typeof value.timeStart === 'string') &&
    (value.timeEnd === undefined || typeof value.timeEnd === 'string') &&
    (value.lessonNumber === undefined || typeof value.lessonNumber === 'string') &&
    (value.lessonType === undefined || LESSON_TYPES.has(value.lessonType as LessonType))
  );
}

/**
 * Typed boundary around the existing, production-proven scraper.
 *
 * The scraper remains in ruc.mjs during this migration step. This adapter
 * checks its runtime output before exposing the strict TypeScript contract.
 * It is not wired into the production bot yet.
 */
export async function getSchedule(
  group: string,
  days = 7,
  startDate?: string
): Promise<ScheduleLesson[]> {
  const result: unknown = await getLegacySchedule(group, days, startDate);

  if (!Array.isArray(result) || !result.every(isScheduleLesson)) {
    throw new TypeError('Schedule provider returned data with an unexpected shape.');
  }

  return result;
}
