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
