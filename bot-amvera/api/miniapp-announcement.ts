export interface MiniAppAnnouncementGroup<TAnnouncement> {
  chatId?: string | number;
  announcements?: TAnnouncement[];
}

export type MiniAppAnnouncementTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'empty' | 'too_long' };

export type MiniAppAnnouncementResult<TAnnouncement> =
  | { ok: false; reason: 'empty' | 'too_long' | 'no-chat' }
  | { ok: true; announcement: TAnnouncement };

export interface MiniAppAnnouncementDependencies<TAnnouncement> {
  normalizeText(value: unknown): MiniAppAnnouncementTextResult;
  sendMessage(chatId: string | number, text: string): Promise<unknown>;
  formatMessage(text: string): string;
  createRecord(text: string, authorId: number | string, authorName: string): TAnnouncement;
  append(items: TAnnouncement[], item: TAnnouncement): TAnnouncement[];
  save(): void;
}

/** Publishes and persists a group announcement using the legacy side-effect order. */
export async function publishMiniAppAnnouncement<TAnnouncement>(
  group: MiniAppAnnouncementGroup<TAnnouncement>,
  rawText: unknown,
  author: { id: number | string; firstName?: string },
  dependencies: MiniAppAnnouncementDependencies<TAnnouncement>
): Promise<MiniAppAnnouncementResult<TAnnouncement>> {
  const validation = dependencies.normalizeText(rawText);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  if (!group.chatId) return { ok: false, reason: 'no-chat' };

  await dependencies.sendMessage(
    group.chatId,
    dependencies.formatMessage(validation.text)
  );
  const announcement = dependencies.createRecord(
    validation.text,
    author.id,
    String(author.firstName || 'Староста')
  );
  group.announcements ||= [];
  group.announcements = dependencies.append(group.announcements, announcement);
  dependencies.save();
  return { ok: true, announcement };
}
