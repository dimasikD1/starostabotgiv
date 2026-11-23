export interface AnnouncementRecord {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export type AnnouncementTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'empty' | 'too_long' };

export function normalizeAnnouncementText(value: unknown, maxLength = 3000): AnnouncementTextResult {
  const text = String(value ?? '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > maxLength) return { ok: false, reason: 'too_long' };
  return { ok: true, text };
}

export function createAnnouncementRecord(input: {
  id: string;
  text: string;
  authorId: string | number;
  authorName: string;
  createdAt: string;
}): AnnouncementRecord {
  return {
    id: String(input.id),
    text: String(input.text),
    authorId: String(input.authorId),
    authorName: String(input.authorName),
    createdAt: String(input.createdAt)
  };
}

export function appendAnnouncement<T>(history: readonly T[] | undefined, item: T, limit = 100): T[] {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 100));
  return [...(history || []), item].slice(-safeLimit);
}

export function formatAnnouncementMessage(
  text: string,
  heading: 'Объявление' | 'Объявление группы',
  escapeHtml: (value: string) => string
): string {
  return '📢 <b>' + heading + '</b>\n\n' + escapeHtml(text);
}


/** Return the newest announcements in the exact order used by the Mini App. */
export function getRecentAnnouncements<T>(history: readonly T[] | undefined, limit = 30): T[] {
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
  if (safeLimit === 0) return [];
  return [...(history || [])].slice(-safeLimit).reverse();
}


export interface AnnouncementChatGroup {
  chatId?: unknown;
  title?: unknown;
  chatTitle?: unknown;
}

/** Build the unique, numeric Telegram chat targets in the same order as the legacy command. */
export function buildAnnouncementChatOptions(
  groups: Record<string, AnnouncementChatGroup | null | undefined> | null | undefined
): Array<{ id: string; title: string }> {
  const chats = Object.entries(groups || {})
    .map(([id, group]) => ({
      id: String(group?.chatId || id),
      title: String(group?.title || group?.chatTitle || ('Чат ' + (group?.chatId || id)))
    }))
    .filter(chat => /^-?\d+$/.test(chat.id));
  return [...new Map(chats.map(chat => [chat.id, chat])).values()];
}
