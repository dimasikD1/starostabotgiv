export interface StudyGroup {
  [key: string]: unknown;
  chatId?: string | number;
  chatTitle?: string;
  title?: string;
  studyGroup?: string;
  scheduleGroup?: string;
  institutionId?: string;
  starostaId?: string | number;
  zamId?: string | number;
  students?: unknown[];
  lessonAttendance?: Record<string, unknown>;
  attendance?: Record<string, unknown>;
  homework?: unknown[];
  announcements?: unknown[];
  calendarEvents?: unknown[];
}

export interface GroupChat {
  [key: string]: unknown;
  chatId?: string | number;
  title?: string;
  institutionId?: string;
  studyGroups?: Record<string, StudyGroup>;
}

export interface GroupAccessDatabase {
  groups: Record<string, GroupChat>;
  defaultRoleSeededChatId?: string;
}

export interface AccessibleGroup {
  id: string;
  title: string;
  chatId: string;
  institutionId: string;
}

export interface GroupAccessDependencies {
  db: GroupAccessDatabase;
  isOwner: (userId: string | number) => boolean;
  isInstitutionAdmin: (userId: string | number, institutionId: unknown) => boolean;
  allStudyGroups: () => StudyGroup[];
  ensureStudyGroups: (chat: GroupChat) => StudyGroup[];
}

export function createGroupAccess(deps: GroupAccessDependencies) {
  const { db, isOwner, isInstitutionAdmin, allStudyGroups, ensureStudyGroups } = deps;

  function canManageGroup(userId: string | number, group: StudyGroup | null | undefined): boolean {
    const id = String(userId);
    return Boolean(group && (
      isOwner(id) ||
      isInstitutionAdmin(id, group.institutionId) ||
      String(group.starostaId || '') === id ||
      String(group.zamId || '') === id
    ));
  }

  function managedStudyGroups(userId: string | number): StudyGroup[] {
    return allStudyGroups().filter(group => canManageGroup(userId, group));
  }

  function canManageChat(userId: string | number, chatId: string | number): boolean {
    const groups = allStudyGroups().filter(group => String(group.chatId) === String(chatId));
    // Chat-wide actions are allowed only when the user manages every cohort in that chat.
    return groups.length > 0 && groups.every(group => canManageGroup(userId, group));
  }

  function managedChats(userId: string | number): GroupChat[] {
    return Object.values(db.groups).filter(chat => canManageChat(userId, chat.chatId || ''));
  }

  function accessibleGroups(userId: string | number): AccessibleGroup[] {
    const id = String(userId);
    const groups = managedStudyGroups(id);
    const score = (group: StudyGroup): number => {
      const appointed = String(group.starostaId || '') === id || String(group.zamId || '') === id;
      const students = Array.isArray(group.students) ? group.students.length : 0;
      const attendance = Object.keys(group.lessonAttendance || {}).length + Object.keys(group.attendance || {}).length;
      const activity = (group.homework || []).length + (group.announcements || []).length + (group.calendarEvents || []).length;
      const primary = String(group.chatId || '') === String(db.defaultRoleSeededChatId || '');
      return (appointed ? 1000000000 : 0) + (primary ? 100000000 : 0) +
        students * 10000 + attendance * 100 + activity;
    };
    const unique = new Map<string, StudyGroup>();
    for (const group of groups) {
      const key = String(group.institutionId || '') + '::' + String(group.studyGroup || group.title || '');
      const previous = unique.get(key);
      if (!previous || score(group) > score(previous)) unique.set(key, group);
    }
    return [...unique.values()]
      .sort((a, b) => String(a.studyGroup || a.title || '').localeCompare(
        String(b.studyGroup || b.title || ''), 'ru'
      ))
      .map(group => ({
        id: String(group.chatId) + '::' + String(group.studyGroup),
        title: String(group.studyGroup),
        chatId: String(group.chatId),
        institutionId: String(group.institutionId || '')
      }));
  }

  function managedGroup(userId: string | number, selectedGroupId = ''): StudyGroup | null {
    const allowed = accessibleGroups(userId);
    const selected = selectedGroupId
      ? allowed.find(group => group.id === String(selectedGroupId))
      : allowed[0];
    if (!selected) return null;
    const chat = db.groups[String(selected.chatId)];
    if (!chat) return null;
    const group = ensureStudyGroups(chat).find(item => item.studyGroup === selected.title);
    if (!group) return null;
    group.chatId = chat.chatId;
    group.chatTitle = chat.title || 'Общий чат';
    group.title = selected.title;
    group.scheduleGroup = selected.title;
    return group;
  }

  return { canManageGroup, managedStudyGroups, canManageChat, managedChats, accessibleGroups, managedGroup };
}
