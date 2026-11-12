import { useState } from 'react';
import { isNativeDesktop } from './lib/env';
import WebStudio from './WebStudio';
import DesktopStudio from './components/shell/DesktopStudio';

/**
 * Root chooser:
 * - Packaged Windows desktop exe (file: protocol + preload marker) → same
 *   product UI, but frameless with a custom ZCode-style title bar.
 * - Browser / demo / preview (http:) → the exact same product UI with the
 *   browser's own chrome.
 * The UI is identical in both — only the window top bar differs.
 */
export default function App() {
  const [native] = useState(() => isNativeDesktop());
  return native ? <DesktopStudio /> : <WebStudio />;
}
