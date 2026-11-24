import { classifyGroupBotMembershipTransition, type TelegramGroupMemberStatus } from './group-bot-membership.js';
import { getMissingTelegramBotPermissions, type TelegramBotPermissions } from './telegram-bot-permissions.js';

export interface GroupMembershipChat {
  id: string | number;
  type: string;
  title?: string;
}

export interface GroupMembershipActor {
  id: string | number;
}

export interface GroupMembershipUpdate {
  chat?: GroupMembershipChat | null;
  from?: GroupMembershipActor | null;
  oldStatus?: TelegramGroupMemberStatus | null;
  newStatus?: TelegramGroupMemberStatus | null;
  newMember?: TelegramBotPermissions | null;
  botId: number;
}

export interface GroupMembershipHandlerDependencies {
  registerGroup(chat: GroupMembershipChat, actor: GroupMembershipActor): void;
  getBotMember(chatId: string | number, botId: number): Promise<TelegramBotPermissions | null>;
  sendMessage(chatId: string | number, message: string, parseMode?: 'HTML'): Promise<void>;
  logError(label: string, error: unknown): void;
}

/** Coordinates group registration and permission notices while keeping Telegram I/O injected. */
export async function handleGroupBotMembershipUpdate(
  update: GroupMembershipUpdate,
  deps: GroupMembershipHandlerDependencies
): Promise<void> {
  const chat = update.chat;
  if (!chat?.id || !update.from) return;

  const transition = classifyGroupBotMembershipTransition({
    chatType: chat.type,
    oldStatus: update.oldStatus,
    newStatus: update.newStatus
  });
  if (!transition.shouldHandle || !transition.shouldRegister) return;

  const { joined, demoted } = transition;
  try {
    deps.registerGroup(chat, update.from);
  } catch (error) {
    deps.logError('[group setup] Registration failed:', error);
  }

  if (transition.shouldCheckPermissions) {
    let memberInfo: TelegramBotPermissions | null = null;
    try {
      memberInfo = await deps.getBotMember(chat.id, update.botId);
    } catch {
      // Fall back to the membership update payload, as the legacy handler did.
    }
    const missing = getMissingTelegramBotPermissions(memberInfo || update.newMember);
    const message = missing.length
      ? '⚠️ <b>Бот добавлен в чат, но не все права выданы.</b>\\n\\nВ настройках администраторов включи: ' + missing.join(', ') + '.'
      : '✅ <b>Бот подключён к существующему чату!</b>\\nЧат зарегистрирован, необходимые права администратора выданы. Существующая переписка и данные не затронуты.';
    try {
      await deps.sendMessage(chat.id, message, 'HTML');
    } catch (error) {
      deps.logError('[group setup] Could not send admin confirmation:', error);
    }
  } else if (joined) {
    try {
      await deps.sendMessage(
        chat.id,
        '👋 <b>Староста Бот добавлен в этот существующий чат.</b> Чат зарегистрирован, создавать новую группу не нужно.\\n\\nДля полной работы назначьте бота администратором и включите права: <b>удаление сообщений</b>, <b>ограничение участников</b> и <b>закрепление сообщений</b>. Не выдавайте право добавлять других администраторов. После выдачи прав бот подтвердит подключение.',
        'HTML'
      );
    } catch (error) {
      deps.logError('[group setup] Could not send setup instructions:', error);
    }
  } else if (demoted) {
    try {
      await deps.sendMessage(
        chat.id,
        '⚠️ Права администратора у бота сняты. Для проверки участников и закрепления расписания верните права удаления сообщений, ограничения участников и закрепления.'
      );
    } catch {
      // A demotion notice is best-effort, matching the existing runtime behavior.
    }
  }
}
