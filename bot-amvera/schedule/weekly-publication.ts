export interface WeeklyPublicationGroup {
  chatId: string | number;
  title?: string | null;
}

export interface WeeklyPublicationBuild {
  text: string;
}

export interface WeeklyPublicationResult {
  sent: number;
  pinned: number;
  details: string[];
  error?: 'no-targets' | 'build-failed';
}

export interface WeeklyPublicationDependencies {
  groups: readonly WeeklyPublicationGroup[];
  range: { start: string; end: string };
  buildText(): Promise<WeeklyPublicationBuild>;
  sendMessage(chatId: string | number, text: string): Promise<{ messageId: number }>;
  pinMessage(chatId: string | number, messageId: number): Promise<void>;
  logError(label: string, error: unknown): void;
  logInfo?(...values: unknown[]): void;
}

/** Publishes one already-built weekly schedule to all attached chats and attempts to pin each sent message. */
export async function publishWeeklySchedule(
  deps: WeeklyPublicationDependencies
): Promise<WeeklyPublicationResult> {
  const targets = deps.groups.filter(group => group.chatId !== '' && group.chatId !== null && group.chatId !== undefined);
  if (!targets.length) return { sent: 0, pinned: 0, details: [], error: 'no-targets' };

  let built: WeeklyPublicationBuild;
  try {
    built = await deps.buildText();
  } catch (error) {
    deps.logError('[publishweek] schedule build failed:', error);
    return { sent: 0, pinned: 0, details: [], error: 'build-failed' };
  }

  const safeMessage = built.text.length > 3900
    ? built.text.slice(0, 3850) + '\n\n… расписание сокращено.'
    : built.text;
  let sent = 0;
  let pinned = 0;
  const details: string[] = [];

  for (const group of targets) {
    const title = String(group.title || group.chatId);
    try {
      const message = await deps.sendMessage(group.chatId, safeMessage);
      sent++;
      try {
        await deps.pinMessage(group.chatId, message.messageId);
        pinned++;
        details.push('✅ ' + title + ' — отправлено и закреплено');
      } catch (error) {
        deps.logError('[publishweek] pin failed for ' + title + ':', error);
        details.push('⚠️ ' + title + ' — отправлено, но не удалось закрепить (проверь права бота)');
      }
    } catch (error) {
      deps.logError('[publishweek] failed for ' + title + ':', error);
      details.push('❌ ' + title + ' — ошибка отправки');
    }
  }

  deps.logInfo?.('[publishweek] completed', { sent, pinned, targets: targets.length });
  return { sent, pinned, details };
}
