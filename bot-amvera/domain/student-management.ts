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
