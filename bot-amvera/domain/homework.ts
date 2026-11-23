export interface HomeworkAttachment {
  fileId?: unknown;
  type?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
}

export interface HomeworkRecord {
  [key: string]: unknown;
  id: string;
  subject: string;
  homework: string;
  createdAt: string;
  authorId: string | number;
  completedBy: Record<string, string>;
  attachments?: HomeworkAttachment[];
}

export interface HomeworkGroup {
  [key: string]: unknown;
  title?: unknown;
  scheduleGroup?: unknown;
  homework?: HomeworkRecord[];
}

export type HomeworkParseResult =
  | { ok: true; subject: string; homework: string }
  | { ok: false; error: 'missing_parts' | 'subject_too_long' | 'homework_too_long' };

/** Parse the existing /hw Subject | task format without changing its limits. */
export function parseHomeworkCommand(input: unknown): HomeworkParseResult {
  const text = String(input || '').trim();
  const parts = text.split('|').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return { ok: false, error: 'missing_parts' };
  const subject = parts.shift() || '';
  const homework = parts.join(' | ');
  if (subject.length > 100) return { ok: false, error: 'subject_too_long' };
  if (homework.length > 3500) return { ok: false, error: 'homework_too_long' };
  return { ok: true, subject, homework };
}

/** Build a persisted assignment using the legacy JSON shape. */
export function createHomeworkRecord(
  input: { subject: string; homework: string },
  id: string,
  createdAt: string,
  authorId: string | number,
  attachments: HomeworkAttachment[] = []
): HomeworkRecord {
  return {
    id,
    subject: input.subject,
    homework: input.homework,
    ...(attachments.length ? { attachments } : {}),
    createdAt,
    authorId,
    completedBy: {}
  };
}

/** Append an assignment and preserve the legacy per-chat history limit. */
export function appendHomework(
  group: HomeworkGroup,
  item: HomeworkRecord,
  limit = 50
): void {
  group.homework ||= [];
  group.homework.push(item);
  if (group.homework.length > limit) {
    group.homework = group.homework.slice(-limit);
  }
}

export interface HomeworkCompletionState {
  status: 'not_found' | 'already_completed' | 'ready';
  item?: HomeworkRecord;
}

/** Find a homework item in the selected group and report whether this user already completed it. */
export function getHomeworkCompletionState(
  groups: HomeworkGroup[],
  groupName: string,
  homeworkId: string,
  userId: string
): HomeworkCompletionState {
  const matching = groups.filter(group =>
    !groupName ||
    String(group.scheduleGroup || '').trim() === groupName ||
    String(group.title || '').trim() === groupName
  );
  const item = matching.flatMap(group => group.homework || [])
    .find(homework => String(homework.id || '') === homeworkId);
  if (!item) return { status: 'not_found' };
  if (item.completedBy?.[userId]) return { status: 'already_completed', item };
  return { status: 'ready', item };
}

/** Mark an assignment complete, retaining the first completion timestamp. */
export function markHomeworkCompleted(
  groups: HomeworkGroup[],
  groupName: string,
  homeworkId: string,
  userId: string,
  completedAt: string
): HomeworkRecord | undefined {
  const matching = groups.filter(group =>
    !groupName ||
    String(group.scheduleGroup || '').trim() === groupName ||
    String(group.title || '').trim() === groupName
  );
  const item = matching.flatMap(group => group.homework || [])
    .find(homework => String(homework.id || '') === homeworkId);
  if (!item) return undefined;
  item.completedBy ||= {};
  if (!item.completedBy[userId]) item.completedBy[userId] = completedAt;
  return item;
}

export interface HomeworkCompletionStatisticsItem {
  id: string;
  subject: string;
  homework: string;
  attachments: Array<{ type: unknown; fileName: string }>;
  createdAt: string;
  completedCount: number;
  totalStudents: number;
  completionRate: number;
  completedStudents: string[];
  pendingStudents: string[];
  unmatchedCompletions: string[];
}

export interface HomeworkCompletionStatistics {
  items: HomeworkCompletionStatisticsItem[];
  week: { assignments: number; completed: number; possible: number; rate: number };
  all: { assignments: number; completed: number; possible: number };
}

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
}

/** Build the same per-assignment and weekly completion statistics used by Mini App /api/data. */
export function buildHomeworkCompletionStatistics(
  homeworkInput: unknown,
  studentsInput: unknown,
  usersInput: unknown,
  getStudentName: (student: unknown) => string,
  nowMs = Date.now()
): HomeworkCompletionStatistics {
  const homework = Array.isArray(homeworkInput) ? homeworkInput : [];
  const students = Array.isArray(studentsInput) ? studentsInput : [];
  const users = recordOf(usersInput);

  const items = homework.map((homeworkValue): HomeworkCompletionStatisticsItem => {
    const item = recordOf(homeworkValue);
    const completedBy = recordOf(item.completedBy);
    const completedIds = new Set(Object.keys(completedBy));
    const completedUserNames = new Set([...completedIds]
      .map(id => String(recordOf(users[id]).fullName || '').trim().toLocaleLowerCase('ru-RU'))
      .filter(Boolean));

    const isCompleted = (student: unknown): boolean => {
      const studentRecord = recordOf(student);
      const id = typeof student === 'object' && student !== null
        ? String(studentRecord.telegramId || '')
        : '';
      return (Boolean(id) && completedIds.has(id)) ||
        completedUserNames.has(getStudentName(student).trim().toLocaleLowerCase('ru-RU'));
    };

    const completedStudents = students.filter(isCompleted).map(getStudentName);
    const pendingStudents = students.filter(student => !isCompleted(student)).map(getStudentName);
    const matchedIds = new Set(students
      .filter(student => typeof student === 'object' && student !== null && recordOf(student).telegramId)
      .map(student => String(recordOf(student).telegramId)));
    const matchedNames = new Set(students
      .map(student => getStudentName(student).trim().toLocaleLowerCase('ru-RU')));
    const unmatchedCompletions = [...completedIds]
      .filter(id => !matchedIds.has(id) &&
        !matchedNames.has(String(recordOf(users[id]).fullName || '').trim().toLocaleLowerCase('ru-RU')))
      .map(id => String(recordOf(users[id]).fullName ||
        recordOf(users[id]).username || 'Участник без записи в списке'));

    const attachments = Array.isArray(item.attachments) ? item.attachments : [];
    return {
      id: String(item.id || ''),
      subject: String(item.subject || ''),
      homework: String(item.homework || ''),
      attachments: attachments.map(value => {
        const attachment = recordOf(value);
        return { type: attachment.type || 'photo', fileName: String(attachment.fileName || 'Вложение') };
      }),
      createdAt: String(item.createdAt || ''),
      completedCount: completedStudents.length,
      totalStudents: students.length,
      completionRate: students.length ? Math.round(completedStudents.length / students.length * 100) : 0,
      completedStudents,
      pendingStudents,
      unmatchedCompletions
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100);

  const weekCutoff = nowMs - 7 * 86400000;
  const weekItems = items.filter(item => {
    const timestamp = Date.parse(item.createdAt || '');
    return Number.isFinite(timestamp) && timestamp >= weekCutoff;
  });
  const weekCompleted = weekItems.reduce((total, item) => total + item.completedCount, 0);
  const weekPossible = weekItems.reduce((total, item) => total + item.totalStudents, 0);
  const allCompleted = items.reduce((total, item) => total + item.completedCount, 0);
  const allPossible = items.reduce((total, item) => total + item.totalStudents, 0);

  return {
    items,
    week: {
      assignments: weekItems.length,
      completed: weekCompleted,
      possible: weekPossible,
      rate: weekPossible ? Math.round(weekCompleted / weekPossible * 100) : 0
    },
    all: {
      assignments: items.length,
      completed: allCompleted,
      possible: allPossible
    }
  };
}

/** Return the same newest-first, ten-item list used by the Telegram menu. */
export function latestHomework(
  groups: HomeworkGroup[],
  groupName: string,
  limit = 10
): Array<HomeworkRecord & { groupTitle: string }> {
  return groups
    .filter(group =>
      !groupName ||
      String(group.scheduleGroup || '').trim() === groupName ||
      String(group.title || '').trim() === groupName
    )
    .flatMap(group => (group.homework || []).map(item => ({
      ...item,
      groupTitle: String(group.title || '')
    })))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, limit);
}
