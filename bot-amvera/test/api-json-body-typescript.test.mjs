import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readJsonBody } from '../../.test-build/api/json-body.js';

async function* chunks(...values) {
  for (const value of values) yield Buffer.from(value);
}

test('reads JSON split across multiple request chunks', async () => {
  const result = await readJsonBody(chunks('{"full', 'Name":"Антон"}'));
  assert.deepEqual(result, { fullName: 'Антон' });
});

test('returns an empty object for an empty request body', async () => {
  assert.deepEqual(await readJsonBody(chunks()), {});
});

test('rejects request bodies exceeding the configured byte limit', async () => {
  await assert.rejects(
    readJsonBody(chunks('{"text":"12345"}'), 8),
    { message: 'Слишком большой запрос.' }
  );
});

test('preserves JSON parse errors for malformed request bodies', async () => {
  await assert.rejects(readJsonBody(chunks('{invalid')));
});
