import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHelpMessage } from '../domain/.build/help-message.js';

test('help message describes student features for regular members', () => {
  const message = buildHelpMessage(false);
  assert.match(message, /Расписание/);
  assert.match(message, /Моя группа/);
  assert.match(message, /Домашние задания/);
  assert.match(message, /Mini App/);
  assert.doesNotMatch(message, /Возможности старосты/);
});

test('help message includes management features for attendance managers', () => {
  const message = buildHelpMessage(true);
  assert.match(message, /Возможности старосты/);
  assert.match(message, /список студентов и управление им/);
  assert.match(message, /посещаемость по отдельным парам и отчёты/);
  assert.match(message, /объявления и важная информация в Mini App/);
});
