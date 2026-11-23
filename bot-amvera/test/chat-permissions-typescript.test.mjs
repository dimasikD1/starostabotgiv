import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenChatPermissions, buildVerifiedMemberChatPermissions } from '../../.test-build/domain/chat-permissions.js';

test('open-chat policy enables the same ten participant permissions', () => {
  assert.deepEqual(buildOpenChatPermissions(), {
    can_send_messages: true,
    can_send_audios: true,
    can_send_documents: true,
    can_send_photos: true,
    can_send_videos: true,
    can_send_video_notes: true,
    can_send_voice_notes: true,
    can_send_polls: true,
    can_send_other_messages: true,
    can_add_web_page_previews: true
  });
});

test('verification completion restores the existing member permissions', () => {
  assert.deepEqual(buildVerifiedMemberChatPermissions(), {
    can_send_messages: true,
    can_send_audios: true,
    can_send_documents: true,
    can_send_photos: true,
    can_send_videos: true,
    can_send_video_notes: true,
    can_send_voice_notes: true,
    can_send_polls: true,
    can_send_other_messages: true,
    can_add_web_page_previews: true,
    can_change_info: true,
    can_invite_users: true,
    can_pin_messages: true,
    can_manage_topics: true
  });
});
