import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStructureInstitutionId } from '../domain/.build/structure-command-input.js';

test('extracts institution ID from /structure command', () => {
  assert.equal(parseStructureInstitutionId('/structure inst_001'), 'inst_001');
  assert.equal(parseStructureInstitutionId('/structure@starostagivbot inst_002'), 'inst_002');
});

test('trims whitespace after the command and returns empty string when no ID is supplied', () => {
  assert.equal(parseStructureInstitutionId('/structure   inst_003  '), 'inst_003');
  assert.equal(parseStructureInstitutionId('/structure'), '');
});
