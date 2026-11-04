import React, { useEffect, useState } from 'react';
import {
  minimizeDesktopWindow,
  toggleMaximizeDesktopWindow,
  closeDesktopWindow,
  getDesktopWindowState,
  subscribeDesktopWindowState
} from '../services/desktopBridge';
import { SlidersHorizontal } from 'lucide-react';

interface DesktopTitleBarProps {
  activeDocumentTitle?: string;
  onOpenPreferences?: () => void;
  onNavigateHome?: () => void;
}

export const DesktopTitleBar: React.FC<DesktopTitleBarProps> = ({
  activeDocumentTitle,
  onOpenPreferences,
  onNavigateHome
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    let mounted = true;
    getDesktopWindowState().then((state) => {
      if (mounted) {
        setIsMaximized(state.isMaximized);
        setIsFocused(state.isFocused);
      }
    });

    const unsubscribe = subscribeDesktopWindowState((state) => {
      if (mounted) {
        setIsMaximized(state.isMaximized);
        setIsFocused(state.isFocused);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handleMinimize = async () => {
    await minimizeDesktopWindow();
  };

  const handleToggleMaximize = async () => {
    const nextMax = await toggleMaximizeDesktopWindow();
    setIsMaximized(nextMax);
  };

  const handleClose = async () => {
    await closeDesktopWindow();
  };

  return (
    <div
      role="banner"
      aria-label="Application Window Title Bar"
      onDoubleClick={handleToggleMaximize}
      className={`app-titlebar-drag sticky top-0 z-50 h-8 w-full select-none flex items-center justify-between pl-3 pr-0 bg-[#0A1712] border-b border-emerald-500/15 transition-colors ${
        isFocused ? 'text-[#ECFDF5]' : 'text-[#A7F3D0]/65'
      }`}
    >
      {/* Left: Crisp Application Icon + Local Desk Identity */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onNavigateHome}
          title="Local Desk — Home"
          className="app-titlebar-no-drag inline-flex items-center gap-2 py-0.5 pr-1.5 rounded hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-1 focus-visible:outline-emerald-400"
        >
          <img
            src="/favicon-32x32.png"
            srcSet="/favicon-32x32.png 1x, /favicon-64x64.png 2x"
            alt=""
            width={18}
            height={18}
            draggable={false}
            className="w-[18px] h-[18px] rounded-[4px] shrink-0 object-contain"
          />
          <span className="text-[12px] font-semibold tracking-tight text-[#ECFDF5] whitespace-nowrap">
            Local Desk
          </span>
        </button>

        {activeDocumentTitle && (
          <>
            <span className="text-emerald-500/35 text-xs select-none" aria-hidden="true">
              —
            </span>
            <span className="text-[11px] font-medium text-emerald-100/70 truncate max-w-[260px] sm:max-w-[440px]">
              {activeDocumentTitle}
            </span>
          </>
        )}
      </div>

      {/* Right: Optional Workspace Preferences Trigger + Standard Windows Caption Controls */}
      <div className="app-titlebar-no-drag flex items-center h-full shrink-0">
        {onOpenPreferences && (
          <button
            type="button"
            onClick={onOpenPreferences}
            title="Workspace Preferences (Appearance & Smooth Scrolling)"
            aria-label="Workspace Preferences"
            className="h-8 px-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-100/75 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Preferences</span>
          </button>
        )}

        <div className="h-3.5 w-px bg-emerald-500/15 mx-0.5" aria-hidden="true" />

        {/* Minimize Button */}
        <button
          type="button"
          onClick={handleMinimize}
          aria-label="Minimize"
          title="Minimize"
          className="w-[46px] h-8 inline-flex items-center justify-center text-emerald-50/80 hover:text-white hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer focus-visible:outline-none"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            shapeRendering="crispEdges"
            aria-hidden="true"
          >
            <path d="M1 5H9" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>

        {/* Maximize / Restore Button (updates icon accurately between states) */}
        <button
          type="button"
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? 'Restore Down' : 'Maximize'}
          title={isMaximized ? 'Restore Down' : 'Maximize'}
          className="w-[46px] h-8 inline-flex items-center justify-center text-emerald-50/80 hover:text-white hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer focus-visible:outline-none"
        >
          {isMaximized ? (
            /* Windows Restore Down Icon (Overlapping Dual Window Glyph) */
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              shapeRendering="crispEdges"
              aria-hidden="true"
            >
              <path d="M3 1.5H8.5V7H7" stroke="currentColor" strokeWidth="1" />
              <rect x="1.5" y="3" width="5.5" height="5.5" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            /* Windows Maximize Icon (Crisp 1px Single Window Box) */
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              shapeRendering="crispEdges"
              aria-hidden="true"
            >
              <rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>

        {/* Close Button (Windows Red #E81123 Hover & #C50F1F Pressed State) */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          title="Close (Alt+F4)"
          className="w-[46px] h-8 inline-flex items-center justify-center text-emerald-50/80 hover:text-white hover:bg-[#E81123] active:bg-[#C50F1F] transition-colors cursor-pointer focus-visible:outline-none"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};
