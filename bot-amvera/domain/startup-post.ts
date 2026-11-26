export interface StartupPostDependencies {
  channelId: string | number;
  ownerId: string | number;
  message: string;
  send(channelId: string | number, message: string, options: {
    parse_mode: 'HTML';
    reply_markup: { inline_keyboard: Array<Array<{ text: string; url: string }>> };
  }): Promise<void>;
  logInfo(message: string): void;
  logError(message: string, error: unknown): void;
}

export type StartupPostResult = { ok: true } | { ok: false };

export async function publishStartupPost(deps: StartupPostDependencies): Promise<StartupPostResult> {
  try {
    await deps.send(deps.channelId, deps.message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '💻 Репозиторий на GitHub', url: 'https://github.com/dimasikD1/starostabotgiv' },
          { text: '🤖 Открыть бота', url: 'https://t.me/starostagivbot' }
        ]]
      }
    });
    deps.logInfo('[publishstartup] История проекта опубликована в ' + deps.channelId + ' владельцем ' + deps.ownerId);
    return { ok: true };
  } catch (error) {
    deps.logError('[publishstartup] Не удалось опубликовать пост:', error);
    return { ok: false };
  }
}
