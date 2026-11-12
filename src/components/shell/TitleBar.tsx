import { useEffect, useState } from 'react';
import { Minus, Square, X, Copy, Download } from 'lucide-react';
import {
  subscribeDesktopWindowState,
  minimizeDesktopWindow,
  toggleMaximizeDesktopWindow,
  closeDesktopWindow,
  type DesktopWindowState
} from '../../services/desktopBridge';
import { isDesktopShell } from '../../lib/env';

/**
 * Custom Windows-style title bar (frameless shell).
 * - 34px tall, dark, drags the window (-webkit-app-region: drag)
 * - Window buttons are no-drag and wired to the desktop IPC bridge
 * - In a plain browser the buttons are hidden (the browser owns its chrome)
 */
export function TitleBar() {
  const desktop = isDesktopShell();
  const [state, setState] = useState<DesktopWindowState>({
    isMaximized: false,
    isMinimized: false,
    isFullScreen: false,
    isFocused: true
  });

  useEffect(() => {
    if (!desktop) return;
    return subscribeDesktopWindowState(setState);
  }, [desktop]);

  const toggleMaximize = () => {
    void toggleMaximizeDesktopWindow();
  };

  return (
    <div
      className="app-titlebar"
      onDoubleClick={() => {
        if (desktop) toggleMaximize();
      }}
    >
      <div className="app-titlebar-brand">
        <span className="app-titlebar-icon" aria-hidden="true">
          {/* Official Local Desk app icon — public/brand/local-desk-app-icon.svg (verbatim) */}
          <svg width="16" height="16" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="ld-tb-bg" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#142C23" />
                <stop offset="100%" stopColor="#0A1712" />
              </linearGradient>
              <linearGradient id="ld-tb-frame" x1="14" y1="14" x2="50" y2="50" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#34D399" />
                <stop offset="45%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
              <linearGradient id="ld-tb-sheet" x1="28" y1="14" x2="50" y2="36" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#F7FCF9" />
                <stop offset="100%" stopColor="#D1FAE5" />
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#ld-tb-bg)" />
            <rect x="4.75" y="4.75" width="54.5" height="54.5" rx="13.25" stroke="#34D399" strokeOpacity="0.24" strokeWidth="1.25" />
            <path d="M14 18C14 15.7909 15.7909 14 18 14H21C22.3807 14 23.5 15.1193 23.5 16.5V38C23.5 39.3807 24.6193 40.5 26 40.5H47.5C48.8807 40.5 50 41.6193 50 43V46C50 48.2091 48.2091 50 46 50H18C15.7909 50 14 48.2091 14 46V18Z" fill="url(#ld-tb-frame)" />
            <path d="M28 16.5C28 15.1193 29.1193 14 30.5 14H41L50 23V33.5C50 34.8807 48.8807 36 47.5 36H30.5C29.1193 36 28 34.8807 28 33.5V16.5Z" fill="url(#ld-tb-sheet)" />
            <path d="M41 14V20.5C41 21.8807 42.1193 23 43.5 23H50L41 14Z" fill="#10B981" />
            <rect x="32.5" y="23" width="11.5" height="2.6" rx="1.3" fill="#0D1F18" />
            <rect x="32.5" y="28" width="7.5" height="2.6" rx="1.3" fill="#059669" />
          </svg>
        </span>
        <span className="app-titlebar-label">Local Desk</span>
        <span className="app-titlebar-sep" aria-hidden="true" />
        <span className="app-titlebar-view" id="titlebar-view-label" />
      </div>

      <div className="app-titlebar-spacer" />

      {desktop && (
        <a
          className="app-titlebar-dl"
          href="https://github.com/r3haanM/LocalDesk/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
          title="Download the latest Windows installer"
          aria-label="Download Windows installer"
        >
          <Download size={14} strokeWidth={1.8} />
        </a>
      )}

      {desktop ? (
        <div className="app-titlebar-controls">
          <button
            type="button"
            className="tb-btn"
            title="Minimize"
            aria-label="Minimize window"
            onClick={() => void minimizeDesktopWindow()}
          >
            <Minus size={15} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="tb-btn"
            title={state.isMaximized ? 'Restore' : 'Maximize'}
            aria-label={state.isMaximized ? 'Restore window' : 'Maximize window'}
            onClick={() => void toggleMaximizeDesktopWindow()}
          >
            {state.isMaximized ? <Copy size={12} strokeWidth={1.8} /> : <Square size={12} strokeWidth={1.8} />}
          </button>
          <button
            type="button"
            className="tb-btn tb-close"
            title="Close"
            aria-label="Close window"
            onClick={() => void closeDesktopWindow()}
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>
      ) : (
        <div className="app-titlebar-controls app-titlebar-browser-hint">Browser preview</div>
      )}
    </div>
  );
}
