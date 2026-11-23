export interface HomeworkFieldsValidation {
  ok: boolean;
  subject?: string;
  homework?: string;
  reason?: 'subject' | 'homework';
}

/** Validate the existing Mini App homework limits without changing route error handling. */
export function validateMiniAppHomeworkFields(
  subjectInput: unknown,
  homeworkInput: unknown
): HomeworkFieldsValidation {
  const subject = String(subjectInput || '').trim();
  const homework = String(homeworkInput || '').trim();
  if (!subject || subject.length > 100) return { ok: false, reason: 'subject' };
  if (!homework || homework.length > 3500) return { ok: false, reason: 'homework' };
  return { ok: true, subject, homework };
}

export interface AttendanceMarkValidation {
  ok: boolean;
  studentIndex?: number;
  status?: 'present' | 'absent' | 'unmarked';
  lessonKey?: string;
}

/** Mirror the Mini App attendance route's numeric coercion and accepted statuses. */
export function validateMiniAppAttendanceMark(
  input: unknown,
  studentCount: number
): AttendanceMarkValidation {
  const body = input && typeof input === 'object'
    ? input as Record<string, unknown>
    : {};
  const studentIndex = Number(body.studentIndex);
  const status = body.status;
  const lessonKey = String(body.lessonKey || '');
  if (
    !Number.isInteger(studentIndex) ||
    studentIndex < 0 ||
    studentIndex >= studentCount ||
    !['present', 'absent', 'unmarked'].includes(String(status))
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    studentIndex,
    status: status as 'present' | 'absent' | 'unmarked',
    lessonKey
  };
}
