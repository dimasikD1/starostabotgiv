import { attendanceKey } from './user-profile.js';

export interface TelegramPollAnswer {
  poll_id?: string;
  option_ids?: number[];
  user?: {
    id?: number | string;
    username?: string;
    first_name?: string;
  };
}

export interface AttendancePollResponse {
  userId: string;
  username: string;
  firstName: string;
  status: 'present' | 'absent' | 'unknown';
  answeredAt: string;
}

export interface AttendancePollRecord {
  [key: string]: unknown;
  pollId?: unknown;
  groupId?: unknown;
  groupName?: unknown;
  lessonKey?: unknown;
  responses?: Record<string, AttendancePollResponse>;
}

export interface AttendancePollStudent {
  [key: string]: unknown;
  telegramId?: unknown;
}

export interface AttendancePollGroup {
  students?: unknown[];
  lessonAttendance?: Record<string, Record<string, unknown>>;
}

export interface AttendancePollAnswerResult {
  userId: string;
  groupName: string;
  attendanceUpdated: boolean;
}

/** Locate a saved poll using the Telegram poll identifier. */
export function findAttendancePollRecord(
  records: Record<string, AttendancePollRecord>,
  pollId: unknown
): AttendancePollRecord | undefined {
  return Object.values(records).find(
    record => String(record.pollId) === String(pollId)
  );
}

/**
 * Apply a Telegram poll answer to the saved poll and, when the student is
 * linked by Telegram ID, to the lesson attendance journal.
 */
export function applyAttendancePollAnswer(
  record: AttendancePollRecord,
  answer: TelegramPollAnswer,
  groups: Record<string, AttendancePollGroup>,
  answeredAt: string
): AttendancePollAnswerResult | null {
  const userId = String(answer.user?.id || '');
  if (!userId) return null;

  const options = Array.isArray(answer.option_ids) ? answer.option_ids : [];
  const option = options[0];
  const withdrawn = options.length === 0;
  const status: AttendancePollResponse['status'] =
    option === 0 ? 'present' : option === 1 ? 'absent' : 'unknown';

  record.responses ||= {};
  if (withdrawn) {
    delete record.responses[userId];
  } else {
    record.responses[userId] = {
      userId,
      username: answer.user?.username || '',
      firstName: answer.user?.first_name || '',
      status,
      answeredAt
    };
  }

  const group = groups[String(record.groupId)];
  const student = group?.students?.find(item => {
    const studentRecord = item && typeof item === 'object'
      ? item as AttendancePollStudent
      : undefined;
    return String(studentRecord?.telegramId || '') === userId;
  });

  let attendanceUpdated = false;
  if (group && student && record.lessonKey) {
    group.lessonAttendance ||= {};
    group.lessonAttendance[String(record.lessonKey)] ||= {};
    const studentKey = String(attendanceKey(student));
    if (withdrawn || status === 'unknown') {
      delete group.lessonAttendance[String(record.lessonKey)][studentKey];
    } else {
      group.lessonAttendance[String(record.lessonKey)][studentKey] = status;
    }
    attendanceUpdated = true;
  }

  return {
    userId,
    groupName: String(record.groupName || ''),
    attendanceUpdated
  };
}

/** Keep the persistent key format stable for already-sent polls. */
export function buildAttendancePollKey(
  groupId: unknown,
  date: unknown,
  time: unknown,
  subject: unknown
): string {
  return [groupId, date, time, subject].map(value => String(value ?? '')).join('|');
}

/** The scheduler runs every minute and sends once in the -10/-9 minute window. */
export function isAttendancePollDue(currentMinutes: number, lessonStartMinutes: number): boolean {
  if (!Number.isFinite(currentMinutes) || !Number.isFinite(lessonStartMinutes)) return false;
  return currentMinutes >= lessonStartMinutes - 10 && currentMinutes <= lessonStartMinutes - 9;
}
