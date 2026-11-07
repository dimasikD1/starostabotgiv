import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  Send, 
  User, 
  RotateCcw, 
  Calendar, 
  CheckSquare, 
  PieChart, 
  Bell, 
  Star, 
  Users, 
  Sparkles,
  Info
} from 'lucide-react';
import { GroupDatabase } from '../types';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  keyboard?: Array<Array<{ text: string; callback_data: string }>>;
  time: string;
}

export const BotSimulatorTab: React.FC = () => {
  const [db, setDb] = useState<GroupDatabase | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('user-1'); // Dmitry Dunaev
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Load database from API
  const loadDb = async () => {
    try {
      const res = await fetch('/api/bot-db');
      const data = await res.json();
      if (data.ok) {
        setDb(data.data);
      }
    } catch (err) {
      console.error('Failed to load db for simulator:', err);
    }
  };

  useEffect(() => {
    loadDb();
  }, []);

  const currentUser = db?.users.find((u) => u.id === currentUserId);

  const getTimeString = () => {
    const d = new Date();
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0 && db) {
      handleCommand('/start');
    }
  }, [db]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Command handlers
  const handleCommand = (cmd: string) => {
    if (!db) return;
    const cleanCmd = cmd.trim().toLowerCase().split(' ')[0];

    // User message
    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: cmd,
      time: getTimeString(),
    };

    let botMsgText = '';
    let keyboard: Array<Array<{ text: string; callback_data: string }>> | undefined = undefined;

    switch (cleanCmd) {
      case '/start':
      case 'главное меню':
        botMsgText = `👋 Привет, <b>${currentUser?.name || 'студент'}</b>!\n\n` +
          `Я официальный бот группы <b>${db.groupMeta.code}</b> (${db.groupMeta.university}).\n\n` +
          `Выберите нужный раздел кнопками ниже:`;
        keyboard = [
          [
            { text: '📊 Журнал', callback_data: 'cmd:journal' },
            { text: '🗓 Расписание', callback_data: 'cmd:schedule' },
          ],
          [
            { text: '📚 Домашка', callback_data: 'cmd:homework' },
            { text: '📊 Опрос группы', callback_data: 'cmd:poll' },
          ],
          [
            { text: '📢 Объявления', callback_data: 'cmd:news' },
            { text: '⭐ Староста', callback_data: 'cmd:starosta' },
          ],
        ];
        break;

      case '/schedule':
      case 'расписание':
        botMsgText = `🗓 <b>Расписание занятий: Группа ${db.groupMeta.code}</b>\n\n` +
          db.schedule.slice(0, 4).map((s) => (
            `<b>Пара ${s.pairNumber}</b> (${s.timeStart} – ${s.timeEnd})\n` +
            `📖 <i>${s.subject}</i> (${s.type === 'lecture' ? 'лекция' : 'практика'})\n` +
            `👤 ${s.teacher} · ауд. ${s.room}`
          )).join('\n\n');
        keyboard = [
          [
            { text: 'Пн', callback_data: 'day:1' },
            { text: 'Вт', callback_data: 'day:2' },
            { text: 'Ср', callback_data: 'day:3' },
            { text: 'Чт', callback_data: 'day:4' },
            { text: 'Пт', callback_data: 'day:5' },
          ],
          [{ text: '« В главное меню', callback_data: 'cmd:start' }],
        ];
        break;

      case '/journal':
      case 'журнал':
        botMsgText = `📊 <b>Журнал посещаемости</b>\n` +
          `Группа: <b>${db.groupMeta.code}</b> · Пара 1\n` +
          `Дисциплина: <i>${db.schedule[0]?.subject || 'Текущая пара'}</i>\n\n` +
          db.users.slice(0, 6).map((u, i) => (
            `${i % 3 === 0 ? '✅' : '✅'} <b>${u.name}</b> (${u.roleTitle})`
          )).join('\n') +
          `\n\n💡 <i>Отметки сохраняются в персистентный том /data/db.json</i>`;
        keyboard = [
          [
            { text: 'Отметить всех ✅', callback_data: 'att:all_present' },
            { text: 'Пара 2 ➡️', callback_data: 'att:next_pair' },
          ],
          [{ text: '« В главное меню', callback_data: 'cmd:start' }],
        ];
        break;

      case '/homework':
      case 'домашка':
        botMsgText = `📚 <b>Домашние задания и дедлайны</b>\n\n` +
          db.homework.map((h) => {
            const isDone = h.completedByUserIds.includes(currentUserId);
            return `${isDone ? '✅' : '⏳'} <b>${h.subject}</b> (до ${h.deadline})\n` +
              `📝 ${h.task}`;
          }).join('\n\n');
        keyboard = [
          [{ text: '« В главное меню', callback_data: 'cmd:start' }],
        ];
        break;

      case '/poll':
      case 'опрос':
        const poll = db.polls[0];
        if (poll) {
          botMsgText = `📊 <b>Опрос: ${poll.question}</b>\n\n` +
            poll.options.map((o) => (
              `• <b>${o.text}</b> — ${o.votedUserIds.length} голосов`
            )).join('\n');
          keyboard = poll.options.map((o) => [
            { text: `🗳 ${o.text} (${o.votedUserIds.length})`, callback_data: `vote:${o.id}` },
          ]);
          keyboard.push([{ text: '« В главное меню', callback_data: 'cmd:start' }]);
        } else {
          botMsgText = 'Активных опросов нет.';
        }
        break;

      case '/starosta':
      case 'староста':
        botMsgText = `⭐ <b>Контакты руководства группы ${db.groupMeta.code}</b>\n\n` +
          `👨‍🎓 <b>Староста (1 п/гр):</b> Дмитрий Дунаев (@dima_starosta)\n` +
          `👩‍🎓 <b>Староста (2 п/гр):</b> Анна Сергеева (@anya_starosta2)\n` +
          `🤝 <b>Профорг:</b> Максим Ковалёв (@max_koval)\n` +
          `👩‍🏫 <b>Куратор:</b> ${db.groupMeta.curatorName}\n\n` +
          `🏛 ${db.groupMeta.university}\n` +
          `📜 ${db.starostaMandate?.orderNumber || 'Приказ №84-СТ'}`;
        keyboard = [
          [{ text: '« В главное меню', callback_data: 'cmd:start' }],
        ];
        break;

      case '/news':
      case 'объявления':
        botMsgText = `📢 <b>Объявления группы</b>\n\n` +
          db.announcements.slice(0, 3).map((a) => (
            `📌 <b>${a.title}</b> (${a.timestamp})\n${a.content}`
          )).join('\n\n');
        keyboard = [
          [{ text: '« В главное меню', callback_data: 'cmd:start' }],
        ];
        break;

      case '/whoami':
        botMsgText = `👤 <b>Ваш профиль в боте:</b>\n\n` +
          `Имя: <b>${currentUser?.name}</b>\n` +
          `Роль: <b>${currentUser?.roleTitle}</b>\n` +
          `Подгруппа: <b>${currentUser?.subgroup}</b>\n` +
          `Telegram: <b>${currentUser?.telegram}</b>\n` +
          `ID в базе: <code>${currentUser?.id}</code>`;
        keyboard = [
          [{ text: '« В главное меню', callback_data: 'cmd:start' }],
        ];
        break;

      case '/help':
        botMsgText = `ℹ️ <b>Список доступных команд:</b>\n\n` +
          `/journal — Журнал посещаемости\n` +
          `/schedule — Расписание занятий на сегодня\n` +
          `/homework — Задания и дедлайны\n` +
          `/poll — Активный опрос группы\n` +
          `/news — Объявления кафедры и старосты\n` +
          `/starosta — Контакты старост и куратора\n` +
          `/whoami — Информация о вашей привязке\n` +
          `/start — Главное меню`;
        keyboard = [
          [{ text: '« В главное меню', callback_data: 'cmd:start' }],
        ];
        break;

      default:
        botMsgText = `Я не знаю команду <code>${cmd}</code>. Нажмите /start или воспользуйтесь кнопками меню.`;
        keyboard = [[{ text: '« В главное меню', callback_data: 'cmd:start' }]];
        break;
    }

    const botMsg: Message = {
      id: `bot-${Date.now()}`,
      sender: 'bot',
      text: botMsgText,
      keyboard,
      time: getTimeString(),
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
  };

  const handleCallbackClick = (data: string) => {
    if (data.startsWith('cmd:')) {
      handleCommand(`/${data.replace('cmd:', '')}`);
    } else if (data.startsWith('day:')) {
      const dayNum = data.replace('day:', '');
      const dayNames: Record<string, string> = {
        '1': 'Понедельник',
        '2': 'Вторник',
        '3': 'Среда',
        '4': 'Четверг',
        '5': 'Пятница',
      };
      setMessages((prev) => [
        ...prev,
        {
          id: `usr-${Date.now()}`,
          sender: 'user',
          text: `[Нажата кнопка: ${dayNames[dayNum]}]`,
          time: getTimeString(),
        },
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: `🗓 <b>Расписание на ${dayNames[dayNum]}:</b>\n\n` +
            `Пара 1 (08:30 – 10:00): <b>Математический анализ</b> (лекция, ауд. 302)\n` +
            `Пара 2 (10:15 – 11:45): <b>Информационные технологии</b> (лаб., ауд. 214)\n` +
            `Пара 3 (12:15 – 13:45): <b>Экономическая теория</b> (семинар, ауд. 108)`,
          keyboard: [
            [
              { text: 'Пн', callback_data: 'day:1' },
              { text: 'Вт', callback_data: 'day:2' },
              { text: 'Ср', callback_data: 'day:3' },
              { text: 'Чт', callback_data: 'day:4' },
              { text: 'Пт', callback_data: 'day:5' },
            ],
            [{ text: '« В главное меню', callback_data: 'cmd:start' }],
          ],
          time: getTimeString(),
        },
      ]);
    } else if (data.startsWith('vote:')) {
      const optId = data.replace('vote:', '');
      setMessages((prev) => [
        ...prev,
        {
          id: `usr-${Date.now()}`,
          sender: 'user',
          text: `[Проголосовал в опросе]`,
          time: getTimeString(),
        },
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: `✅ <b>Ваш голос успешно учтен и записан в базу!</b>\n\nСпасибо за участие в опросе группы.`,
          keyboard: [[{ text: '« В главное меню', callback_data: 'cmd:start' }]],
          time: getTimeString(),
        },
      ]);
    } else if (data === 'att:all_present') {
      setMessages((prev) => [
        ...prev,
        {
          id: `usr-${Date.now()}`,
          sender: 'user',
          text: `[Отметить всех присутствующими]`,
          time: getTimeString(),
        },
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: `✅ <b>Все студенты группы отмечены как присутствующие!</b>\n\nЗапись обновлена в постоянном томе <code>/data/db.json</code>.`,
          keyboard: [[{ text: '« В главное меню', callback_data: 'cmd:start' }]],
          time: getTimeString(),
        },
      ]);
    } else {
      handleCommand('/start');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    handleCommand(inputMessage);
    setInputMessage('');
  };

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      {/* Top Controls: Identity Selector & Info */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Симулятор диалога с Telegram-ботом
            </h3>
            <p className="text-xs text-slate-400">
              Проверьте работу команд и inline-кнопок прямо в браузере
            </p>
          </div>
        </div>

        {/* Identity selector */}
        <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
          <span className="text-slate-400 shrink-0">Вы в роли:</span>
          <select
            value={currentUserId}
            onChange={(e) => setCurrentUserId(e.target.value)}
            className="w-full sm:w-auto bg-slate-950 border border-slate-700 text-blue-300 font-medium rounded-lg px-3 py-1.5 focus:outline-none"
          >
            {db?.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.roleTitle})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Telegram Chat Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[620px]">
        {/* Telegram Chat Header */}
        <div className="px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
              С24
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-1.5">
                Староста 24
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              </div>
              <div className="text-[11px] text-blue-400">
                бот для группы {db?.groupMeta.code || 'БИ(ЭБ) 1/2'}
              </div>
            </div>
          </div>

          <button
            onClick={() => setMessages([])}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Очистить чат"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 bg-slate-950/40">
          {messages.map((msg) => {
            const isBot = msg.sender === 'bot';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs leading-relaxed shadow-md ${
                    isBot
                      ? 'bg-slate-850 border border-slate-800/90 text-slate-100 rounded-tl-sm'
                      : 'bg-blue-600 text-white rounded-tr-sm'
                  }`}
                >
                  <div
                    dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br/>') }}
                  />

                  {/* Inline keyboard */}
                  {msg.keyboard && (
                    <div className="mt-3.5 pt-3 border-t border-slate-700/60 space-y-1.5">
                      {msg.keyboard.map((row, rIdx) => (
                        <div key={rIdx} className="grid grid-flow-col gap-1.5 auto-cols-fr">
                          {row.map((btn, bIdx) => (
                            <button
                              key={bIdx}
                              onClick={() => handleCallbackClick(btn.callback_data)}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-950/50 hover:bg-blue-900/60 border border-blue-800/60 text-blue-300 hover:text-white text-[11px] font-medium transition-all text-center truncate active:scale-95"
                            >
                              {btn.text}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className={`text-[9px] mt-1.5 text-right font-mono ${
                      isBot ? 'text-slate-400' : 'text-blue-200'
                    }`}
                  >
                    {msg.time}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={chatBottomRef} />
        </div>

        {/* Quick Command Bar */}
        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {['/start', '/journal', '/schedule', '/homework', '/poll', '/news', '/starosta', '/whoami', '/help'].map((cmd) => (
            <button
              key={cmd}
              onClick={() => handleCommand(cmd)}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-mono transition-colors whitespace-nowrap shrink-0"
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Message Input Form */}
        <form
          onSubmit={handleSubmit}
          className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Напишите команду, например /schedule или /journal..."
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button
            type="submit"
            className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
