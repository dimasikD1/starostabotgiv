import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMiniAppHomework,
  updateMiniAppHomeworkRecord,
  deleteMiniAppHomeworkRecord
} from '../../.test-build/api/miniapp-records.js';

test('creates record, trims history to 100, consumes pending media and saves before publishing', async () => {
  const group = {
    homework: Array.from({ length: 100 }, (_, i) => ({ id: String(i), subject: 'S', homework: 'H' })),
    pendingHomeworkMedia: { '42': { media1: true, media2: true } }
  };
  const events = [];
  const result = await createMiniAppHomework(group, '42', {
    id: 'new', subject: 'Math', homework: 'Read', attachments: [],
    createdAt: '2026-11-23T00:00:00.000Z', authorId: '42',
    requestedAttachmentIds: ['media1']
  }, {
    save: () => events.push('save'),
    afterCreate: async () => events.push('publish')
  });
  assert.equal(result.ok, true);
  assert.equal(group.homework.length, 100);
  assert.equal(group.homework.at(-1).id, 'new');
  assert.deepEqual(group.pendingHomeworkMedia['42'], { media2: true });
  assert.deepEqual(events, ['save', 'publish']);
});

test('does not fail creation when best-effort Telegram publication fails', async () => {
  let logged;
  const result = await createMiniAppHomework({}, '7', {
    id: 'a', subject: 'S', homework: 'H', attachments: [],
    createdAt: 'now', authorId: '7', requestedAttachmentIds: []
  }, {
    save: () => {},
    afterCreate: async () => { throw new Error('telegram down'); },
    onPublishError: (operation, error) => { logged = [operation, error.message]; }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(logged, ['create', 'telegram down']);
});

test('updates only a matching record, preserves attachments when omitted, and saves before notification', async () => {
  const original = { id: 'a', subject: 'Old', homework: 'Old text', attachments: [{ fileId: 'old', type: 'photo' }] };
  const group = { homework: [original] };
  const events = [];
  const result = await updateMiniAppHomeworkRecord(group, 'a', {
    subject: 'New', homework: 'New text', updatedAt: 'now'
  }, [], {
    save: () => events.push('save'),
    afterUpdate: async () => events.push('notify')
  });
  assert.equal(result.ok, true);
  assert.equal(original.subject, 'New');
  assert.equal(original.attachments[0].fileId, 'old');
  assert.deepEqual(events, ['save', 'notify']);
});

test('returns not-found for an unknown update and deletion does not save absent records', async () => {
  let saves = 0;
  const group = { homework: [{ id: 'known', subject: 'S', homework: 'H' }] };
  assert.deepEqual(await updateMiniAppHomeworkRecord(group, 'missing', {
    subject: 'S', homework: 'H', updatedAt: 'now'
  }, [], { save: () => saves++ }), { ok: false, reason: 'not-found' });
  assert.equal(deleteMiniAppHomeworkRecord(group, 'missing', () => saves++), false);
  assert.equal(saves, 0);
  assert.equal(deleteMiniAppHomeworkRecord(group, 'known', () => saves++), true);
  assert.equal(saves, 1);
});
