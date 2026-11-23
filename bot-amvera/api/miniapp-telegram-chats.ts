export interface MiniAppTelegramChat {
  chatId: string | number;
  title?: string;
  [key: string]: unknown;
}
export interface MiniAppTelegramUser {
  id: string | number;
  first_name?: string;
}
export type MiniAppTelegramChatActionResult =
  | { ok: true; message: string }
  | { ok: false; reason: 'unknown-action' | 'empty' | 'too-long' };
export interface MiniAppTelegramChatDependencies<TAnnouncement = unknown> {
  setChatPermissions(chatId: string | number, permissions: Record<string, boolean>, options: { use_independent_chat_permissions: true }): Promise<unknown>;
  sendMessage(chatId: string | number, message: string): Promise<unknown>;
  normalizeText(value: unknown): { ok: true; text: string } | { ok: false; reason: string };
  formatMessage(text: string): string;
  createRecord(text: string, authorId: string | number, authorName: string): TAnnouncement;
  ensureStudyGroups(chat: MiniAppTelegramChat): Array<{ announcements?: TAnnouncement[] }>;
  appendAnnouncement(history: TAnnouncement[] | undefined, item: TAnnouncement): TAnnouncement[];
  save(): void;
}
export function listManagedMiniAppTelegramChats<T extends MiniAppTelegramChat>(
  groups: Record<string, T> | undefined,
  userId: string | number,
  canManageChat: (userId: string | number, chatId: string | number) => boolean
): T[] {
  return Object.values(groups || {}).filter(chat => canManageChat(userId, chat.chatId));
}
export async function performMiniAppTelegramChatAction<TAnnouncement>(
  chat: MiniAppTelegramChat,
  action: string,
  payload: { text?: unknown },
  user: MiniAppTelegramUser,
  fullName: unknown,
  dependencies: MiniAppTelegramChatDependencies<TAnnouncement>
): Promise<MiniAppTelegramChatActionResult> {
  if (action === 'open') {
    await dependencies.setChatPermissions(chat.chatId, {
      can_send_messages: true,
      can_send_audios: true,
      can_send_documents: true,
      can_send_photos: true,
      can_send_videos: true,
      can_send_video_notes: true,
      can_send_voice_notes: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true
    }, { use_independent_chat_permissions: true });
    return { ok: true, message: 'Всем участникам разрешено писать в чат.' };
  }
  if (action !== 'announce') return { ok: false, reason: 'unknown-action' };
  const validation = dependencies.normalizeText(payload.text);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason === 'empty' ? 'empty' : 'too-long' };
  }
  await dependencies.sendMessage(chat.chatId, dependencies.formatMessage(validation.text));
  const item = dependencies.createRecord(
    validation.text,
    user.id,
    String(fullName || user.first_name || 'Староста')
  );
  for (const group of dependencies.ensureStudyGroups(chat)) {
    group.announcements = dependencies.appendAnnouncement(group.announcements, item);
  }
  dependencies.save();
  return { ok: true, message: 'Объявление опубликовано в чате.' };
}
