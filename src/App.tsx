import React, { useState } from 'react';
import { Header } from './components/Header';
import { DeployGuideTab } from './components/DeployGuideTab';
import { FileInspectorTab } from './components/FileInspectorTab';
import { BotSimulatorTab } from './components/BotSimulatorTab';
import { DatabaseEditorTab } from './components/DatabaseEditorTab';
import { TokenValidatorModal } from './components/TokenValidatorModal';
import { BotMeInfo } from './types';
import { Cloud, Github, HardDrive, ShieldCheck, Download } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'deploy' | 'files' | 'simulator' | 'database'>('deploy');
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [botMe, setBotMe] = useState<BotMeInfo | null>(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Global Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenTokenModal={() => setIsTokenModalOpen(true)}
        botMe={botMe}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        {activeTab === 'deploy' && (
          <DeployGuideTab onOpenTokenModal={() => setIsTokenModalOpen(true)} />
        )}

        {activeTab === 'files' && (
          <FileInspectorTab />
        )}

        {activeTab === 'simulator' && (
          <BotSimulatorTab />
        )}

        {activeTab === 'database' && (
          <DatabaseEditorTab />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/90 py-6 text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-400">Староста 24</span>
            <span>•</span>
            <span>Студенческая группа БИ(ЭБ) 1/2</span>
            <span>•</span>
            <span className="text-slate-400">Краснодарский кооперативный институт РУК</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <a
              href="/api/download-zip"
              download="starost-bot-amvera.zip"
              className="hover:text-blue-400 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>starost-bot-amvera.zip</span>
            </a>
            <span>•</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> Amvera Cloud Persistent Ready
            </span>
          </div>
        </div>
      </footer>

      {/* Token Modal */}
      <TokenValidatorModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        botMe={botMe}
        setBotMe={setBotMe}
      />
    </div>
  );
}
