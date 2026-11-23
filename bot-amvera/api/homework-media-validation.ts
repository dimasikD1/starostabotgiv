import { Buffer } from 'node:buffer';

export interface HomeworkMediaUploadValidation {
  ok: boolean;
  reason?: 'type' | 'size';
  fileName?: string;
  mimeType?: string;
  type?: 'photo' | 'video';
  buffer?: Buffer;
}

/** Preserve the Mini App upload allowlist and the existing 8 MiB decoded-file limit. */
export function validateHomeworkMediaUpload(input: unknown): HomeworkMediaUploadValidation {
  const body = input && typeof input === 'object'
    ? input as Record<string, unknown>
    : {};
  const fileName = String(body.fileName || 'attachment').slice(0, 120);
  const mimeType = String(body.mimeType || '').toLowerCase();
  const type = mimeType === 'image/jpeg' || mimeType === 'image/png'
    ? 'photo'
    : mimeType === 'video/mp4'
      ? 'video'
      : undefined;

  if (!type) return { ok: false, reason: 'type' };

  const encoded = String(body.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!encoded || encoded.length > 11 * 1024 * 1024) {
    return { ok: false, reason: 'size' };
  }

  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
    return { ok: false, reason: 'size' };
  }

  return { ok: true, fileName, mimeType, type, buffer };
}
