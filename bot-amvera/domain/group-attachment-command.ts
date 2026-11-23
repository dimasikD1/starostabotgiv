export type TelegramChatKind = 'private' | 'group' | 'supergroup' | string;

export type AttachCommandDecision = 'not-group' | 'not-admin' | 'attach';
export type DetachCommandDecision = 'ignore' | 'not-admin' | 'detach';

/** Keep Telegram chat-type and administrator policy separate from side effects. */
export function decideAttachCommand(chatType: TelegramChatKind, isAdmin: boolean): AttachCommandDecision {
  if (chatType !== 'group' && chatType !== 'supergroup') return 'not-group';
  return isAdmin ? 'attach' : 'not-admin';
}

/** /detach historically ignores private chats and checks admin rights in groups. */
export function decideDetachCommand(chatType: TelegramChatKind, isAdmin: boolean): DetachCommandDecision {
  if (chatType !== 'group' && chatType !== 'supergroup') return 'ignore';
  return isAdmin ? 'detach' : 'not-admin';
}
