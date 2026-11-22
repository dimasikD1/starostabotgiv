import type { ScheduleLesson } from './types.js';

export interface ScheduleSnapshotItem {
  date: string;
  time: string;
  subject: string;
  teacher: string;
  room: string;
  timeEnd: string;
}

export type ScheduleSnapshot = Record<string, ScheduleSnapshotItem>;

export interface ScheduleChangeSummary {
  added: string[];
  removed: string[];
  changed: string[];
}

function lessonKey(lesson: ScheduleLesson): string {
  return [lesson.date, lesson.timeStart || lesson.time || '', lesson.subject].join('|');
}

function label(item: ScheduleSnapshotItem): string {
  return [item.date, item.time, item.subject].filter(Boolean).join(' · ');
}

/** Builds a stable snapshot; date/time/subject form identity, matching the legacy monitor. */
export function buildScheduleSnapshot(lessons: ScheduleLesson[]): ScheduleSnapshot {
  const snapshot: ScheduleSnapshot = {};
  for (const lesson of lessons) {
    if (!lesson?.date || !lesson?.subject) continue;
    snapshot[lessonKey(lesson)] = {
      date: lesson.date,
      time: lesson.timeStart || lesson.time || '',
      subject: lesson.subject || '',
      teacher: lesson.teacher || '',
      room: lesson.room || '',
      timeEnd: lesson.timeEnd || ''
    };
  }
  return snapshot;
}

/** Compares snapshots and returns only changes in the requested alert window. */
export function diffScheduleSnapshots(
  previous: ScheduleSnapshot,
  current: ScheduleSnapshot,
  windowStart: string,
  windowEnd: string
): ScheduleChangeSummary {
  const inAlertWindow = (date: string): boolean => date >= windowStart && date <= windowEnd;
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [key, item] of Object.entries(current)) {
    const old = previous[key];
    if (!old && inAlertWindow(item.date)) {
      added.push('➕ ' + label(item));
    } else if (old && inAlertWindow(item.date) &&
      (old.room !== item.room || old.teacher !== item.teacher || old.timeEnd !== item.timeEnd)) {
      const details: string[] = [];
      if (old.timeEnd !== item.timeEnd && (old.timeEnd || item.timeEnd)) {
        details.push('время окончания: ' + (old.timeEnd || '—') + ' → ' + (item.timeEnd || '—'));
      }
      if (old.room !== item.room) details.push('аудитория: ' + (old.room || '—') + ' → ' + (item.room || '—'));
      if (old.teacher !== item.teacher) details.push('преподаватель изменён');
      changed.push('✏️ ' + label(item) + (details.length ? '\n   ' + details.join('; ') : ''));
    }
  }

  for (const [key, item] of Object.entries(previous)) {
    if (!current[key] && inAlertWindow(item.date)) removed.push('➖ ' + label(item));
  }
  return { added, removed, changed };
}
