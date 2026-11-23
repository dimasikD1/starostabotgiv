export interface ChatRegistrationAccessInput {
  chatType?: unknown;
  isOwner: boolean;
  isGroupAdmin: boolean;
}

export function canRegisterTelegramChat(input: ChatRegistrationAccessInput): boolean {
  const isGroupChat = ['group', 'supergroup'].includes(String(input.chatType || ''));
  return isGroupChat && (input.isOwner || input.isGroupAdmin);
}
