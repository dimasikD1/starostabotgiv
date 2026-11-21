import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJsonStore } from '../../.test-build/domain/json-store.js';

function temporaryDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'starosta-json-store-'));
}

test('creates an empty legacy-compatible database when users.json is absent', () => {
  const dir = temporaryDirectory();
  try {
    const store = createJsonStore({ dataDir: dir });
    assert.deepEqual(store.db, { users: {}, groups: {} });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loads and preserves existing data and additional root properties', () => {
  const dir = temporaryDirectory();
  try {
    const initial = {
      users: { '100': { name: 'Тест', role: 'starosta' } },
      groups: { group1: { title: 'Группа' } },
      institutions: { inst1: { title: 'Институт' } },
      settings: { timeZone: 'Europe/Moscow' }
    };
    fs.writeFileSync(path.join(dir, 'users.json'), JSON.stringify(initial));
    const store = createJsonStore({ dataDir: dir });
    assert.deepEqual(store.db, initial);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('saves atomically and keeps the previous file as a backup', () => {
  const dir = temporaryDirectory();
  try {
    const store = createJsonStore({ dataDir: dir, backupIntervalMs: 0 });
    store.db.users['100'] = { name: 'Первое состояние' };
    store.saveDb();
    store.db.users['100'] = { name: 'Второе состояние' };
    store.saveDb();

    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8'));
    const backup = JSON.parse(fs.readFileSync(path.join(dir, 'users.json.bak'), 'utf8'));
    assert.equal(saved.users['100'].name, 'Второе состояние');
    assert.equal(backup.users['100'].name, 'Первое состояние');
    assert.equal(fs.readdirSync(dir).some(name => name.endsWith('.tmp')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses to start on malformed JSON instead of replacing it with an empty database', () => {
  const dir = temporaryDirectory();
  try {
    const file = path.join(dir, 'users.json');
    fs.writeFileSync(file, '{broken');
    assert.throws(() => createJsonStore({ dataDir: dir }), SyntaxError);
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('stops for manual recovery when the main file is missing but backup exists', () => {
  const dir = temporaryDirectory();
  try {
    fs.writeFileSync(path.join(dir, 'users.json.bak'), JSON.stringify({ users: {}, groups: {} }));
    assert.throws(() => createJsonStore({ dataDir: dir }), /ручного восстановления/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
