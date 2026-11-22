export type HtmlEscaper = (value: string) => string;

export function shouldNotifyRelease(
  ownerIds: Array<string | number>,
  lastNotifiedRelease: unknown,
  releaseVersion: string
): boolean {
  return ownerIds.length > 0 && String(lastNotifiedRelease || '') !== String(releaseVersion);
}

export function buildReleaseMessage(
  version: string,
  notes: readonly string[],
  escapeHtml: HtmlEscaper
): string {
  return (
    '🚀 <b>Староста Бот обновлён</b>\n' +
    'Версия: <b>' + escapeHtml(version) + '</b>\n\n' +
    '<b>Что нового:</b>\n' +
    notes.map(item => '• ' + escapeHtml(item)).join('\n')
  );
}

export function buildRestartMessage(): string {
  return '🔄 <b>Староста Бот перезапущен</b>\nБот снова работает и готов принимать команды.';
}
