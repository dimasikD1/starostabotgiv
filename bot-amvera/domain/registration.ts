export interface FullNameValidation {
  ok: boolean;
  value?: string;
  reason?: 'word_count' | 'characters';
}

export function validateAndNormalizeFullName(value: unknown): FullNameValidation {
  const raw = String(value ?? '');
  const words = raw.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 5) return { ok: false, reason: 'word_count' };
  if (!/^[a-zа-яё -]+$/i.test(raw)) return { ok: false, reason: 'characters' };
  const fullName = words
    .map(word => word[0].toLocaleUpperCase('ru-RU') + word.slice(1).toLocaleLowerCase('ru-RU'))
    .join(' ');
  return { ok: true, value: fullName };
}

export interface LinkedStudyGroup {
  chatId?: string | number;
  institutionId?: string;
}

export function applyStudyGroupSelection<T extends Record<string, unknown>>(
  user: T,
  selectedGroup: string,
  linkedGroup?: LinkedStudyGroup,
  defaultInstitutionId = 'inst_001'
): T {
  const next = { ...user, group: selectedGroup } as T;
  if (!['starosta', 'zam'].includes(String(user.role || ''))) {
    (next as Record<string, unknown>).role = 'student';
  }
  if (linkedGroup) {
    (next as Record<string, unknown>).groupChatId = String(linkedGroup.chatId || '');
    (next as Record<string, unknown>).institutionId = String(linkedGroup.institutionId || defaultInstitutionId);
  }
  return next;
}

/** Read a saved study-group choice from current and legacy profile fields. */
export function getSavedStudyGroup(
  user: Record<string, unknown>,
  groups: Record<string, string>
): string | undefined {
  const values = [user.group, user.studyGroup, user.study_group, user.groupName, user.studyGroupName];
  for (const value of values) {
    const saved = String(value ?? '').trim();
    if (!saved) continue;
    const match = Object.values(groups).find(name => name === saved);
    if (match) return match;
    // Older records may store the configured group key (for example, "1") instead of its name.
    const keyedMatch = groups[saved];
    if (keyedMatch) return keyedMatch;
  }
  return undefined;
}

export function shouldPromptStudyGroup(input: {
  isOwner: boolean;
  updateType: string;
  chatType?: string;
  hasGroup: boolean;
  messageText?: string;
}): boolean {
  return !input.isOwner &&
    input.updateType === 'message' &&
    ['group', 'supergroup'].includes(String(input.chatType || '')) &&
    !input.hasGroup &&
    !String(input.messageText || '').startsWith('/');
}

export interface FullNameRegistrationUser {
  fullName?: string;
  pendingFullName?: boolean;
}
export function completeFullNameRegistration<T extends FullNameRegistrationUser>(
  user: T,
  value: unknown
): FullNameValidation {
  const validation = validateAndNormalizeFullName(value);
  if (!validation.ok || !validation.value) return validation;
  user.fullName = validation.value;
  user.pendingFullName = false;
  return validation;
}

/** Resolve a /group argument to one of the configured study-group names. */
export function parseStudyGroupSelection(
  value: unknown,
  groups: Record<string, string>
): string | undefined {
  const input = String(value ?? '').trim();
  if (!input) return undefined;
  for (const [number, name] of Object.entries(groups)) {
    if (input === number || input === name) return name;
  }
  return undefined;
}


export interface StudyGroupRegistrationRecord extends LinkedStudyGroup {
  studyGroup?: unknown;
}

export interface StudyGroupRegistrationResult<T extends Record<string, unknown>> {
  selectedGroup: string;
  user: T;
  verificationChatId: string;
  requiresVerification: boolean;
}

/**
 * Resolve a configured group selection and prepare the compatible user state.
 * Telegram API calls and persistence deliberately remain in the bot entrypoint.
 */
export function resolveStudyGroupRegistration<T extends Record<string, unknown>>(input: {
  user: T;
  groupKey: unknown;
  groups: Record<string, string>;
  linkedGroups: readonly StudyGroupRegistrationRecord[];
  defaultInstitutionId?: string;
}): StudyGroupRegistrationResult<T> | undefined {
  const key = String(input.groupKey ?? '').trim();
  const selectedGroup = input.groups[key];
  if (!selectedGroup) return undefined;

  const linkedGroup = input.linkedGroups.find(
    group => String(group.studyGroup ?? '') === selectedGroup
  );
  const updatedUser = applyStudyGroupSelection(
    input.user,
    selectedGroup,
    linkedGroup,
    input.defaultInstitutionId
  );
  const verificationChatId = String(updatedUser.pendingVerificationChatId ?? '');

  return {
    selectedGroup,
    user: updatedUser,
    verificationChatId,
    requiresVerification: Boolean(verificationChatId)
  };
}
