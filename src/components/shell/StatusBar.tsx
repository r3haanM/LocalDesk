import { useEffect, useState } from 'react';
import { onAppStatus } from '../../lib/appStatus';

/**
 * Bottom status bar (26px): left = live status ("Ready", "3 files processing…"),
 * right = version + engine status. Never displays URLs.
 */
export function StatusBar() {
  const [text, setText] = useState('Ready');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onAppStatus((t, b) => {
      setText(t);
      setBusy(b);
    });
  }, []);

  return (
    <footer className="shell-statusbar">
      <div className="shell-status-left">
        <span className={`shell-status-dot${busy ? ' busy' : ''}`} aria-hidden="true" />
        <span className="shell-status-text" role="status" aria-live="polite">
          {busy ? `${text}…` : text}
        </span>
      </div>
      <div className="shell-status-right mono">
        <span className="shell-status-engine">Engine: PDF.js + WASM OCR · 100% Local</span>
        <span className="shell-status-sep" aria-hidden="true">·</span>
        <span>{`v${__APP_VERSION__}`}</span>
      </div>
    </footer>
  );
}
