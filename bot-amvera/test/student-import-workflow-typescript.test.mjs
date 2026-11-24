import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStudentImportMessage,
  shouldHandleStudentImportPhoto
} from '../domain/.build/student-import-workflow.js';

const base = {
  isPrivate: true,
  chatType: 'private',
  pendingImport: true,
  text: 'Иванов Иван'
};

test('routes private roster text, empty input, cancellation and commands', () => {
  assert.equal(classifyStudentImportMessage(base), 'private-import');
  assert.equal(classifyStudentImportMessage({ ...base, text: '   ' }), 'private-empty');
  assert.equal(classifyStudentImportMessage({ ...base, text: '/cancel' }), 'private-cancel');
  assert.equal(classifyStudentImportMessage({ ...base, text: '/cancel@starostagivbot' }), 'private-cancel');
  assert.equal(classifyStudentImportMessage({ ...base, text: '/help' }), 'private-command');
});

test('routes group roster text only when it replies to the bot in the originating chat', () => {
  const group = {
    isPrivate: false, chatType: 'supergroup', pendingImport: true,
    pendingChatId: '-100', currentChatId: '-100',
    replyToBotId: '99', botId: '99', text: 'Иванов Иван'
  };
  assert.equal(classifyStudentImportMessage(group), 'group-import');
  assert.equal(classifyStudentImportMessage({ ...group, currentChatId: '-200' }), 'next');
  assert.equal(classifyStudentImportMessage({ ...group, replyToBotId: '42' }), 'next');
  assert.equal(classifyStudentImportMessage({ ...group, text: '/cancel' }), 'next');
  assert.equal(classifyStudentImportMessage({ ...group, pendingImport: false }), 'next');
});

test('does not route unrelated non-private messages into the import workflow', () => {
  assert.equal(classifyStudentImportMessage({
    isPrivate: false, chatType: 'channel', pendingImport: true, text: 'Names'
  }), 'next');
  assert.equal(classifyStudentImportMessage({ ...base, pendingImport: false }), 'next');
});

test('recognizes only photos attached to the active private or originating group import', () => {
  assert.equal(shouldHandleStudentImportPhoto(base), true);
  assert.equal(shouldHandleStudentImportPhoto({ ...base, pendingChatId: '-100' }), false);
  const group = {
    isPrivate: false, chatType: 'group', pendingImport: true,
    pendingChatId: '-100', currentChatId: '-100', replyToBotId: '99', botId: '99'
  };
  assert.equal(shouldHandleStudentImportPhoto(group), true);
  assert.equal(shouldHandleStudentImportPhoto({ ...group, currentChatId: '-200' }), false);
  assert.equal(shouldHandleStudentImportPhoto({ ...group, replyToBotId: '7' }), false);
  assert.equal(shouldHandleStudentImportPhoto({ ...group, pendingImport: false }), false);
});
