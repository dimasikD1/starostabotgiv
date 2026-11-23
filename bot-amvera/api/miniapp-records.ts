export interface MiniAppHomeworkAttachment {
  id?: string;
  type: 'photo' | 'video';
  fileId: string;
  [key: string]: unknown;
}
export interface MiniAppHomeworkRecord {
  id: string;
  subject: string;
  homework: string;
  attachments?: MiniAppHomeworkAttachment[];
  createdAt?: string;
  updatedAt?: string;
  authorId?: string;
  completedBy?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface MiniAppHomeworkGroup<TRecord extends MiniAppHomeworkRecord> {
  homework?: TRecord[];
  pendingHomeworkMedia?: Record<string, Record<string, unknown>>;
}
export interface MiniAppHomeworkCreateInput<TAttachment extends MiniAppHomeworkAttachment> {
  id: string;
  subject: string;
  homework: string;
  attachments: TAttachment[];
  createdAt: string;
  authorId: string;
  requestedAttachmentIds: string[];
}
export interface MiniAppHomeworkUpdateInput<TAttachment extends MiniAppHomeworkAttachment> {
  subject: string;
  homework: string;
  updatedAt: string;
  attachments?: TAttachment[];
}
export type MiniAppHomeworkMutation<TRecord> =
  | { ok: true; record: TRecord }
  | { ok: false; reason: 'not-found' };

export interface MiniAppHomeworkDependencies {
  save(): void;
  afterCreate?(record: MiniAppHomeworkRecord): Promise<void>;
  afterUpdate?(record: MiniAppHomeworkRecord, added: MiniAppHomeworkAttachment[]): Promise<void>;
  onPublishError?(operation: 'create' | 'update', error: unknown): void;
}

/** Stores a new homework record, consumes its pending media IDs, then publishes best-effort. */
export async function createMiniAppHomework<TRecord extends MiniAppHomeworkRecord, TAttachment extends MiniAppHomeworkAttachment>(
  group: MiniAppHomeworkGroup<TRecord>,
  ownerId: string,
  input: MiniAppHomeworkCreateInput<TAttachment>,
  dependencies: MiniAppHomeworkDependencies
): Promise<MiniAppHomeworkMutation<TRecord>> {
  const record = {
    id: input.id,
    subject: input.subject,
    homework: input.homework,
    attachments: input.attachments,
    createdAt: input.createdAt,
    authorId: input.authorId,
    completedBy: {}
  } as TRecord;
  group.homework ||= [];
  group.homework.push(record);
  if (group.homework.length > 100) group.homework = group.homework.slice(-100);
  const pending = group.pendingHomeworkMedia?.[ownerId] || {};
  for (const id of input.requestedAttachmentIds) delete pending[id];
  dependencies.save();
  try {
    await dependencies.afterCreate?.(record);
  } catch (error) {
    dependencies.onPublishError?.('create', error);
  }
  return { ok: true, record };
}

/** Applies a validated homework edit, saves it, then publishes only newly added media. */
export async function updateMiniAppHomeworkRecord<TRecord extends MiniAppHomeworkRecord, TAttachment extends MiniAppHomeworkAttachment>(
  group: MiniAppHomeworkGroup<TRecord>,
  id: string,
  input: MiniAppHomeworkUpdateInput<TAttachment>,
  added: TAttachment[],
  dependencies: MiniAppHomeworkDependencies
): Promise<MiniAppHomeworkMutation<TRecord>> {
  const record = (group.homework || []).find(item => String(item.id || '') === id);
  if (!record) return { ok: false, reason: 'not-found' };
  if (input.attachments) record.attachments = input.attachments;
  Object.assign(record, {
    subject: input.subject,
    homework: input.homework,
    updatedAt: input.updatedAt
  });
  dependencies.save();
  try {
    await dependencies.afterUpdate?.(record, added);
  } catch (error) {
    dependencies.onPublishError?.('update', error);
  }
  return { ok: true, record };
}

/** Deletes exactly one homework record and persists only when it existed. */
export function deleteMiniAppHomeworkRecord<TRecord extends MiniAppHomeworkRecord>(
  group: MiniAppHomeworkGroup<TRecord>,
  id: string,
  save: () => void
): boolean {
  const before = (group.homework || []).length;
  group.homework = (group.homework || []).filter(item => String(item.id || '') !== id);
  if (group.homework.length === before) return false;
  save();
  return true;
}
