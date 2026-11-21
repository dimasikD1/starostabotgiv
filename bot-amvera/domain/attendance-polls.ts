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

  const option = Number(answer.option_ids?.[0]);
  const status: AttendancePollResponse['status'] =
    option === 0 ? 'present' : option === 1 ? 'absent' : 'unknown';

  record.responses ||= {};
  record.responses[userId] = {
    userId,
    username: answer.user?.username || '',
    firstName: answer.user?.first_name || '',
    status,
    answeredAt
  };

  const group = groups[String(record.groupId)];
  const student = group?.students?.find(item => {
    const studentRecord = item && typeof item === 'object'
      ? item as AttendancePollStudent
      : undefined;
    return String(studentRecord?.telegramId || '') === userId;
  });

  let attendanceUpdated = false;
  if (student && record.lessonKey) {
    group.lessonAttendance ||= {};
    group.lessonAttendance[String(record.lessonKey)] ||= {};
    group.lessonAttendance[String(record.lessonKey)][String(attendanceKey(student))] =
      option === 0 ? 'present' : option === 1 ? 'absent' : 'unmarked';
    attendanceUpdated = true;
  }

  return {
    userId,
    groupName: String(record.groupName || ''),
    attendanceUpdated
  };
}
