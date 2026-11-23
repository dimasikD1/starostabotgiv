export interface MiniAppTelegramUserSummary {
  id: number | string;
  first_name?: string;
  username?: string;
}

export interface MiniAppUserSummary {
  fullName?: string;
  group?: string;
  role?: unknown;
}

export interface MiniAppGroupSummary {
  scheduleGroup?: string;
  title?: string;
  institutionId?: string | number;
}

export interface MiniAppInstitutionSummary {
  name?: string;
}

export interface MiniAppDataResponseInput {
  telegramUser: MiniAppTelegramUserSummary;
  user: MiniAppUserSummary;
  group: MiniAppGroupSummary;
  isOwner: boolean;
  canManageTelegramChats: boolean;
  institutionAdmin: boolean;
  institution?: MiniAppInstitutionSummary | null;
  date: string;
  data: Record<string, unknown>;
  scheduleError: string;
  scheduleLoading: boolean;
}

/** Builds the legacy GET /api/data payload without changing its public JSON shape. */
export function buildMiniAppDataResponse(input: MiniAppDataResponseInput): Record<string, unknown> {
  const { telegramUser, user, group, data } = input;
  return {
    user: {
      id: telegramUser.id,
      firstName: telegramUser.first_name || '',
      fullName: user.fullName || '',
      username: telegramUser.username || '',
      role: user.role,
      isOwner: input.isOwner,
      canManageTelegramChats: input.canManageTelegramChats,
      institutionAdmin: input.institutionAdmin,
      institutionId: group.institutionId || '',
      institutionName: input.institution?.name || ''
    },
    group: group.scheduleGroup || group.title || user.group || 'Учебная группа',
    date: input.date,
    ...data,
    scheduleError: input.scheduleError,
    scheduleLoading: input.scheduleLoading
  };
}
