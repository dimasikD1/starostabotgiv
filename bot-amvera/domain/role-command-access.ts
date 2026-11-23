export type GroupRoleCommand = 'starosta' | 'zam' | 'setstarosta' | 'setstudent';

export function isRoleCommandGroupChat(chatType: unknown): boolean {
  return chatType === 'group' || chatType === 'supergroup';
}

/** Preserve each command's existing owner/admin authorization rules. */
export function canRunGroupRoleCommand(
  command: GroupRoleCommand,
  chatType: unknown,
  isPlatformOwner: boolean,
  isTelegramGroupAdmin: boolean
): boolean {
  if (!isRoleCommandGroupChat(chatType)) return false;
  if (command === 'starosta' || command === 'zam') {
    return isPlatformOwner || isTelegramGroupAdmin;
  }
  return isTelegramGroupAdmin;
}
