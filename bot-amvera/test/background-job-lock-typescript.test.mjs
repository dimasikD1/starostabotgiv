import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsyncJobLock } from '../domain/.build/background-job-lock.js';

test('allows one background execution at a time', () => {
  const lock = createAsyncJobLock();
  assert.equal(lock.locked, false);
  assert.equal(lock.tryAcquire(), true);
  assert.equal(lock.locked, true);
  assert.equal(lock.tryAcquire(), false);
  lock.release();
  assert.equal(lock.locked, false);
  assert.equal(lock.tryAcquire(), true);
});

test('release is safe after a failed job and permits a later run', () => {
  const lock = createAsyncJobLock();
  assert.equal(lock.tryAcquire(), true);
  try {
    throw new Error('simulated job failure');
  } catch (error) {
    assert.equal(error.message, 'simulated job failure');
  } finally {
    lock.release();
  }
  assert.equal(lock.tryAcquire(), true);
  lock.release();
});

test('independent background jobs do not block one another', () => {
  const attendance = createAsyncJobLock();
  const weekly = createAsyncJobLock();
  assert.equal(attendance.tryAcquire(), true);
  assert.equal(weekly.tryAcquire(), true);
  assert.equal(attendance.locked, true);
  assert.equal(weekly.locked, true);
  attendance.release();
  assert.equal(weekly.locked, true);
  weekly.release();
});
