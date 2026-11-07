import React, { useState, useEffect } from 'react';
import { 
  FileCode, 
  Copy, 
  Check, 
  Save, 
  Download, 
  Settings, 
  FileText, 
  CheckCircle2, 
  Database,
  Cloud,
  Layers,
  RefreshCw
} from 'lucide-react';
import { BotFile } from '../types';

interface FileInspectorTabProps {
  onRefreshZip?: () => void;
}

export const FileInspectorTab: React.FC<FileInspectorTabProps> = ({ onRefreshZip }) => {
  const [files, setFiles] = useState<BotFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('amvera.yml');
  const [fileContent, setFileContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [nodeVersion, setNodeVersion] = useState<string>('20');
  const [persistenceMount, setPersistenceMount] = useState<string>('/data');

  // Load files from backend API
  const loadFiles = async () => {
    try {
      const res = await fetch('/api/bot-files');
      const data = await res.json();
      if (data.ok && Array.isArray(data.files)) {
        setFiles(data.files);
        const current = data.files.find((f: BotFile) => f.path === selectedPath) || data.files[0];
        if (current) {
          setSelectedPath(current.path);
          setFileContent(current.content);
        }
      }
    } catch (err) {
      console.error('Failed to load bot files:', err);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleSelectFile = (file: BotFile) => {
    setSelectedPath(file.path);
    setFileContent(file.content);
    setSaveSuccess(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(fileContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: selectedPath,
          content: fileContent,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        await loadFiles();
        if (onRefreshZip) onRefreshZip();
      } else {
        alert(`Ошибка при сохранении: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Ошибка соединения: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Quick configure amvera.yml
  const handleApplyAmveraConfig = async () => {
    const newAmveraYml = `meta:
  environment: node
  toolchain:
    name: npm
    version: ${nodeVersion}

build:
  requirements: []

run:
  command: npm start
  persistenceMount: ${persistenceMount}
`;
    setFileContent(newAmveraYml);
    setSelectedPath('amvera.yml');

    try {
      await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: 'amvera.yml',
          content: newAmveraYml,
        }),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadFiles();
    } catch (err) {
      console.error(err);
    }
  };

  const selectedFile = files.find((f) => f.path === selectedPath);

  return (
    <div className="space-y-6 pb-12">
      {/* Header section with quick Amvera configurator */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-blue-400" />
            <span>Конфигуратор Amvera и редактор исходников</span>
          </h2>
          <p className="text-xs text-slate-400">
            Все файлы ниже уже упакованы в архив и подготовлены для заливки в GitHub и развертывания в Amvera
          </p>
        </div>

        {/* Amvera quick presets */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="text-slate-400 font-medium">Node:</span>
            <select
              value={nodeVersion}
              onChange={(e) => setNodeVersion(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-blue-300 font-mono focus:outline-none"
            >
              <option value="20">20 (LTS - рек.)</option>
              <option value="18">18 (LTS)</option>
              <option value="22">22 (Latest)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="text-slate-400 font-medium">Хранилище:</span>
            <input
              type="text"
              value={persistenceMount}
              onChange={(e) => setPersistenceMount(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-300 font-mono w-20 focus:outline-none"
            />
          </div>

          <button
            onClick={handleApplyAmveraConfig}
            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Применить к amvera.yml</span>
          </button>
        </div>
      </div>

      {/* Main split view: File list & Code Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: File Tree */}
        <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs text-slate-400 font-semibold px-2">
            <span>Файлы репозитория</span>
            <span className="font-mono text-[11px] text-slate-500">{files.length} файлов</span>
          </div>

          <div className="space-y-1 max-h-[580px] overflow-y-auto pr-1">
            {files.map((file) => {
              const isSelected = file.path === selectedPath;
              return (
                <button
                  key={file.path}
                  onClick={() => handleSelectFile(file)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-blue-600/15 border border-blue-500/40 text-blue-300 font-semibold shadow-sm'
                      : 'hover:bg-slate-800/60 border border-transparent text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {file.name === 'amvera.yml' ? (
                      <Cloud className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : file.name.endsWith('.json') ? (
                      <Database className="w-4 h-4 text-purple-400 shrink-0" />
                    ) : file.name.endsWith('.md') ? (
                      <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <span className="truncate font-mono">{file.path}</span>
                  </div>

                  <span className="text-[10px] text-slate-500 font-mono ml-2 shrink-0">
                    {file.size > 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${file.size} B`}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-800/80">
            <a
              href="/api/download-zip"
              download="starost-bot-amvera.zip"
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Скачать все файлы (.zip)</span>
            </a>
          </div>
        </div>

        {/* Right Column: Code Editor & Viewer */}
        <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-xl">
          {/* Editor Header */}
          <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-bold text-white">
                {selectedPath}
              </span>
              {selectedPath === 'amvera.yml' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Конфиг Amvera
                </span>
              )}
              {selectedPath === 'db.mjs' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                  Хранилище /data
                </span>
              )}
              {saveSuccess && (
                <span className="text-xs text-emerald-400 flex items-center gap-1 animate-fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Сохранено и перепаковано в ZIP!
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Скопировано</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Копировать</span>
                  </>
                )}
              </button>

              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shadow-blue-500/30"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Сохранение...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Сохранить файл</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Code Textarea with Monospace styling */}
          <div className="relative p-1 bg-slate-950">
            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              spellCheck={false}
              className="w-full h-[540px] bg-slate-950 text-slate-200 font-mono text-xs leading-relaxed p-4 rounded-xl focus:outline-none resize-none border-none selection:bg-blue-600 selection:text-white"
            />
          </div>

          {/* Footer note */}
          <div className="px-5 py-2.5 bg-slate-950/80 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
            <span>
              💡 Изменения сразу попадают в сборку и автоматически обновляют скачиваемый архив starost-bot-amvera.zip
            </span>
            <span className="font-mono text-slate-400">
              {fileContent.split('\n').length} строк
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
