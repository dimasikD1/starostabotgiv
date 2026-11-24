import { createAsyncJobLock } from '../domain/.build/background-job-lock.js';
import { buildAttendanceScheduleTasks, buildAttendanceReminderMessage, buildAttendancePollQuestion } from './.build/scheduler.js';

export interface AttendanceJobLesson {
  date?: string | null;
  timeStart?: string | null;
  subject?: string | null;
  room?: string | null;
  [key: string]: unknown;
}

export interface AttendanceJobGroup {
  chatId: string | number;
  title?: string;
  scheduleGroup?: string | null;
}

export interface AttendancePollRecord {
  pollId: string;
  groupId: string;
  groupName?: string;
  scheduleGroup: string;
  date?: string | null;
  time?: string | null;
  subject?: string | null;
  lessonKey: string;
  sentAt: string;
}

export interface AttendanceJobDependencies {
  groups: readonly AttendanceJobGroup[];
  today: string;
  currentMinutes: number;
  loadSchedule(group: string, days: number): Promise<AttendanceJobLesson[]>;
  sendMessage(chatId: string | number, message: string): Promise<void>;
  sendPoll(chatId: string | number, question: string): Promise<string>;
  escapeHtml(value: string): string;
  getLessonKey(lesson: AttendanceJobLesson): string;
  sentLessonNotices: Record<string, unknown>;
  sentAttendancePolls: Record<string, AttendancePollRecord | unknown>;
  save(): void;
  nowIso(): string;
  log(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

/** Runs one non-overlapping attendance notification cycle; all Telegram and storage effects are injected. */
export function createAttendancePollRunner() {
  const lock = createAsyncJobLock();

  return async function runAttendancePollCycle(deps: AttendanceJobDependencies): Promise<void> {
    if (!lock.tryAcquire()) return;
    try {
      for (const group of deps.groups) {
        const scheduleGroup = String(group.scheduleGroup || '').trim();
        if (!scheduleGroup) continue;
        try {
          const lessons = await deps.loadSchedule(scheduleGroup, 2);
          const tasks = buildAttendanceScheduleTasks({
            chatId: group.chatId,
            lessons,
            today: deps.today,
            currentMinutes: deps.currentMinutes,
            sentLessonNotices: deps.sentLessonNotices,
            sentAttendancePolls: deps.sentAttendancePolls
          });
          for (const task of tasks) {
            const lesson = task.lesson as AttendanceJobLesson;
            if (task.sendLessonReminder) {
              await deps.sendMessage(
                group.chatId,
                buildAttendanceReminderMessage({
                  subject: String(lesson.subject || ''),
                  timeStart: String(lesson.timeStart || ''),
                  room: lesson.room
                }, deps.escapeHtml)
              );
              deps.sentLessonNotices[task.key] = deps.nowIso();
              deps.save();
            }
            if (task.sendAttendancePoll) {
              const pollId = await deps.sendPoll(group.chatId, buildAttendancePollQuestion({
                subject: String(lesson.subject || ''),
                timeStart: String(lesson.timeStart || '')
              }));
              deps.sentAttendancePolls[task.key] = {
                pollId,
                groupId: String(group.chatId),
                groupName: group.title,
                scheduleGroup,
                date: lesson.date,
                time: lesson.timeStart,
                subject: lesson.subject,
                lessonKey: deps.getLessonKey(lesson),
                sentAt: deps.nowIso()
              } satisfies AttendancePollRecord;
              deps.save();
              deps.log('[attendance poll] Sent to ' + group.title + ' for ' + lesson.subject + ' at ' + lesson.timeStart);
            }
          }
        } catch (error) {
          deps.error('[attendance poll] ' + group.title + ':', error instanceof Error ? error.message : error);
        }
      }
    } finally {
      lock.release();
    }
  };
}
