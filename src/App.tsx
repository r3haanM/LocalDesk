import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ThemeSettings,
  AppearanceMode,
  PdfToolDefinition,
  ToolCategory,
  UploadedFileItem,
  ActivityHistoryItem,
  UserAccountProfile
} from './types/pdf';
import { findToolById, routeFileToDefaultTool } from './data/toolsCatalog';
import { TopNav } from './components/TopNav';
import { LocalDeskLogo } from './components/Brand/LocalDeskLogo';
import { CommandPalette } from './components/CommandPalette';
import { LegalModal } from './components/LegalModal';
import { DesktopReleaseModal } from './components/DesktopReleaseModal';
import { ThemeAndAccountModal } from './components/ThemeAndAccountModal';
import { HomeAndDirectory } from './components/HomeAndDirectory';
import { StudioLaunchTransition } from './components/StudioLaunchTransition';
import { VibeCodedOverlay, SOCIAL_LINKS } from './components/VibeCodedOverlay';
import {
  openNativeFileDialogIfAvailable,
  createUploadedFileItemFromBytes,
  purgeTemporaryWorkspaceBuffers
} from './services/desktopBridge';
import { isDesktopShell } from './lib/env';
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

const STORAGE_THEME_KEY = 'local_desk_theme_settings_v2';
const STORAGE_ACCOUNT_KEY = 'local_desk_account_profile_v1';
const STORAGE_HISTORY_KEY = 'local_desk_activity_history_v1';

export default function App() {
  // 1. Appearance Mode State (Local Desk Forest & Emerald permanent identity)
  const [theme, setTheme] = useState<ThemeSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed &&
          (parsed.appearance === 'dark' ||
            parsed.appearance === 'light' ||
            parsed.appearance === 'system')
        ) {
          return {
            appearance: parsed.appearance,
            smoothScrolling: parsed.smoothScrolling !== false
          };
        }
      }
    } catch {
      // Fallback
    }
    return {
      appearance: 'dark',
      smoothScrolling: true
    };
  });

  // Apply appearance mode, smooth scrolling preference & unified window title
  useEffect(() => {
    document.title = 'Local Desk · All-in-One PDF & Document Studio';
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    root.style.removeProperty('--accent-primary');

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyAppearance = () => {
      const isDark =
        theme.appearance === 'dark' ||
        (theme.appearance === 'system' && mediaQuery.matches);
      root.classList.toggle('dark', isDark);
      root.classList.toggle('smooth-scroll-enabled', theme.smoothScrolling !== false);
    };

    applyAppearance();

    try {
      localStorage.setItem(STORAGE_THEME_KEY, JSON.stringify(theme));
    } catch {
      // Ignore storage quota errors
    }

    if (theme.appearance === 'system') {
      const handleSystemChange = () => applyAppearance();
      mediaQuery.addEventListener('change', handleSystemChange);
      return () => mediaQuery.removeEventListener('change', handleSystemChange);
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
  const [studioLaunching, setStudioLaunching] = useState<boolean>(false);

  // 4. Modals & Command Palette
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState<boolean>(false);
  const [legalDoc, setLegalDoc] = useState<'privacy' | 'terms' | null>(null);
  const [desktopReleaseOpen, setDesktopReleaseOpen] = useState<boolean>(false);
  const [preferencesOpen, setPreferencesOpen] = useState<boolean>(false);
  const isDesktop = isDesktopShell();

  const handleOpenDesktopRelease = useCallback(() => {
    if (isDesktopShell()) return;
    setDesktopReleaseOpen(true);
  }, []);

  const handleSelectTool = useCallback(
    (tool: PdfToolDefinition, files: UploadedFileItem[] = []) => {
      setSelectedTool(tool);
      setPreloadedFiles(files);
      setStudioLaunching(true);
      setActiveView('workspace');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  // Global Ctrl+K / Cmd+K, Ctrl+, / Cmd+,, and Ctrl+O / Cmd+O Listeners + Native File Association Listener
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setPreferencesOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        const nativeFiles = await openNativeFileDialogIfAvailable({ multiple: true });
        if (nativeFiles && nativeFiles.length > 0) {
          e.preventDefault();
          const targetTool =
            nativeFiles.length > 1 && nativeFiles.every((f) => f.name.toLowerCase().endsWith('.pdf'))
              ? findToolById('merge-pdf')!
              : routeFileToDefaultTool(nativeFiles[0].name);
          handleSelectTool(targetTool, nativeFiles);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // Subscribe to Windows native file-association, File -> Open Document menu, or drag-onto-exe launches
    const cleanups: Array<() => void> = [];
    if (typeof window !== 'undefined' && window.localDeskNative?.onFilesOpenedFromOS) {
      const unsub = window.localDeskNative.onFilesOpenedFromOS(async (payloads) => {
        try {
          if (!Array.isArray(payloads) || payloads.length === 0) return;
          const items: UploadedFileItem[] = [];
          for (const entry of payloads) {
            if (entry?.bytes && entry?.name) {
              const item = await createUploadedFileItemFromBytes(
                entry.bytes,
                entry.name,
                entry.filePath || (entry as any).path
              );
              items.push(item);
            }
          }
          if (items.length > 0) {
            const targetTool =
              items.length > 1 && items.every((f) => f.name.toLowerCase().endsWith('.pdf'))
                ? findToolById('merge-pdf')!
                : routeFileToDefaultTool(items[0].name);
            handleSelectTool(targetTool, items);
          }
        } catch {
          // Ignore malformed external payload
        }
      });
      if (typeof unsub === 'function') cleanups.push(unsub);
    } else if (typeof window !== 'undefined' && window.localDeskNative?.onOsOpenFile) {
      const unsub = window.localDeskNative.onOsOpenFile(async (filePath: string) => {
        try {
          const readRes = await window.localDeskNative?.openRecentPath?.(filePath);
          if (readRes?.bytes && readRes.name) {
            const item = await createUploadedFileItemFromBytes(
              readRes.bytes,
              readRes.name,
              readRes.path
            );
            const targetTool = routeFileToDefaultTool(item.name);
            handleSelectTool(targetTool, [item]);
          }
        } catch {
          // Ignore malformed external payload
        }
      });
      if (typeof unsub === 'function') cleanups.push(unsub);
    }

    const onBeforeUnload = () => {
      purgeTemporaryWorkspaceBuffers();
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeunload', onBeforeUnload);
      cleanups.forEach((fn) => fn());
    };
  }, [handleSelectTool]);

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

  const isFullScreenEditor =
    activeView === 'workspace' &&
    selectedTool?.workspaceType === 'editor' &&
    !studioLaunching;

  return (
    <div
      id="top"
      className={`min-h-screen flex flex-col bg-theme-canvas text-theme-primary ${
        isFullScreenEditor ? 'lg:h-screen lg:max-h-screen lg:overflow-hidden' : ''
      }`}
    >
      {/* Top Bar Navigation (Single Native Windows Title Bar sits above; no duplicate in-app title bar) */}
      <TopNav
        activeView={activeView === 'workspace' ? 'workspace' : 'home'}
        onNavigateHome={() => {
          setActiveView('home');
          setSelectedTool(null);
          window.scrollTo({ top: 0, behavior: theme.smoothScrolling !== false ? 'smooth' : 'auto' });
        }}
        onNavigateDirectory={handleNavigateDirectory}
        onSelectTool={(tool) => handleSelectTool(tool, [])}
        onOpenEditorDirect={handleOpenEditorDirect}
        appearance={theme.appearance}
        onUpdateAppearance={(mode: AppearanceMode) =>
          setTheme((prev) => ({ ...prev, appearance: mode }))
        }
        onOpenCommandPalette={() => setCmdPaletteOpen(true)}
        onOpenDesktopRelease={!isDesktop ? handleOpenDesktopRelease : undefined}
      />

      {/* Main Content Viewport */}
      <div className={`flex-1 ${isFullScreenEditor ? 'flex flex-col min-h-0 overflow-hidden' : ''}`}>
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
                onOpenDesktopRelease={!isDesktop ? handleOpenDesktopRelease : undefined}
                onUpdateAppearance={(mode: AppearanceMode) =>
                  setTheme((prev) => ({ ...prev, appearance: mode }))
                }
                theme={theme}
                account={account}
              />
            </motion.div>
          ) : studioLaunching ? (
            <motion.div
              key={`studio-launch-${selectedTool.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.16 }}
            >
              <StudioLaunchTransition
                toolName={selectedTool.name}
                onComplete={() => setStudioLaunching(false)}
              />
            </motion.div>
          ) : (
            <motion.div
              key={`workspace-${selectedTool.id}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className={isFullScreenEditor ? 'flex-1 flex flex-col min-h-0 overflow-hidden' : ''}
            >
              <Suspense
                fallback={
                  <StudioLaunchTransition
                    toolName={selectedTool.name}
                  />
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
              <LocalDeskLogo size="sm" />
              <p className="text-theme-muted">
                Local Desk · All-in-One PDF &amp; Document Studio · 100% Local · Zero Telemetry
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-5">
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
                onClick={() => setPreferencesOpen(true)}
                className="hover:text-theme-primary transition-colors cursor-pointer"
              >
                Preferences
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

              <div className="inline-flex items-center gap-2 border-l border-theme-subtle pl-4">
                <a
                  href={SOCIAL_LINKS.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub"
                  title="GitHub · r3haanM/LocalDesk"
                  className="p-1.5 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-accent hover:border-theme-accent transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-3.5 h-3.5">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                </a>
                <a
                  href={SOCIAL_LINKS.x}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="X (Twitter)"
                  title="X · @cyber_cypher007"
                  className="p-1.5 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-accent hover:border-theme-accent transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-3.5 h-3.5">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href={SOCIAL_LINKS.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                  title="LinkedIn · Rehan Mumtaz"
                  className="p-1.5 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-accent hover:border-theme-accent transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-3.5 h-3.5">
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                  </svg>
                </a>
                <a
                  href={SOCIAL_LINKS.medium}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Medium"
                  title="Medium · Rehan Mumtaz"
                  className="p-1.5 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-accent hover:border-theme-accent transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-3.5 h-3.5">
                    <path d="M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zm7.42 0c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z" />
                  </svg>
                </a>
              </div>

              <span className="text-theme-muted font-mono">
                © {new Date().getFullYear()} Local Desk · VibeCoded by Rehan Mumtaz
              </span>
            </div>
          </div>
        </footer>
      )}

      {/* Floating Bottom-Right Forest Green & Emerald Signature Card (Shown on Home, Hidden in PDF Editor) */}
      <VibeCodedOverlay visible={activeView === 'home' || !selectedTool} />

      {/* Global Command Palette (Ctrl+K / Cmd+K) */}
      <CommandPalette
        isOpen={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onSelectTool={(tool) => handleSelectTool(tool, [])}
      />

      {/* Windows Desktop Installer & Offline Audit Modal (Web Browser Only) */}
      {!isDesktop && (
        <DesktopReleaseModal
          isOpen={desktopReleaseOpen}
          onClose={() => setDesktopReleaseOpen(false)}
        />
      )}

      {/* Workspace Preferences Modal (Appearance, Smooth Scrolling & Local Profile) */}
      <ThemeAndAccountModal
        isOpen={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        theme={theme}
        onUpdateTheme={(next) => setTheme(next)}
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
