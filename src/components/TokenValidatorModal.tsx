import React, { useState } from 'react';
import { 
  X, 
  KeyRound, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  ExternalLink,
  Bot,
  Copy,
  Check
} from 'lucide-react';
import { BotMeInfo } from '../types';

interface TokenValidatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  botMe: BotMeInfo | null;
  setBotMe: (info: BotMeInfo | null) => void;
}

export const TokenValidatorModal: React.FC<TokenValidatorModalProps> = ({
  isOpen,
  onClose,
  botMe,
  setBotMe,
}) => {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Введите токен бота от @BotFather');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (data.ok && data.bot) {
        setBotMe(data.bot);
      } else {
        setError(data.error || 'Ошибка проверки токена');
      }
    } catch (err: any) {
      setError(`Сетевая ошибка: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(token.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Проверка Telegram-токена</h3>
              <p className="text-[11px] text-slate-400">Тестирование через официальный метод getMe</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Токен бота (из @BotFather):
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:AAE_вашего_бота_токен_здесь"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Токен проверяется безопасным запросом на сервере и нигде не сохраняется публично.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <span>Открыть @BotFather</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                <span>Проверить токен</span>
              </button>
            </div>
          </form>

          {/* Error Alert */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Ошибка проверки:</span>
                <p className="mt-0.5 text-rose-200">{error}</p>
              </div>
            </div>
          )}

          {/* Success Card */}
          {botMe && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Бот успешно найден в Telegram!</span>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Имя бота:</span>
                  <span className="text-white font-bold">{botMe.first_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Username:</span>
                  <span className="text-emerald-400 font-mono font-bold">@{botMe.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ID бота:</span>
                  <span className="text-slate-300 font-mono">{botMe.id}</span>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-slate-300 leading-relaxed">
                👉 Теперь вставьте этот токен в панели Amvera Cloud:
                <br />
                <b>Проект ➔ Переменные ➔ TELEGRAM_BOT_TOKEN</b>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950/80 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
