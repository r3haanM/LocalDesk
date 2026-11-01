import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ThemeSettings,
  ThemePreset,
  PdfToolDefinition,
  ToolCategory,
  UploadedFileItem,
  ActivityHistoryItem,
  UserAccountProfile
} from './types/pdf';
import { findToolById } from './data/toolsCatalog';
import { TopNav } from './components/TopNav';
import { VellumLogo } from './components/VellumLogo';
import { CommandPalette } from './components/CommandPalette';
import { ThemeAndAccountModal } from './components/ThemeAndAccountModal';
import { LegalModal } from './components/LegalModal';
import { HomeAndDirectory } from './components/HomeAndDirectory';
import type { EditorToolMode } from './components/Editor/PdfEditorWorkspace';

const PdfEditorWorkspace = React.lazy(() =>
  import('./components/Editor/PdfEditorWorkspace').then((m) => ({
    default: m.PdfEditorWorkspace
  }))
);
const AdaptiveToolWorkspace = React.lazy(() =>
  import('./components/Workspaces/AdaptiveToolWorkspace').then((m) => ({
    default: m.AdaptiveToolWorkspace
  }))
);
const BatchQueueWorkspace = React.lazy(() =>
  import('./components/Workspaces/BatchQueueWorkspace').then((m) => ({
    default: m.BatchQueueWorkspace
  }))
);

const STORAGE_THEME_KEY = 'vellum_theme_settings_v1';
const STORAGE_ACCOUNT_KEY = 'vellum_account_profile_v1';
const STORAGE_HISTORY_KEY = 'vellum_activity_history_v1';

export default function App() {
  // 1. Theme State (Obsidian default: Charcoal & Violet #17171D)
  const [theme, setTheme] = useState<ThemeSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Fallback
    }
    return {
      preset: 'obsidian',
      appearance: 'dark'
    };
  });

  // Apply theme to <html> element
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme.preset);

    let isDark = theme.appearance === 'dark';
    if (theme.appearance === 'system') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else if (theme.preset === 'ivory' && theme.appearance !== 'dark') {
      isDark = false;
    }

    root.classList.toggle('dark', isDark);

    if (theme.customAccent) {
      root.style.setProperty('--accent-primary', theme.customAccent);
    } else {
      root.style.removeProperty('--accent-primary');
    }

    try {
      localStorage.setItem(STORAGE_THEME_KEY, JSON.stringify(theme));
    } catch {
      // Ignore storage quota errors
    }
  }, [theme]);

  // 2. Optional User Account & Local Activity History
  const [account, setAccount] = useState<UserAccountProfile | null>(() => {
    try {
      const s = localStorage.getItem(STORAGE_ACCOUNT_KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });

  const [history, setHistory] = useState<ActivityHistoryItem[]>(() => {
    try {
      const s = localStorage.getItem(STORAGE_HISTORY_KEY);
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });

  const handleSaveAccount = (profile: UserAccountProfile | null) => {
    setAccount(profile);
    try {
      if (profile) localStorage.setItem(STORAGE_ACCOUNT_KEY, JSON.stringify(profile));
      else localStorage.removeItem(STORAGE_ACCOUNT_KEY);
    } catch {
      // Safe fallback
    }
  };

  const handleRecordHistory = useCallback(
    (
      toolId: string,
      toolName: string,
      fileName: string,
      outputFileName: string,
      outputSize: number,
      summary: string
    ) => {
      if (account && !account.saveHistory) return;
      const item: ActivityHistoryItem = {
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        toolId,
        toolName,
        fileName,
        outputFileName,
        timestamp: Date.now(),
        outputSize,
        summary
      };
      setHistory((prev) => {
        const next = [item, ...prev].slice(0, 30);
        try {
          localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(next));
        } catch {
          // Ignore
        }
        return next;
      });
    },
    [account]
  );

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_HISTORY_KEY);
    } catch {
      // Ignore
    }
  };

  // 3. Navigation & Active Workspace State
  const [activeView, setActiveView] = useState<'home' | 'workspace'>('home');
  const [activeCategory, setActiveCategory] = useState<ToolCategory | 'all'>('all');
  const [selectedTool, setSelectedTool] = useState<PdfToolDefinition | null>(null);
  const [preloadedFiles, setPreloadedFiles] = useState<UploadedFileItem[]>([]);
  const [batchInitialToolId, setBatchInitialToolId] = useState<string>('compress-pdf');

  // 4. Modals & Command Palette
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [legalDoc, setLegalDoc] = useState<'privacy' | 'terms' | null>(null);

  // Global Ctrl+K / Cmd+K Listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSelectTool = (tool: PdfToolDefinition, files: UploadedFileItem[] = []) => {
    setSelectedTool(tool);
    setPreloadedFiles(files);
    setActiveView('workspace');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateDirectory = (cat: ToolCategory | 'all' = 'all') => {
    setActiveCategory(cat);
    setActiveView('home');
    setTimeout(() => {
      document.getElementById('tool-directory')?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  };

  const handleOpenEditorDirect = () => {
    const edTool = findToolById('edit-pdf')!;
    handleSelectTool(edTool, []);
  };

  const getEditorInitialMode = (toolId?: string): EditorToolMode => {
    if (toolId === 'redact-pdf') return 'redact';
    if (toolId === 'annotate-pdf') return 'highlight';
    if (toolId === 'sign-pdf') return 'signature';
    return 'select';
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-theme-canvas text-theme-primary">
      {/* Top Bar Navigation */}
      <TopNav
        activeView={activeView === 'workspace' ? 'workspace' : 'home'}
        onNavigateHome={() => {
          setActiveView('home');
          setSelectedTool(null);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onNavigateDirectory={handleNavigateDirectory}
        onSelectTool={(tool) => handleSelectTool(tool, [])}
        onOpenEditorDirect={handleOpenEditorDirect}
        onOpenCommandPalette={() => setCmdPaletteOpen(true)}
        onOpenSettingsModal={() => setSettingsOpen(true)}
      />

      {/* Main Content Viewport */}
      <div className="flex-1">
        <AnimatePresence mode="wait">
          {activeView === 'home' || !selectedTool ? (
            <motion.div
              key="home-studio-view"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <HomeAndDirectory
                key={activeCategory}
                initialCategory={activeCategory}
                onSelectTool={handleSelectTool}
                onOpenEditorWithSample={handleOpenEditorDirect}
                onOpenCommandPalette={() => setCmdPaletteOpen(true)}
                onOpenSettingsModal={() => setSettingsOpen(true)}
                theme={theme}
                account={account}
              />
            </motion.div>
          ) : (
            <motion.div
              key={`workspace-${selectedTool.id}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <Suspense
                fallback={
                  <div className="min-h-[60vh] flex flex-col items-center justify-center p-12 text-center space-y-3">
                    <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-semibold text-theme-primary">
                      Loading {selectedTool.name} Workspace...
                    </p>
                  </div>
                }
              >
                {selectedTool.workspaceType === 'editor' ? (
                  <PdfEditorWorkspace
                    initialFile={preloadedFiles[0] || null}
                    initialMode={getEditorInitialMode(selectedTool.id)}
                    initialSidebarTab={
                      selectedTool.id === 'remove-objects'
                        ? 'objects'
                        : selectedTool.id === 'annotate-pdf'
                        ? 'annotations'
                        : 'objects'
                    }
                    onBack={() => {
                      setActiveView('home');
                      setSelectedTool(null);
                    }}
                    onRecordHistory={handleRecordHistory}
                  />
                ) : selectedTool.workspaceType === 'batch' ? (
                  <BatchQueueWorkspace
                    initialToolId={batchInitialToolId}
                    initialFiles={preloadedFiles}
                    onBack={() => {
                      setActiveView('home');
                      setSelectedTool(null);
                    }}
                    onRecordHistory={handleRecordHistory}
                  />
                ) : (
                  <AdaptiveToolWorkspace
                    key={selectedTool.id}
                    tool={selectedTool}
                    initialFiles={preloadedFiles}
                    onBack={() => {
                      setActiveView('home');
                      setSelectedTool(null);
                    }}
                    onSelectTool={(nextTool, carryFiles) => handleSelectTool(nextTool, carryFiles || [])}
                    onOpenInEditor={(file) => {
                      const ed = findToolById('edit-pdf')!;
                      handleSelectTool(ed, [file]);
                    }}
                    onOpenInBatchQueue={(toolId, files) => {
                      setBatchInitialToolId(toolId);
                      const batchTool = findToolById('batch-process')!;
                      handleSelectTool(batchTool, files);
                    }}
                    onRecordHistory={handleRecordHistory}
                  />
                )}
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Minimal Editorial Footer (Hidden inside full-screen Editor for maximum canvas space) */}
      {!(activeView === 'workspace' && selectedTool?.workspaceType === 'editor') && (
        <footer className="border-t border-theme-subtle bg-theme-surface py-10 px-6">
          <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-theme-secondary">
            <div className="space-y-1.5">
              <VellumLogo size="sm" />
              <p className="text-theme-muted">
                All-in-One Open PDF Productivity Platform &amp; Object Studio · 100% Free · Zero AI
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <button
                type="button"
                onClick={handleOpenEditorDirect}
                className="hover:text-theme-primary transition-colors cursor-pointer"
              >
                PDF Editor
              </button>
              <button
                type="button"
                onClick={() => handleNavigateDirectory('all')}
                className="hover:text-theme-primary transition-colors cursor-pointer"
              >
                Tool Directory
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="hover:text-theme-primary transition-colors cursor-pointer"
              >
                Themes &amp; Preferences
              </button>
              <button
                type="button"
                onClick={() => setLegalDoc('privacy')}
                className="hover:text-theme-primary transition-colors cursor-pointer"
              >
                Privacy Policy
              </button>
              <button
                type="button"
                onClick={() => setLegalDoc('terms')}
                className="hover:text-theme-primary transition-colors cursor-pointer"
              >
                Terms of Service
              </button>
              <a
                href="/api/export-source"
                download="vellum-pdf-toolkit-source.zip"
                className="text-theme-accent font-semibold hover:underline transition-colors cursor-pointer"
              >
                Export Source (.zip)
              </a>
              <span className="text-theme-muted font-mono">
                © {new Date().getFullYear()} Vellum Document Engineering
              </span>
            </div>
          </div>
        </footer>
      )}

      {/* Global Command Palette (Ctrl+K / Cmd+K) */}
      <CommandPalette
        isOpen={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onSelectTool={(tool) => handleSelectTool(tool, [])}
        onSelectThemePreset={(preset: ThemePreset) =>
          setTheme((prev) => ({
            ...prev,
            preset,
            appearance: preset === 'ivory' ? 'light' : 'dark'
          }))
        }
        onLoadSampleIntoEditor={handleOpenEditorDirect}
      />

      {/* Theme Presets & Optional Account Modal */}
      <ThemeAndAccountModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onUpdateTheme={setTheme}
        account={account}
        onSaveAccount={handleSaveAccount}
        history={history}
        onClearHistory={handleClearHistory}
      />

      {/* Privacy Policy & Terms Modal */}
      <LegalModal docType={legalDoc} onClose={() => setLegalDoc(null)} />
    </div>
  );
}
