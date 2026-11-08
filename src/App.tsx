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
import { findToolById } from './data/toolsCatalog';
import { TopNav } from './components/TopNav';
import { LocalDeskLogo } from './components/Brand/LocalDeskLogo';
import { CommandPalette } from './components/CommandPalette';
import { LegalModal } from './components/LegalModal';
import { DesktopReleaseModal } from './components/DesktopReleaseModal';
import { ThemeAndAccountModal } from './components/ThemeAndAccountModal';
import { HomeAndDirectory } from './components/HomeAndDirectory';
import { StudioLaunchTransition } from './components/StudioLaunchTransition';
import { VibeCodedOverlay } from './components/VibeCodedOverlay';
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
    document.title = 'Local Desk — All-in-One PDF & Document Studio';
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

  // Global Ctrl+K / Cmd+K and Ctrl+O / Cmd+O Listeners + Native File Association Listener
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        const nativeFiles = await openNativeFileDialogIfAvailable({ multiple: true });
        if (nativeFiles && nativeFiles.length > 0) {
          e.preventDefault();
          const edTool = findToolById('edit-pdf')!;
          handleSelectTool(edTool, nativeFiles);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // Subscribe to Windows native file-association or drag-onto-exe launches
    let unsubscribeNativeOpen: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.localDeskNative?.onOsOpenFile) {
      unsubscribeNativeOpen = window.localDeskNative.onOsOpenFile(async (filePath: string) => {
        try {
          const readRes = await window.localDeskNative?.openRecentPath(filePath);
          if (readRes?.bytes && readRes.name) {
            const item = await createUploadedFileItemFromBytes(
              readRes.bytes,
              readRes.name,
              readRes.path
            );
            const edTool = findToolById('edit-pdf')!;
            handleSelectTool(edTool, [item]);
          }
        } catch {
          // Ignore malformed external payload
        }
      });
    }

    const onBeforeUnload = () => {
      purgeTemporaryWorkspaceBuffers();
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (unsubscribeNativeOpen) unsubscribeNativeOpen();
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
                Local Desk — All-in-One PDF &amp; Document Studio · 100% Local Execution · Zero Cloud Telemetry
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
              {!isDesktop && (
                <>
                  <button
                    type="button"
                    onClick={handleOpenDesktopRelease}
                    className="text-theme-accent font-semibold hover:underline transition-colors cursor-pointer"
                  >
                    Windows Desktop (.exe)
                  </button>
                  <a
                    href="/api/export-source"
                    download="local-desk-pdf-toolkit-source.zip"
                    className="text-theme-secondary hover:text-theme-primary transition-colors cursor-pointer"
                  >
                    Export Source (.zip)
                  </a>
                </>
              )}
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
