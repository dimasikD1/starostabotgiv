export interface TelegramBotPermissions {
  can_delete_messages?: boolean;
  can_restrict_members?: boolean;
  can_pin_messages?: boolean;
}

const REQUIRED_PERMISSIONS = [
  ['can_delete_messages', 'удаление сообщений'],
  ['can_restrict_members', 'ограничение участников'],
  ['can_pin_messages', 'закрепление сообщений']
] as const;

/** Returns the human-readable list of required bot permissions that are missing. */
export function getMissingTelegramBotPermissions(
  permissions: TelegramBotPermissions | null | undefined
): string[] {
  return REQUIRED_PERMISSIONS
    .filter(([key]) => permissions?.[key] !== true)
    .map(([, label]) => label);
}
