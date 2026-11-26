import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePollCommandInput } from '../domain/poll-command-input-entry.mjs';

test('parses trimmed question and options and keeps at most ten options', () => {
  const result = parsePollCommandInput('  Question? | A | B | C | D | E | F | G | H | I | J | K ');
  assert.deepEqual(result, { ok: true, question: 'Question?', options: ['A','B','C','D','E','F','G','H','I','J'] });
});

test('rejects missing question or fewer than two non-empty options', () => {
  assert.deepEqual(parsePollCommandInput('Question? | A'), { ok: false, error: 'too_few_parts' });
  assert.deepEqual(parsePollCommandInput('Question? | | A | B'), { ok: true, question: 'Question?', options: ['A', 'B'] });
});

test('preserves legacy length limits for question and options', () => {
  assert.deepEqual(parsePollCommandInput('Q'.repeat(301) + ' | A | B'), { ok: false, error: 'question_too_long' });
  assert.deepEqual(parsePollCommandInput('Q | ' + 'A'.repeat(101) + ' | B'), { ok: false, error: 'option_too_long' });
});

test('accepts exact limits and ignores empty separators', () => {
  const result = parsePollCommandInput('Q'.repeat(300) + ' | ' + 'A'.repeat(100) + ' | B');
  assert.equal(result.ok, true);
});
