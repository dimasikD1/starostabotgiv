import { escapeHtml } from '../utils/html.js';

export interface HomeworkMessageRecord {
  id?: string;
  subject?: unknown;
  groupTitle?: unknown;
  homework?: unknown;
  createdAt?: unknown;
  completedBy?: Record<string, unknown> | null;
}

export interface HomeworkMessageButton {
  text: string;
  callbackData: string;
}

export interface HomeworkMessage {
  text: string;
  buttons: HomeworkMessageButton[][];
}

export function buildHomeworkMessage(records: HomeworkMessageRecord[], userId: string | number): HomeworkMessage {
  const buttons: HomeworkMessageButton[][] = [];
  const text = '📚 <b>Домашние задания</b>\n\n' + records.map((record, index) => {
    const done = Boolean(record.completedBy?.[String(userId)]);
    if (record.id && !done) {
      buttons.push([{
        text: '✅ Выполнено: ' + String(record.subject || 'ДЗ').slice(0, 35),
        callbackData: 'hwcomplete:' + record.id
      }]);
    }
    return (index + 1) + '. <b>' + escapeHtml(record.subject) + '</b> — ' + escapeHtml(record.groupTitle) +
      '\n' + escapeHtml(record.homework) + '\n' + escapeHtml(record.createdAt || '') +
      '\n' + (done ? '✅ Выполнение отмечено' : '▫️ Ещё не отмечено');
  }).join('\n\n');
  return { text, buttons };
}
