export interface StudyGroupRecord {
  id?: string;
  institutionId?: string;
  chatId?: string | number;
  chatTitle?: string;
  title?: string;
  studyGroup?: string;
  scheduleGroup?: string;
  starostaId?: string;
  zamId?: string;
  students?: unknown[];
  attendance?: Record<string, unknown>;
  lessonAttendance?: Record<string, unknown>;
  activeAttendanceLessons?: Record<string, unknown>;
  announcements?: unknown[];
  calendarEvents?: unknown[];
  homework?: unknown[];
  [key: string]: unknown;
}
export interface StudyGroupChat {
  chatId?: string | number;
  title?: string;
  institutionId?: string;
  studyGroups?: Record<string, StudyGroupRecord>;
  starostaId?: string;
  _studyGroupsMigratedV1?: boolean;
  _institutionMigrationV1?: boolean;
  _groupRoleScopeV1?: boolean;
  [key: string]: unknown;
}
export interface StudyGroupDatabase {
  groups: Record<string, StudyGroupChat>;
  institutions?: Record<string, Record<string, unknown>>;
  defaultRoleSeededChatId?: string;
}
export interface EnsureStudyGroupsOptions {
  defaultInstitutionId: string;
  names: string[];
  starostas?: Record<string, string | number>;
  zams?: Record<string, string | number>;
  now?: () => string;
}
export interface EnsureStudyGroupsResult {
  groups: StudyGroupRecord[];
  changed: boolean;
  institutionId: string;
}
const legacyFields = [
  'students', 'attendance', 'lessonAttendance', 'activeAttendanceLessons',
  'announcements', 'calendarEvents', 'homework', 'todayAttendanceLessons'
] as const;
function cloneLegacyValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}
export function ensureStudyGroups(
  db: StudyGroupDatabase,
  chat: StudyGroupChat | null | undefined,
  options: EnsureStudyGroupsOptions
): EnsureStudyGroupsResult {
  if (!chat) return { groups: [], changed: false, institutionId: options.defaultInstitutionId };
  chat.studyGroups ||= {};
  const names = options.names;
  const hadMigration = Boolean(chat._studyGroupsMigratedV1 && chat._institutionMigrationV1 && chat._groupRoleScopeV1);
  let changed = !hadMigration || !db.defaultRoleSeededChatId;
  if (!chat.institutionId) {
    chat.institutionId = options.defaultInstitutionId;
    changed = true;
  }
  const institutionId = String(chat.institutionId);
  if (!db.defaultRoleSeededChatId) {
    const firstDefaultChat = Object.keys(db.groups).find(chatId => {
      const candidate = db.groups[chatId];
      return !candidate?.institutionId || String(candidate.institutionId) === options.defaultInstitutionId;
    });
    db.defaultRoleSeededChatId = String(firstDefaultChat || chat.chatId || '');
  }
  const isPrimaryLegacyChat = String(chat.chatId || '') === String(db.defaultRoleSeededChatId || '');
  db.institutions ||= {};
  if (!db.institutions[institutionId]) {
    db.institutions[institutionId] = {
      id: institutionId,
      name: institutionId === options.defaultInstitutionId ? 'Основное учебное заведение' : 'Учебное заведение',
      shortName: '',
      city: '',
      status: 'active',
      createdAt: (options.now || (() => new Date().toISOString()))(),
      faculties: {}
    };
    changed = true;
  }
  if (!chat._studyGroupsMigratedV1) {
    const firstName = names[0];
    if (firstName) {
      const first = chat.studyGroups[firstName] ||= {};
      const target = first as Record<string, unknown>;
      const source = chat as Record<string, unknown>;
      for (const field of legacyFields) {
        const legacyValue = source[field];
        if (target[field] == null && legacyValue != null) target[field] = cloneLegacyValue(legacyValue);
      }
    }
    chat._studyGroupsMigratedV1 = true;
    changed = true;
  }
  for (const name of names) {
    const item = chat.studyGroups[name] ||= {};
    item.institutionId = institutionId;
    item.chatId = chat.chatId;
    item.chatTitle = chat.title || 'Общий чат';
    item.title = name;
    item.studyGroup = name;
    item.scheduleGroup = name;
    if (!item._roleAssignmentsInitialized) {
      if (institutionId === options.defaultInstitutionId && isPrimaryLegacyChat) {
        const starosta = options.starostas?.[name];
        const zam = options.zams?.[name];
        if (!item.starostaId && starosta) item.starostaId = String(starosta);
        if (!item.zamId && zam) item.zamId = String(zam);
      } else {
        const defaultStarosta = options.starostas?.[name];
        const defaultZam = options.zams?.[name];
        if (String(item.starostaId || '') === String(defaultStarosta || '')) delete item.starostaId;
        if (String(item.zamId || '') === String(defaultZam || '')) delete item.zamId;
      }
      item._roleAssignmentsInitialized = true;
    }
    item.students ||= [];
    item.attendance ||= {};
    item.lessonAttendance ||= {};
    item.activeAttendanceLessons ||= {};
    item.announcements ||= [];
    item.calendarEvents ||= [];
    item.homework ||= [];
  }
  if (!chat._groupRoleScopeV1 && chat.starostaId) {
    const firstName = names[0];
    const first = firstName ? chat.studyGroups[firstName] : undefined;
    const defaultStarosta = firstName ? options.starostas?.[firstName] : undefined;
    if (first && (!first.starostaId || String(first.starostaId) === String(defaultStarosta || ''))) {
      first.starostaId = String(chat.starostaId);
      first._roleAssignmentsInitialized = true;
    }
  }
  chat._institutionMigrationV1 = true;
  chat._groupRoleScopeV1 = true;
  changed ||= !hadMigration;
  return { groups: names.map(name => chat.studyGroups?.[name]).filter((item): item is StudyGroupRecord => Boolean(item)), changed, institutionId };
}
