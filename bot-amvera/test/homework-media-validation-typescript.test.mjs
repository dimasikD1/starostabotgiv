import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHomeworkMediaUpload } from '../../.test-build/api/homework-media-validation.js';

test('accepts supported image and video MIME types and normalizes metadata', () => {
  const image = validateHomeworkMediaUpload({
    fileName: '  photo.JPG  ',
    mimeType: 'IMAGE/JPEG',
    data: 'data:image/jpeg;base64,aGVsbG8='
  });
  assert.equal(image.ok, true);
  assert.equal(image.type, 'photo');
  assert.equal(image.fileName, '  photo.JPG  ');
  assert.equal(image.mimeType, 'image/jpeg');
  assert.equal(image.buffer?.toString('utf8'), 'hello');

  const video = validateHomeworkMediaUpload({
    fileName: 'clip.mp4',
    mimeType: 'video/mp4',
    data: 'aGVsbG8='
  });
  assert.equal(video.ok, true);
  assert.equal(video.type, 'video');
});

test('rejects unsupported MIME types before decoding the file', () => {
  assert.deepEqual(validateHomeworkMediaUpload({
    fileName: 'x.gif', mimeType: 'image/gif', data: 'aGVsbG8='
  }), { ok: false, reason: 'type' });
});

test('preserves filename fallback and 120-character truncation', () => {
  const fallback = validateHomeworkMediaUpload({ mimeType: 'image/png', data: 'YQ==' });
  assert.equal(fallback.fileName, 'attachment');
  const longName = validateHomeworkMediaUpload({
    fileName: 'x'.repeat(130), mimeType: 'image/png', data: 'YQ=='
  });
  assert.equal(longName.fileName?.length, 120);
});

test('rejects empty or oversized encoded and decoded data', () => {
  assert.deepEqual(validateHomeworkMediaUpload({
    mimeType: 'image/png', data: ''
  }), { ok: false, reason: 'size' });
  assert.deepEqual(validateHomeworkMediaUpload({
    mimeType: 'image/png', data: 'a'.repeat(11 * 1024 * 1024 + 1)
  }), { ok: false, reason: 'size' });
  const tooLargeDecoded = Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64');
  assert.deepEqual(validateHomeworkMediaUpload({
    mimeType: 'video/mp4', data: tooLargeDecoded
  }), { ok: false, reason: 'size' });
});
