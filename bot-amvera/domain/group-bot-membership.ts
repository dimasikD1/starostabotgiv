export type TelegramGroupMemberStatus = 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked' | string;

export interface GroupBotMembershipTransitionInput {
  chatType: string;
  oldStatus?: TelegramGroupMemberStatus | null;
  newStatus?: TelegramGroupMemberStatus | null;
}

export interface GroupBotMembershipTransition {
  shouldHandle: boolean;
  joined: boolean;
  promoted: boolean;
  demoted: boolean;
  shouldRegister: boolean;
  shouldCheckPermissions: boolean;
}

/** Classify meaningful bot membership changes in Telegram groups. */
export function classifyGroupBotMembershipTransition(
  input: GroupBotMembershipTransitionInput
): GroupBotMembershipTransition {
  const oldStatus = input.oldStatus ?? '';
  const newStatus = input.newStatus ?? '';
  const isGroup = input.chatType === 'group' || input.chatType === 'supergroup';
  const joined = isGroup && (oldStatus === 'left' || oldStatus === 'kicked') &&
    (newStatus === 'member' || newStatus === 'administrator');
  const promoted = isGroup && newStatus === 'administrator' && oldStatus !== 'administrator';
  const demoted = isGroup && oldStatus === 'administrator' && newStatus === 'member';
  const shouldHandle = joined || promoted || demoted;
  const shouldRegister = shouldHandle;
  return {
    shouldHandle, joined, promoted, demoted, shouldRegister,
    shouldCheckPermissions: shouldRegister && newStatus === 'administrator'
  };
}
