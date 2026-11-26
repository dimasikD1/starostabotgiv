import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStructureCommandParts } from '../domain/.build/structure-command-input.js';

test('parses pipe-delimited structure command arguments', () => {
  assert.deepEqual(parseStructureCommandParts('/addfaculty inst_01 | Факультет ИТ', 'addfaculty'), ['inst_01', 'Факультет ИТ']);
  assert.deepEqual(parseStructureCommandParts('/addcourse@starostagivbot inst_01 | dir_02 | Первый курс', 'addcourse'), ['inst_01', 'dir_02', 'Первый курс']);
});

test('trims parts and returns one empty part when arguments are absent', () => {
  assert.deepEqual(parseStructureCommandParts('/addfaculty   inst_01 |   Факультет  ', 'addfaculty'), ['inst_01', 'Факультет']);
  assert.deepEqual(parseStructureCommandParts('/addfaculty', 'addfaculty'), ['']);
});
