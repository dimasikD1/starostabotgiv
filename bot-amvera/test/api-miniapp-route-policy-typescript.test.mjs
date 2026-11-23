import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMiniAppManagerWriteRoute,
  isMiniAppGroupScopedRoute
} from '../api/.build/miniapp-route-policy.js';

test('recognizes every legacy manager write endpoint and method', () => {
  const routes = [
    ['DELETE', '/api/students'],
    ['POST', '/api/announcements'],
    ['POST', '/api/homework-media-upload'],
    ['POST', '/api/homework'],
    ['PUT', '/api/homework'],
    ['DELETE', '/api/homework'],
    ['POST', '/api/attendance']
  ];
  for (const [method, path] of routes) assert.equal(isMiniAppManagerWriteRoute(method, path), true);
});

test('does not classify reads, unknown routes, or a wrong method as manager writes', () => {
  assert.equal(isMiniAppManagerWriteRoute('GET', '/api/homework'), false);
  assert.equal(isMiniAppManagerWriteRoute('POST', '/api/students'), false);
  assert.equal(isMiniAppManagerWriteRoute('POST', '/api/unknown'), false);
  assert.equal(isMiniAppManagerWriteRoute('post', '/api/homework'), true);
});

test('keeps only the two legacy top-level routes outside selected-group scope', () => {
  assert.equal(isMiniAppGroupScopedRoute('/api/groups'), false);
  assert.equal(isMiniAppGroupScopedRoute('/api/telegram-chats'), false);
  assert.equal(isMiniAppGroupScopedRoute('/api/data'), true);
  assert.equal(isMiniAppGroupScopedRoute('/api/profile'), true);
  assert.equal(isMiniAppGroupScopedRoute('/api/unknown'), true);
});
