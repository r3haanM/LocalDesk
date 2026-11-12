/**
 * Minimal toast bus — ToastHost renders these bottom-right (never alert()).
 */
export type ToastKind = 'info' | 'success' | 'error';
export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type ToastListener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let listeners: ToastListener[] = [];
let seq = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function publish(): void {
  for (const fn of listeners) {
    try {
      fn(toasts);
    } catch {
      // Non-fatal
    }
  }
}

export function toast(message: string, kind: ToastKind = 'info'): void {
  const id = ++seq;
  toasts = [...toasts, { id, kind, message }].slice(-5);
  publish();
  timers.set(
    id,
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      timers.delete(id);
      publish();
    }, 3800)
  );
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  toasts = toasts.filter((t) => t.id !== id);
  publish();
}

export function onToasts(fn: ToastListener): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
