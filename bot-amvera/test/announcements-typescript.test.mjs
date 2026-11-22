import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAnnouncementText,
  createAnnouncementRecord,
  appendAnnouncement,
  formatAnnouncementMessage
} from '../domain/.build/announcements.js';

const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

test('normalizes announcement text and rejects empty or oversized content', () => {
  assert.deepEqual(normalizeAnnouncementText('  Важная новость  '), { ok: true, text: 'Важная новость' });
  assert.deepEqual(normalizeAnnouncementText('  '), { ok: false, reason: 'empty' });
  assert.deepEqual(normalizeAnnouncementText('12345', 4), { ok: false, reason: 'too_long' });
});

test('creates compatible announcement records with string identifiers', () => {
  assert.deepEqual(createAnnouncementRecord({
    id: 'abc', text: 'Текст', authorId: 123, authorName: 'Староста', createdAt: '2026-11-22T10:00:00.000Z'
  }), {
    id: 'abc', text: 'Текст', authorId: '123', authorName: 'Староста', createdAt: '2026-11-22T10:00:00.000Z'
  });
});

test('keeps only the newest 100 announcements by default', () => {
  const result = appendAnnouncement(Array.from({ length: 100 }, (_, i) => i), 100);
  assert.equal(result.length, 100);
  assert.equal(result[0], 1);
  assert.equal(result.at(-1), 100);
  assert.deepEqual(appendAnnouncement(undefined, 'first'), ['first']);
});

test('formats both existing Telegram announcement headings and escapes content', () => {
  assert.equal(formatAnnouncementMessage('<Новость & текст>', 'Объявление', escapeHtml), '📢 <b>Объявление</b>\n\n&lt;Новость &amp; текст&gt;');
  assert.equal(formatAnnouncementMessage('Текст', 'Объявление группы', escapeHtml), '📢 <b>Объявление группы</b>\n\nТекст');
});
