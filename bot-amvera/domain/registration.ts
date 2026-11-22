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
