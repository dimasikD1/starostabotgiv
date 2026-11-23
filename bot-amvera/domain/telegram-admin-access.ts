export interface TelegramAdminChat {
  id: string | number;
  type: string;
}

export interface TelegramChatMember {
  status?: string;
}

export type GetTelegramChatMember = (
  chatId: string | number,
  userId: string | number
) => Promise<TelegramChatMember>;

/** Checks Telegram administrator status without allowing API failures to grant access. */
export async function isTelegramGroupAdmin(
  chat: TelegramAdminChat | null | undefined,
  userId: string | number | null | undefined,
  getChatMember: GetTelegramChatMember
): Promise<boolean> {
  if (!chat || !['group', 'supergroup'].includes(chat.type) || userId == null) return false;
  try {
    const member = await getChatMember(chat.id, userId);
    return member.status === 'creator' || member.status === 'administrator';
  } catch {
    return false;
  }
}
