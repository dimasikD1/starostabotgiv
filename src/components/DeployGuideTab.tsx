import React, { useState } from 'react';
import { 
  Github, 
  Cloud, 
  Terminal, 
  Copy, 
  Check, 
  Download, 
  ExternalLink, 
  HardDrive, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface DeployGuideTabProps {
  onOpenTokenModal: () => void;
}

export const DeployGuideTab: React.FC<DeployGuideTabProps> = ({ onOpenTokenModal }) => {
  const [repoUrl, setRepoUrl] = useState('https://github.com/dimasik1dunaev/starost-bot.git');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const gitCommands = [
    '# 1. Перейдите в распакованную папку бота',
    'cd starost-bot-amvera',
    '',
    '# 2. Инициализируйте репозиторий Git',
    'git init',
    '',
    '# 3. Добавьте все файлы (.env надежно игнорируется через .gitignore)',
    'git add .',
    '',
    '# 4. Сделайте первый коммит с файлом конфигурации amvera.yml',
    'git commit -m "feat: initial commit for Amvera Cloud and GitHub"',
    '',
    '# 5. Установите основную ветку main',
    'git branch -M main',
    '',
    '# 6. Привяжите ваш удаленный GitHub репозиторий',
    `git remote add origin ${repoUrl.trim() || 'https://github.com/ВАШ_ЛОГИН/starost-bot.git'}`,
    '',
    '# 7. Отправьте код на GitHub',
    'git push -u origin main',
  ].join('\n');

  return (
    <div className="space-y-8 pb-12">
      {/* Banner / Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-blue-950/40 border border-slate-800 p-6 sm:p-8">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Полная совместимость с Amvera Cloud & GitHub</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Развертывание бота «Староста 24» в Amvera
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Мы полностью адаптировали бота: создан файл <code className="text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-900/50">amvera.yml</code>, настроен том постоянного хранения <code className="text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-900/50">/data</code> для сохранения базы <code className="text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-900/50">db.json</code>, а также добавлен безопасный <code className="text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-900/50">.gitignore</code>, чтобы токен не утек в открытый репозиторий.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
            <a
              href="/api/download-zip"
              download="starost-bot-amvera.zip"
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-xl shadow-blue-500/25 flex items-center justify-center gap-2.5 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Скачать архив для GitHub</span>
            </a>
            <button
              onClick={onOpenTokenModal}
              className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-semibold text-sm flex items-center justify-center gap-2 transition-all"
            >
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>Тест токена</span>
            </button>
          </div>
        </div>
      </div>

      {/* GitHub Push Steps */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-white">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Шаг 1: Загрузка бота на GitHub
              </h3>
              <p className="text-xs text-slate-400">
                Создайте репозиторий и выполните команды в терминале
              </p>
            </div>
          </div>

          <a
            href="https://github.com/new"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-950/40 border border-blue-900/50 hover:bg-blue-900/30 transition-colors"
          >
            <span>Создать репозиторий на GitHub</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* URL Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Ссылка на ваш GitHub репозиторий:
          </label>
          <div className="relative">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/ВАШ_АККАУНТ/starost-bot.git"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Команды ниже автоматически обновятся с вашей ссылкой на репозиторий.
          </p>
        </div>

        {/* Commands Terminal View */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Terminal className="w-4 h-4 text-emerald-400" /> Команды для терминала (Git Bash / PowerShell / Terminal)
            </span>
            <button
              onClick={() => copyToClipboard(gitCommands, 'all-git')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              {copiedKey === 'all-git' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Скопировано!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Копировать всё</span>
                </>
              )}
            </button>
          </div>

          <div className="relative group rounded-xl bg-slate-950 border border-slate-800/90 p-4 font-mono text-xs text-slate-200 overflow-x-auto">
            <pre className="whitespace-pre-wrap leading-relaxed text-slate-300">
              {gitCommands}
            </pre>
          </div>
        </div>
      </div>

      {/* Amvera Cloud Deploy Guide */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Шаг 2: Настройка проекта в Amvera Cloud
              </h3>
              <p className="text-xs text-slate-400">
                Пошаговая настройка в личном кабинете amvera.ru
              </p>
            </div>
          </div>

          <a
            href="https://amvera.ru"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-950/40 border border-blue-900/50 hover:bg-blue-900/30 transition-colors"
          >
            <span>Перейти в Amvera Cloud</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Step-by-step visual cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1 */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[11px] font-bold">1</span>
              <span>Создайте новый проект в Amvera</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Нажмите <b>«Создать проект»</b>. В поле типа проекта выберите <b>«Фоновый процесс»</b> (Worker) или <b>«Приложение»</b> (Application). Наш бот снабжен встроенным health-check сервером, поэтому стабильно работает в обоих режимах!
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[11px] font-bold">2</span>
              <span>Подключите репозиторий GitHub</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Выберите способ загрузки <b>GitHub</b>, авторизуйтесь и выберите ваш созданный репозиторий <code className="text-blue-300">starost-bot</code> и ветку <code className="text-blue-300">main</code>. Теперь при каждом коммите Amvera будет автоматически обновлять бота.
            </p>
          </div>

          {/* Card 3 - Critical Secrets */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-amber-900/40 space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[11px] font-bold">3</span>
                <span>Вкладка «Переменные» (Variables)</span>
              </div>
              <button
                onClick={onOpenTokenModal}
                className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
              >
                Проверить токен
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Добавьте переменную окружения:
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] space-y-1">
              <div className="text-amber-300 font-semibold">TELEGRAM_BOT_TOKEN = 123456789:AAE...</div>
              <div className="text-slate-400 text-[10px]"># Токен, полученный в @BotFather через команду /newbot</div>
            </div>
          </div>

          {/* Card 4 - Persistence */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-emerald-900/40 space-y-2 relative overflow-hidden">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[11px] font-bold">4</span>
              <span>Вкладка «Хранилище» (Постоянный том /data)</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              В Amvera убедитесь, что постоянное хранилище смонтировано по пути:
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] flex items-center justify-between">
              <span className="text-emerald-300 font-semibold">Точка монтирования: /data</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                Защита от потери данных
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Бот автоматически скопирует стартовую базу студентов и расписания в <code className="text-emerald-300">/data/db.json</code>. Любые обновления кода не сотрут журнал посещаемости!
            </p>
          </div>
        </div>

        {/* Card 5 - Launch & Logs preview */}
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Шаг 5: Запуск и мониторинг логов в Amvera
            </span>
            <span className="text-slate-500 font-mono text-[11px]">amvera.ru/logs</span>
          </div>
          <div className="font-mono text-xs bg-slate-900/90 rounded-lg p-3 text-emerald-300/90 leading-relaxed border border-slate-800">
            <div>[build] Using node 20 via npm...</div>
            <div>[run] npm start</div>
            <div>======================================================</div>
            <div>🤖 Бот «Староста 24» запущен: @starosta_bi_bot (Староста 24)</div>
            <div>   Режим: Long Polling (без вебхука)</div>
            <div>   База данных: /data/db.json</div>
            <div>   Amvera persistent /data: ДА (данные защищены при деплоях)</div>
            <div>======================================================</div>
          </div>
        </div>
      </div>

      {/* Amvera Configuration Explanations */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-indigo-400" />
          Как устроена конфигурация amvera.yml
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1.5">
            <div className="font-mono font-semibold text-blue-400">meta.environment: node</div>
            <div className="font-mono text-slate-400 text-[11px]">version: 20</div>
            <p className="text-slate-300 text-[11px] mt-1">
              Amvera собирает контейнер на официальном образе Node.js 20 LTS с поддержкой ES Modules и нативного fetch.
            </p>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1.5">
            <div className="font-mono font-semibold text-emerald-400">run.command: npm start</div>
            <div className="font-mono text-slate-400 text-[11px]">node index.mjs</div>
            <p className="text-slate-300 text-[11px] mt-1">
              Запуск бота в режиме непрерывного опроса (Long Polling) без необходимости регистрировать сложные вебхуки и SSL-сертификаты.
            </p>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1.5">
            <div className="font-mono font-semibold text-purple-400">persistenceMount: /data</div>
            <div className="font-mono text-slate-400 text-[11px]">/data/db.json</div>
            <p className="text-slate-300 text-[11px] mt-1">
              Специальная персистентная директория облака Amvera. Все новые отметки и голоса пишутся сюда и не затираются при деплоях.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
