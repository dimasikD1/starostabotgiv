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
