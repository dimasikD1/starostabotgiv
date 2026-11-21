export interface UserRecord {
  [key: string]: unknown;
  group?: unknown;
  role?: unknown;
  createdAt?: unknown;
  pendingPoll?: unknown;
  pendingHomework?: unknown;
  students?: unknown;
  attendance?: unknown;
}

export interface StudentRecord {
  [key: string]: unknown;
  name?: unknown;
  username?: unknown;
  telegramId?: unknown;
}

/** Create the same default user record as the legacy index.mjs accessor. */
export function getOrCreateUser(
  users: Record<string, UserRecord>,
  id: string | number,
  now: Date = new Date()
): UserRecord {
  const key = String(id);
  users[key] ||= {
    group: '',
    role: 'student',
    createdAt: now.toISOString(),
    pendingPoll: null,
    pendingHomework: null,
    students: [],
    attendance: {}
  };
  return users[key];
}

/** Keep the legacy role check: only starosta and zam are manager roles. */
export function isManagerRole(user: Pick<UserRecord, 'role'> | null | undefined): boolean {
  return user?.role === 'starosta' || user?.role === 'zam';
}

/** Human-readable label used by role/profile views. */
export function roleLabel(role: unknown): string {
  return role === 'starosta'
    ? '👑 Староста'
    : role === 'zam'
      ? '⭐ Заместитель старосты'
      : '👨‍🎓 Студент';
}

/** Preserve the existing display format for string and object student records. */
export function studentName(student: unknown): string {
  if (typeof student === 'string') return student;
  const record = student && typeof student === 'object'
    ? student as StudentRecord
    : undefined;
  return String(record?.name || 'Без имени') +
    (record?.username ? ' (@' + String(record.username) + ')' : '');
}

/** Preserve the legacy storage key (Telegram ID first, then student name). */
export function attendanceKey(student: unknown): unknown {
  if (typeof student === 'string') return student;
  const record = student && typeof student === 'object'
    ? student as StudentRecord
    : undefined;
  return record ? (record.telegramId || record.name) : undefined;
}
