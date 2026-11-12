declare global {
  interface Window {
    localDeskEnv?: {
      shell?: string;
    };
  }
}

// Detects whether the app is running inside the Electron desktop shell rather than a web browser.
export function isDesktopShell(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.localDeskEnv?.shell === 'desktop' ||
    /electron/i.test(navigator.userAgent) // fallback only
  );
}

/**
 * Detects the PACKAGED Windows desktop app specifically (frameless shell).
 * Stricter than isDesktopShell(): requires our preload marker AND the file:
 * protocol — so Electron-based browsers/preview panes (user-agent contains
 * "Electron") are correctly excluded from the native shell experience.
 */
export function isNativeDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.localDeskEnv?.shell === 'desktop' && location.protocol === 'file:'
  );
}

export function isRestrictedRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__LOCAL_DESK_RESTRICTED__);
}
