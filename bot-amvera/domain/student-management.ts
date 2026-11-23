export interface StudentRecord {
  [key: string]: unknown;
  name?: unknown;
  telegramId?: unknown;
  username?: unknown;
  phone?: unknown;
}

export interface StudentRosterGroup {
  [key: string]: unknown;
  students?: unknown[];
  starostaId?: string | number;
  zamId?: string | number;
  _roleAssignmentsInitialized?: boolean;
  studyGroup?: string;
  institutionId?: string;
}

export interface StudentUser {
  [key: string]: unknown;
  role?: unknown;
  username?: unknown;
  group?: unknown;
  groupChatId?: unknown;
  institutionId?: unknown;
  pendingStudentImport?: unknown;
  pendingStudentImportChatId?: unknown;
  pendingStudentImportReview?: unknown;
}

export type StudentField = 'username' | 'phone';
export type AddStudentResult = 'added' | 'updated' | 'duplicate' | 'limit';

function studentObject(value: unknown): StudentRecord {
  return value && typeof value === 'object' ? value as StudentRecord : {};
}

/** Add or refresh a Telegram-linked student, preserving the legacy 100-student cap. */
export function addTelegramStudent(
  group: StudentRosterGroup,
  student: { name: string; telegramId: string; username?: string },
  limit = 100
): AddStudentResult {
  group.students ||= [];
  const record: StudentRecord = {
    name: student.name || 'Без имени',
    telegramId: String(student.telegramId),
    username: student.username || ''
  };
  const index = group.students.findIndex(item =>
    String(studentObject(item).telegramId || '') === record.telegramId
  );
  if (index >= 0) {
    group.students[index] = record;
    return 'updated';
  }
  if (group.students.length >= limit) return 'limit';
  group.students.push(record);
  return 'added';
}

/** Add a legacy name-only student, checking duplicates case-insensitively. */
export function addNamedStudent(
  group: StudentRosterGroup,
  name: string,
  limit = 100
): AddStudentResult {
  group.students ||= [];
  const normalized = name.trim().toLocaleLowerCase('ru-RU');
  if (group.students.some(item => {
    const current = typeof item === 'string' ? item : String(studentObject(item).name || '');
    return current.toLocaleLowerCase('ru-RU') === normalized;
  })) return 'duplicate';
  if (group.students.length >= limit) return 'limit';
  group.students.push(name);
  return 'added';
}

export function removeStudentAt(group: StudentRosterGroup, index: number): unknown | undefined {
  if (!Array.isArray(group.students) || !Number.isInteger(index) || index < 0 || index >= group.students.length) {
    return undefined;
  }
  return group.students.splice(index, 1)[0];
}

/** Update a contact field while keeping legacy string records compatible. */
export function updateStudentField(
  group: StudentRosterGroup,
  index: number,
  field: StudentField,
  value: string
): StudentRecord | undefined {
  if (!Array.isArray(group.students) || !Number.isInteger(index) || index < 0 || index >= group.students.length) {
    return undefined;
  }
  const current = group.students[index];
  const record: StudentRecord = typeof current === 'string'
    ? { name: current }
    : { ...studentObject(current) };
  record[field] = value;
  group.students[index] = record;
  return record;
}

/** Assign a single group-level role and synchronize the user's legacy profile fields. */
export function assignStudyGroupRole(
  group: StudentRosterGroup,
  user: StudentUser,
  role: 'starosta' | 'zam',
  userId: string | number,
  options: { username?: string; chatId: string | number; institutionId: string; groupName: string }
): void {
  const id = String(userId);
  if (role === 'starosta') group.starostaId = id;
  else group.zamId = id;
  group._roleAssignmentsInitialized = true;
  user.role = role;
  user.username = options.username || user.username || '';
  user.group = options.groupName;
  user.groupChatId = String(options.chatId);
  user.institutionId = options.institutionId;
}

/** Clear role assignments for one user; optionally restrict changes to a Telegram chat. */
export function clearStudyGroupRoles(
  groups: StudentRosterGroup[],
  userId: string | number,
  chatId?: string | number,
  markInitialized = true
): number {
  const id = String(userId);
  const scopedChat = chatId === undefined ? undefined : String(chatId);
  let removed = 0;
  for (const group of groups) {
    if (scopedChat !== undefined && String(group.chatId || '') !== scopedChat) continue;
    if (String(group.starostaId || '') === id) { group.starostaId = ''; removed++; }
    if (String(group.zamId || '') === id) { group.zamId = ''; removed++; }
    if (markInitialized) group._roleAssignmentsInitialized = true;
  }
  return removed;
}

/** Synchronize a user's global role and optionally clear the chat association. */
export function setStudentRole(user: StudentUser, chatId?: string | number): void {
  user.role = 'student';
  if (chatId !== undefined && String(user.groupChatId || '') === String(chatId)) {
    delete user.groupChatId;
  }
}


export type StudentContactNormalization =
  | { ok: true; value: string }
  | { ok: false };

/** Normalize a Telegram username using the legacy command's accepted format. */
export function normalizeStudentUsername(input: string): StudentContactNormalization {
  const value = input === '-' ? '' : input.replace(/^@/, '').trim();
  return !value || /^[A-Za-z0-9_]{5,32}$/.test(value)
    ? { ok: true, value }
    : { ok: false };
}

/** Normalize a phone number while preserving the legacy international format check. */
export function normalizeStudentPhone(input: string): StudentContactNormalization {
  const value = input === '-' ? '' : input.replace(/[^0-9+]/g, '');
  return !value || /^\+[1-9][0-9]{5,14}$/.test(value)
    ? { ok: true, value }
    : { ok: false };
}


export type GroupRoleAssignmentResult =
  | { status: 'assigned'; group: StudentRosterGroup }
  | { status: 'group-not-found' }
  | { status: 'target-is-starosta' };

/** Resolve a numbered study group and assign its role without crossing group boundaries. */
export function assignStudyGroupRoleByNumber(
  groups: StudentRosterGroup[],
  user: StudentUser,
  role: 'starosta' | 'zam',
  userId: string | number,
  groupNumber: string,
  studyGroupNames: Record<string, string>,
  options: { username?: string; chatId: string | number; institutionId: string }
): GroupRoleAssignmentResult {
  if (groupNumber !== '1' && groupNumber !== '2') return { status: 'group-not-found' };
  const groupName = studyGroupNames[groupNumber];
  if (!groupName) return { status: 'group-not-found' };
  const group = groups.find(item => item.studyGroup === groupName);
  if (!group) return { status: 'group-not-found' };
  if (role === 'zam' && String(group.starostaId || '') === String(userId)) {
    return { status: 'target-is-starosta' };
  }
  assignStudyGroupRole(group, user, role, userId, {
    username: options.username,
    chatId: options.chatId,
    institutionId: options.institutionId,
    groupName
  });
  return { status: 'assigned', group };
}


export interface RemoveGroupRolesResult {
  removed: number;
  user: StudentUser;
}

/** Remove role assignments in all groups or one chat, then synchronize the user's student role. */
export function removeGroupRolesAndSetStudent(
  groups: StudentRosterGroup[],
  user: StudentUser,
  userId: string | number,
  chatId?: string | number
): RemoveGroupRolesResult {
  const removed = clearStudyGroupRoles(groups, userId, chatId);
  setStudentRole(user, chatId);
  return { removed, user };
}


export interface StudentCardData {
  index: number;
  name: string;
  username: string;
  phone: string;
  telegramId: string;
}

export interface StudentRosterItem {
  index: number;
  name: string;
}

/** Return a bounded page of roster entries with stable zero-based indexes. */
export function getStudentRosterPage(
  group: StudentRosterGroup,
  page = 0,
  pageSize = 10
): { items: StudentRosterItem[]; page: number; pages: number; total: number } {
  const students = Array.isArray(group.students) ? group.students : [];
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 10;
  const pages = Math.max(1, Math.ceil(students.length / size));
  const currentPage = Math.max(0, Math.min(Number.isFinite(page) ? Math.trunc(page) : 0, pages - 1));
  const start = currentPage * size;
  return {
    items: students.slice(start, start + size).map((item, offset) => ({
      index: start + offset,
      name: typeof item === 'string' ? item : String(studentObject(item).name || 'Без имени')
    })),
    page: currentPage,
    pages,
    total: students.length
  };
}

/** Read a student's contact card without changing legacy string/object records. */
export function getStudentCard(group: StudentRosterGroup, index: number): StudentCardData | undefined {
  if (!Array.isArray(group.students) || !Number.isInteger(index) || index < 0 || index >= group.students.length) {
    return undefined;
  }
  const item = group.students[index];
  const record = typeof item === 'string' ? { name: item } : studentObject(item);
  return {
    index,
    name: String(record.name || 'Без имени'),
    username: String(record.username || ''),
    phone: String(record.phone || ''),
    telegramId: String(record.telegramId || '')
  };
}


export interface StudentRosterReplacementResult {
  count: number;
  truncated: boolean;
}

/** Replace a roster from a reviewed list, preserving the legacy 100-entry limit and attendance object. */
export function replaceStudentRoster(
  group: StudentRosterGroup,
  user: StudentUser,
  names: string[],
  limit = 100
): StudentRosterReplacementResult {
  const accepted = names.slice(0, Math.max(0, limit));
  group.students = accepted.slice();
  if (!group.attendance || typeof group.attendance !== 'object') group.attendance = {};
  user.students = accepted.slice();
  return { count: accepted.length, truncated: names.length > accepted.length };
}

/** Commit a reviewed student import and clear its temporary workflow state. */
export function confirmStudentRosterImport(
  group: StudentRosterGroup,
  user: StudentUser,
  names: string[],
  limit = 100
): StudentRosterReplacementResult {
  const result = replaceStudentRoster(group, user, names, limit);
  delete user.pendingStudentImport;
  delete user.pendingStudentImportChatId;
  delete user.pendingStudentImportReview;
  return result;
}


/** Convert the one-based /delstudent argument to a validated zero-based roster index. */
export function parseStudentRemovalIndex(input: string, studentCount: number): number | undefined {
  const index = Number(input.trim()) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= studentCount) return undefined;
  return index;
}


/** Format the /students header while escaping the group title for Telegram HTML. */
export function formatStudentRosterSummary(groupTitle: string, studentCount: number): string {
  const escapedTitle = groupTitle.replace(/[&<>"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  })[character] || character);
  const count = Number.isFinite(studentCount) ? Math.max(0, Math.trunc(studentCount)) : 0;
  return '👥 <b>' + escapedTitle + '</b>\n👨‍🎓 Всего студентов: <b>' + count + '</b>\n\nНажми на студента, чтобы открыть карточку и изменить контакты.';
}

/** Extract the name supplied to /student, accepting an optional bot username. */
export function parseStudentNameArgument(messageText: string): string {
  return messageText.replace(/^\/student(?:@\S+)?/i, '').trim();
}

/** Format a student contact card using the legacy Telegram HTML layout. */
export function formatStudentCardText(card: StudentCardData | undefined): string {
  if (!card) return '❌ Студент не найден.';
  const escape = (value: string): string => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const username = card.username ? '@' + card.username.replace(/^@/, '') : 'не указан';
  const phone = card.phone || 'не указан';
  const telegramId = card.telegramId || 'не указан';
  return '👤 <b>' + escape(card.name) + '</b>\\n\\n🔹 Username: ' + escape(username) +
    '\\n📞 Телефон: <code>' + escape(phone) + '</code>\\n🆔 Telegram ID: <code>' +
    escape(telegramId) + '</code>';
}
