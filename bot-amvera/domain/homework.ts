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
