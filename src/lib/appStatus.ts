/**
 * Lightweight app status bus — the shell status bar subscribes to this while
 * workspaces publish what they are doing ("3 files processing…", "Ready").
 */
export type AppStatusListener = (text: string, busy: boolean) => void;

let listener: AppStatusListener | null = null;

export function setAppStatus(text: string, busy = false): void {
  try {
    listener?.(text, busy);
  } catch {
    // Non-fatal
  }
}

export function onAppStatus(fn: AppStatusListener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
