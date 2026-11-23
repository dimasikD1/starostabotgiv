import test from 'node:test';
import assert from 'node:assert/strict';
import { sendJsonResponse, sendTextResponse } from '../api/.build/http-response.js';

function responseStub() {
  return {
    status: undefined,
    headers: undefined,
    body: undefined,
    ended: false,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      return this;
    },
    end(body) {
      this.body = body;
      this.ended = true;
      return this;
    }
  };
}

test('sendJsonResponse preserves default security/cache headers and merges overrides', () => {
  const response = responseStub();
  sendJsonResponse(response, 201, { ok: true, count: 2 }, { 'X-Test': 'yes' });
  assert.equal(response.status, 201);
  assert.equal(response.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(response.headers['X-Test'], 'yes');
  assert.equal(response.body, '{"ok":true,"count":2}');
  assert.equal(response.ended, true);
});

test('sendJsonResponse lets explicit headers override defaults', () => {
  const response = responseStub();
  sendJsonResponse(response, 200, null, { 'Cache-Control': 'private' });
  assert.equal(response.headers['Cache-Control'], 'private');
  assert.equal(response.body, 'null');
});

test('sendTextResponse writes UTF-8 bytes and content length for ordinary requests', () => {
  const response = responseStub();
  sendTextResponse({ method: 'GET' }, response, 200, 'Привет', { 'Cache-Control': 'no-store' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'text/plain; charset=utf-8');
  assert.equal(response.headers['Content-Length'], Buffer.byteLength('Привет'));
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(response.body.toString('utf8'), 'Привет');
  assert.equal(response.ended, true);
});

test('sendTextResponse ends HEAD responses without sending a body', () => {
  const response = responseStub();
  sendTextResponse({ method: 'HEAD' }, response, 200, 'body');
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Length'], 4);
  assert.equal(response.body, undefined);
  assert.equal(response.ended, true);
});
