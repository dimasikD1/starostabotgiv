export interface PrivateChatContext {
  chat?: {
    type?: string;
  } | null;
}

export function isPrivateChat(context: PrivateChatContext): boolean {
  return context.chat?.type === 'private';
}
