import React from 'react';
import { 
  Download, 
  Terminal, 
  Cloud, 
  Github, 
  Bot, 
  Database, 
  FileCode, 
  KeyRound, 
  CheckCircle2,
  HardDrive
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'deploy' | 'files' | 'simulator' | 'database';
  setActiveTab: (tab: 'deploy' | 'files' | 'simulator' | 'database') => void;
  onOpenTokenModal: () => void;
  botMe: any | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenTokenModal,
  botMe,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 p-0.5 shadow-lg shadow-blue-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Bot className="w-6 h-6 text-blue-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                  Староста 24 <span className="text-blue-400 font-medium text-xs px-2 py-0.5 rounded-full bg-blue-950/80 border border-blue-800/60">Amvera Ready</span>
                </h1>
                <span className="hidden sm:inline-block text-xs text-slate-400 border-l border-slate-700 pl-2">
                  Группа БИ(ЭБ) 1/2 • ККИ РУК
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> amvera.yml настроен
                </span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1 text-sky-400">
                  <HardDrive className="w-3 h-3" /> том /data (persistent)
                </span>
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2.5">
            <button
              onClick={onOpenTokenModal}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
                botMe
                  ? 'bg-emerald-950/50 border-emerald-700 text-emerald-300 hover:bg-emerald-900/50'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750 hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              {botMe ? (
                <span>@{botMe.username}</span>
              ) : (
                <span>Проверить токен</span>
              )}
            </button>

            <a
              href="/api/download-zip"
              download="starost-bot-amvera.zip"
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-600/25 flex items-center gap-2 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Скачать ZIP для GitHub</span>
              <span className="sm:hidden">ZIP</span>
            </a>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 border-t border-slate-800/80 -mb-px overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('deploy')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'deploy'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Cloud className="w-4 h-4 text-cyan-400" />
            <span>Развертывание в Amvera & GitHub</span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'files'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <FileCode className="w-4 h-4 text-amber-400" />
            <span>Файлы проекта и amvera.yml</span>
          </button>

          <button
            onClick={() => setActiveTab('simulator')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'simulator'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Bot className="w-4 h-4 text-emerald-400" />
            <span>Симулятор Telegram-бота</span>
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'database'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Database className="w-4 h-4 text-purple-400" />
            <span>База Данных & Студенты (db.json)</span>
          </button>
        </div>
      </div>
    </header>
  );
};
