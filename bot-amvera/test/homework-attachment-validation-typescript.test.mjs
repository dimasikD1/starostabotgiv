import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateNewHomeworkAttachments,
  validateUpdatedHomeworkAttachments
} from '../../.test-build/api/homework-attachment-validation.js';

const photo = {
  fileId: 'file-1', type: 'photo', fileName: 'photo.jpg', mimeType: 'image/jpeg'
};
const video = {
  fileId: 'file-2', type: 'video', fileName: 'clip.mp4', mimeType: 'video/mp4'
};

test('resolves temporary upload IDs for new homework and enforces the ten-file limit', () => {
  const pending = { a: photo, b: video };
  assert.deepEqual(validateNewHomeworkAttachments([{ id: 'a' }, { id: 'b' }], pending), {
    ok: true, attachments: [photo, video]
  });
  assert.deepEqual(validateNewHomeworkAttachments([{ id: 'missing' }], pending), {
    ok: false, reason: 'stale'
  });
  assert.deepEqual(validateNewHomeworkAttachments(Array(11).fill({ id: 'a' }), pending), {
    ok: false, reason: 'limit'
  });
  assert.deepEqual(validateNewHomeworkAttachments(null, pending), {
    ok: true, attachments: []
  });
});

test('preserves old attachments and resolves new ones while editing homework', () => {
  const pending = { b: video };
  const result = validateUpdatedHomeworkAttachments([
    { index: 0 }, { id: 'b' }
  ], pending, [photo]);
  assert.deepEqual(result, {
    ok: true,
    attachments: [photo, video],
    added: [video],
    consumedIds: ['b']
  });
  assert.equal('b' in pending, false);
});

test('returns the same validation categories for invalid edit entries', () => {
  const pending = { b: video };
  assert.deepEqual(validateUpdatedHomeworkAttachments(
    Array(11).fill({ index: 0 }), pending, [photo]
  ), { ok: false, reason: 'limit', consumedIds: [] });
  assert.deepEqual(validateUpdatedHomeworkAttachments(
    [{ index: 2 }], pending, [photo]
  ), { ok: false, reason: 'old', consumedIds: [] });
  assert.deepEqual(validateUpdatedHomeworkAttachments(
    [{ id: 'missing' }], pending, [photo]
  ), { ok: false, reason: 'stale', consumedIds: [] });
  assert.deepEqual(validateUpdatedHomeworkAttachments(
    [{}], pending, [photo]
  ), { ok: false, reason: 'invalid', consumedIds: [] });
  assert.deepEqual(validateUpdatedHomeworkAttachments(null, pending, [photo]), {
    ok: true, attachments: [], added: [], consumedIds: []
  });
});

test('retains legacy sequential consumption when a later edit entry is invalid', () => {
  const pending = { b: video };
  const result = validateUpdatedHomeworkAttachments(
    [{ id: 'b' }, {}], pending, [photo]
  );
  assert.deepEqual(result, {
    ok: false, reason: 'invalid', consumedIds: ['b']
  });
  assert.equal('b' in pending, false);
});
