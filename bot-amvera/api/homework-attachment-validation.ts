export interface HomeworkAttachmentRecord {
  fileId: string;
  type: 'photo' | 'video';
  fileName: string;
  mimeType: string;
}

export interface HomeworkAttachmentListValidation<T = HomeworkAttachmentRecord> {
  ok: boolean;
  reason?: 'limit' | 'stale' | 'old' | 'invalid';
  attachments?: T[];
  added?: T[];
  consumedIds?: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

function toSavedAttachment(value: unknown): HomeworkAttachmentRecord {
  return value as HomeworkAttachmentRecord;
}

/** Resolve newly uploaded temporary IDs for homework creation. */
export function validateNewHomeworkAttachments(
  requestedInput: unknown,
  pendingInput: unknown
): HomeworkAttachmentListValidation {
  const requested = Array.isArray(requestedInput) ? requestedInput : [];
  if (requested.length > 10) return { ok: false, reason: 'limit' };
  const pending = asRecord(pendingInput) || {};
  const attachments: HomeworkAttachmentRecord[] = [];

  for (const entryInput of requested) {
    const entry = asRecord(entryInput);
    const media = pending[String(entry?.id || '')];
    if (!media) return { ok: false, reason: 'stale' };
    attachments.push(toSavedAttachment(media));
  }

  return { ok: true, attachments };
}

/** Resolve retained old attachments and newly uploaded IDs during homework edits. */
export function validateUpdatedHomeworkAttachments(
  requestedInput: unknown,
  pendingInput: unknown,
  existingInput: unknown
): HomeworkAttachmentListValidation {
  if (!Array.isArray(requestedInput)) return { ok: true, attachments: [], added: [], consumedIds: [] };
  if (requestedInput.length > 10) return { ok: false, reason: 'limit', consumedIds: [] };

  const pending = asRecord(pendingInput) || {};
  const existing = Array.isArray(existingInput) ? existingInput : [];
  const attachments: HomeworkAttachmentRecord[] = [];
  const added: HomeworkAttachmentRecord[] = [];
  const consumedIds: string[] = [];

  for (const entryInput of requestedInput) {
    const entry = asRecord(entryInput);
    if (entry && Number.isInteger(entry.index)) {
      const old = existing[entry.index as number];
      if (!old) return { ok: false, reason: 'old', consumedIds };
      attachments.push(old as HomeworkAttachmentRecord);
    } else if (entry?.id) {
      const id = String(entry.id);
      const media = pending[id];
      if (!media) return { ok: false, reason: 'stale', consumedIds };
      const saved = toSavedAttachment(media);
      attachments.push(saved);
      added.push(saved);
      delete pending[id];
      consumedIds.push(id);
    } else {
      return { ok: false, reason: 'invalid', consumedIds };
    }
  }

  return { ok: true, attachments, added, consumedIds };
}
