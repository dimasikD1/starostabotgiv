import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Users, 
  Calendar, 
  BookOpen, 
  Save, 
  Download, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  RefreshCw,
  Award,
  Layers,
  School
} from 'lucide-react';
import { GroupDatabase, StudentUser, ScheduleItem } from '../types';

export const DatabaseEditorTab: React.FC = () => {
  const [db, setDb] = useState<GroupDatabase | null>(null);
  const [activeSection, setActiveSection] = useState<'meta' | 'users' | 'schedule' | 'homework'>('meta');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadDb = async () => {
    try {
      const res = await fetch('/api/bot-db');
      const data = await res.json();
      if (data.ok) {
        setDb(data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadDb();
  }, []);

  const handleSave = async () => {
    if (!db) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/bot-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: db }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert(`Ошибка сохранения: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddStudent = () => {
    if (!db) return;
    const newId = `user-${Date.now().toString().slice(-4)}`;
    const newStudent: StudentUser = {
      id: newId,
      name: 'Новый Студент',
      username: '@student',
      role: 'student',
      roleTitle: 'Студент',
      subgroup: 1,
      phone: '+7 (999) 000-00-00',
      telegram: '@student',
    };
    setDb({
      ...db,
      users: [...db.users, newStudent],
    });
  };

  const handleRemoveStudent = (id: string) => {
    if (!db) return;
    setDb({
      ...db,
      users: db.users.filter((u) => u.id !== id),
    });
  };

  const handleUpdateStudent = (id: string, field: keyof StudentUser, value: any) => {
    if (!db) return;
    setDb({
      ...db,
      users: db.users.map((u) => {
        if (u.id === id) {
          const updated = { ...u, [field]: value };
          if (field === 'role') {
            if (value === 'starosta') updated.roleTitle = 'Староста';
            else if (value === 'proforg') updated.roleTitle = 'Профорг';
            else updated.roleTitle = 'Студент';
          }
          return updated;
        }
        return u;
      }),
    });
  };

  if (!db) {
    return (
      <div className="py-20 text-center text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
        <p className="text-sm">Загрузка базы данных db.json...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top action header */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-purple-400" />
            <span>Управление базой данных группы (db.json)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Все изменения автоматически пересобираются в ZIP и будут записаны в постоянный том Amvera <code className="text-purple-300">/data/db.json</code>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Сохранено в db.json!
            </span>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Сохранить базу</span>
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSection('meta')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            activeSection === 'meta'
              ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <School className="w-4 h-4" />
          <span>Группа и Институт</span>
        </button>

        <button
          onClick={() => setActiveSection('users')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            activeSection === 'users'
              ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Студенты ({db.users.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('schedule')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            activeSection === 'schedule'
              ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Расписание пар</span>
        </button>

        <button
          onClick={() => setActiveSection('homework')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            activeSection === 'homework'
              ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Домашка ({db.homework.length})</span>
        </button>
      </div>

      {/* Section: Metadata */}
      {activeSection === 'meta' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-sm font-bold text-white">Метаданные группы</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Код группы:</label>
              <input
                type="text"
                value={db.groupMeta.code}
                onChange={(e) =>
                  setDb({ ...db, groupMeta: { ...db.groupMeta, code: e.target.value } })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Учебное заведение:</label>
              <input
                type="text"
                value={db.groupMeta.university}
                onChange={(e) =>
                  setDb({ ...db, groupMeta: { ...db.groupMeta, university: e.target.value } })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Факультет:</label>
              <input
                type="text"
                value={db.groupMeta.faculty}
                onChange={(e) =>
                  setDb({ ...db, groupMeta: { ...db.groupMeta, faculty: e.target.value } })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">ФИО куратора группы:</label>
              <input
                type="text"
                value={db.groupMeta.curatorName}
                onChange={(e) =>
                  setDb({ ...db, groupMeta: { ...db.groupMeta, curatorName: e.target.value } })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Курс:</label>
              <input
                type="number"
                value={db.groupMeta.course}
                onChange={(e) =>
                  setDb({ ...db, groupMeta: { ...db.groupMeta, course: Number(e.target.value) } })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Регион:</label>
              <input
                type="text"
                value={db.groupMeta.region}
                onChange={(e) =>
                  setDb({ ...db, groupMeta: { ...db.groupMeta, region: e.target.value } })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Section: Users */}
      {activeSection === 'users' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Список студентов и старост группы
            </h3>
            <button
              onClick={handleAddStudent}
              className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить студента</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">ФИО Студента</th>
                  <th className="p-3">Роль</th>
                  <th className="p-3">Подгруппа</th>
                  <th className="p-3">Telegram</th>
                  <th className="p-3">Телефон</th>
                  <th className="p-3 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
                {db.users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-850/50">
                    <td className="p-3 font-sans font-medium text-white">
                      <input
                        type="text"
                        value={u.name}
                        onChange={(e) => handleUpdateStudent(u.id, 'name', e.target.value)}
                        className="bg-transparent border-b border-slate-700 focus:border-purple-400 focus:outline-none px-1 py-0.5 w-full"
                      />
                    </td>
                    <td className="p-3">
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdateStudent(u.id, 'role', e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-purple-300 focus:outline-none"
                      >
                        <option value="starosta">Староста</option>
                        <option value="proforg">Профорг</option>
                        <option value="student">Студент</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <select
                        value={u.subgroup}
                        onChange={(e) => handleUpdateStudent(u.id, 'subgroup', Number(e.target.value))}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-blue-300 focus:outline-none"
                      >
                        <option value={1}>1 п/гр</option>
                        <option value={2}>2 п/гр</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        value={u.telegram || ''}
                        onChange={(e) => handleUpdateStudent(u.id, 'telegram', e.target.value)}
                        className="bg-transparent border-b border-slate-700 focus:border-purple-400 focus:outline-none px-1 py-0.5 w-28 text-slate-300"
                      />
                    </td>
                    <td className="p-3 text-slate-400">
                      <input
                        type="text"
                        value={u.phone || ''}
                        onChange={(e) => handleUpdateStudent(u.id, 'phone', e.target.value)}
                        className="bg-transparent border-b border-slate-700 focus:border-purple-400 focus:outline-none px-1 py-0.5 w-32"
                      />
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleRemoveStudent(u.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded transition-colors"
                        title="Удалить студента"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section: Schedule */}
      {activeSection === 'schedule' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white">Расписание занятий по дням недели</h3>
          <div className="space-y-3">
            {db.schedule.map((s, idx) => (
              <div
                key={s.id || idx}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-400">
                      День {s.dayOfWeek} · Пара {s.pairNumber} ({s.timeStart} – {s.timeEnd})
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      {s.type}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-white mt-1">{s.subject}</div>
                  <div className="text-slate-400 mt-0.5">{s.teacher} · ауд. {s.room}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section: Homework */}
      {activeSection === 'homework' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white">Домашние задания и дедлайны</h3>
          <div className="space-y-3">
            {db.homework.map((h) => (
              <div
                key={h.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-4 text-xs"
              >
                <div>
                  <div className="font-bold text-emerald-400 text-sm">{h.subject}</div>
                  <div className="text-slate-300 mt-1">{h.task}</div>
                  <div className="text-slate-500 mt-2 font-mono">Дедлайн: {h.deadline}</div>
                </div>
                <div className="text-right shrink-0">
                  <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                    Выполнили: {h.completedByUserIds.length} чел.
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
