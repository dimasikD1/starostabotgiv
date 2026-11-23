type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function subscriptionUntil(user: UnknownRecord): number {
  return Number(user.subscriptionUntil || 0);
}

/** Build the existing owner-only /stats Telegram message from persisted data. */
export function buildOwnerStatsMessage(
  usersValue: unknown,
  groupsValue: unknown,
  ownerIds: readonly string[] = [],
  now = Date.now()
): string {
  const users = asRecord(usersValue);
  const groups = asRecord(groupsValue);
  const entries = Object.entries(users);
  const nonOwners = entries.filter(([id]) => !ownerIds.includes(id));
  const active = nonOwners.filter(([id, value]) => {
    const user = asRecord(value);
    return Boolean(user.subscriptionForever) || subscriptionUntil(user) > now;
  }).length;
  const lifetime = nonOwners.filter(([id, value]) => {
    const user = asRecord(value);
    return Boolean(user.subscriptionForever);
  }).length;
  const expired = nonOwners.filter(([id, value]) => {
    const user = asRecord(value);
    return !user.subscriptionForever &&
      subscriptionUntil(user) > 0 && subscriptionUntil(user) <= now;
  }).length;
  const noSubscription = nonOwners.filter(([id, value]) => {
    const user = asRecord(value);
    return !user.subscriptionForever && subscriptionUntil(user) <= 0;
  }).length;
  const starostas = entries.filter(([, value]) => asRecord(value).role === 'starosta').length;
  const students = entries.filter(([, value]) => (asRecord(value).role || 'student') === 'student').length;
  const newUsers30d = entries.filter(([, value]) => {
    const createdAt = asRecord(value).createdAt;
    return Boolean(createdAt) && now - Date.parse(String(createdAt)) <= 30 * 24 * 60 * 60 * 1000;
  }).length;

  const history = entries.flatMap(([, value]) => {
    const paymentHistory = asRecord(value).paymentHistory;
    return Array.isArray(paymentHistory) ? paymentHistory.filter(isRecord) : [];
  });
  const starsPayments = history.filter(payment => payment.method === 'stars');
  const donations = history.filter(payment => payment.method === 'hosting_donation_stars');
  const manualGrants = history.filter(payment => payment.method === 'owner_grant').length;
  const starsTotal = starsPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const donationTotal = donations.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  return (
    '📊 <b>Статистика Староста Бота</b>\n\n' +
    '👥 Всего пользователей: <b>' + entries.length + '</b>\n' +
    '🆕 Новых за 30 дней: <b>' + newUsers30d + '</b>\n' +
    '📌 Активных подписок: <b>' + active + '</b>\n' +
    '♾ Пожизненных подписок: <b>' + lifetime + '</b>\n' +
    '⌛ Истекших подписок: <b>' + expired + '</b>\n' +
    '🔓 Без подписки: <b>' + noSubscription + '</b>\n\n' +
    '👑 Старост: <b>' + starostas + '</b>\n' +
    '🎓 Студентов: <b>' + students + '</b>\n' +
    '🏫 Прикреплённых групп: <b>' + Object.keys(groups).length + '</b>\n\n' +
    '💳 Старые оплаты подписок: <b>' + starsPayments.length + '</b> (' + starsTotal + ' ⭐)\n' +
    '💛 Пожертвований на хостинг: <b>' + donations.length + '</b> (' + donationTotal + ' ⭐)\n' +
    '🎁 Старых ручных выдач: <b>' + manualGrants + '</b>\n\n' +
    '<i>Подписки отключены. Пожертвования учитываются отдельно по истории Telegram Stars.</i>'
  );
}
