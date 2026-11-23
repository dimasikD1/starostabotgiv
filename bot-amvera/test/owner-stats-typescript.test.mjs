import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerStatsMessage } from '../domain/.build/owner-stats.js';

test('formats owner statistics from user, role, group and payment data', () => {
  const now = Date.parse('2026-11-23T12:00:00.000Z');
  const message = buildOwnerStatsMessage({
    '1': {
      role: 'starosta',
      createdAt: '2026-11-20T12:00:00.000Z',
      subscriptionUntil: now + 60_000,
      paymentHistory: [
        { method: 'stars', amount: 30 },
        { method: 'hosting_donation_stars', amount: 50 },
        { method: 'owner_grant' }
      ]
    },
    '2': {
      role: 'student',
      createdAt: '2026-10-01T12:00:00.000Z',
      subscriptionUntil: now - 1
    },
    '3': {
      role: 'zam',
      subscriptionForever: true,
      paymentHistory: [{ method: 'stars', amount: 10 }]
    }
  }, { groupA: {}, groupB: {} }, [], now);

  assert.equal(message,
    '📊 <b>Статистика Староста Бота</b>\n\n' +
    '👥 Всего пользователей: <b>3</b>\n' +
    '🆕 Новых за 30 дней: <b>2</b>\n' +
    '📌 Активных подписок: <b>2</b>\n' +
    '♾ Пожизненных подписок: <b>1</b>\n' +
    '⌛ Истекших подписок: <b>1</b>\n' +
    '🔓 Без подписки: <b>0</b>\n\n' +
    '👑 Старост: <b>1</b>\n' +
    '🎓 Студентов: <b>1</b>\n' +
    '🏫 Прикреплённых групп: <b>2</b>\n\n' +
    '💳 Старые оплаты подписок: <b>2</b> (40 ⭐)\n' +
    '💛 Пожертвований на хостинг: <b>1</b> (50 ⭐)\n' +
    '🎁 Старых ручных выдач: <b>1</b>\n\n' +
    '<i>Подписки отключены. Пожертвования учитываются отдельно по истории Telegram Stars.</i>'
  );
});

test('handles absent or malformed persisted collections without throwing', () => {
  assert.match(buildOwnerStatsMessage(null, null, [], 0), /Всего пользователей: <b>0<\/b>/);
  assert.match(buildOwnerStatsMessage({ user: { paymentHistory: 'invalid' } }, {}, [], 0), /Всего пользователей: <b>1<\/b>/);
});
