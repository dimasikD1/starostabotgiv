export type StudentImportMessageRoute =
  | 'next'
  | 'group-import'
  | 'private-empty'
  | 'private-cancel'
  | 'private-command'
  | 'private-import';

export interface StudentImportMessageContext {
  isPrivate: boolean;
  chatType: string;
  pendingImport: boolean;
  pendingChatId?: string | number | null;
  currentChatId?: string | number | null;
  replyToBotId?: string | number | null;
  botId?: string | number | null;
  text: string;
}

/** Decide whether a photo belongs to an active text-roster import workflow. */
export function shouldHandleStudentImportPhoto(context: Omit<StudentImportMessageContext, 'text'>): boolean {
  if (!context.pendingImport) return false;
  if (context.isPrivate) return !context.pendingChatId;
  if (context.chatType !== 'group' && context.chatType !== 'supergroup') return false;
  return String(context.pendingChatId || '') === String(context.currentChatId || '') &&
    String(context.replyToBotId || '') !== '' &&
    String(context.replyToBotId || '') === String(context.botId || '');
}

/** Route an incoming message without performing Telegram, database, or parsing side effects. */
export function classifyStudentImportMessage(
  context: StudentImportMessageContext
): StudentImportMessageRoute {
  const raw = String(context.text || '').trim();

  if (context.chatType === 'group' || context.chatType === 'supergroup') {
    const waiting = context.pendingImport &&
      String(context.pendingChatId || '') === String(context.currentChatId || '');
    const isReplyToBot = String(context.replyToBotId || '') !== '' &&
      String(context.replyToBotId || '') === String(context.botId || '');
    return waiting && isReplyToBot && !raw.startsWith('/') ? 'group-import' : 'next';
  }

  if (!context.isPrivate || !context.pendingImport) return 'next';
  if (!raw) return 'private-empty';
  if (raw.toLowerCase() === '/cancel' || raw.toLowerCase().startsWith('/cancel@')) {
    return 'private-cancel';
  }
  if (raw.startsWith('/')) return 'private-command';
  return 'private-import';
}
