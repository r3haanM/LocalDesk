import { useState } from 'react';
import { Moon, Sun, Monitor, Trash2, FileText, Info } from 'lucide-react';
import type { ThemeSettings, AppearanceMode, ActivityHistoryItem, UserAccountProfile } from '../../types/pdf';
import { isDesktopShell } from '../../lib/env';

/**
 * Settings view: appearance, behavior, local account, activity history,
 * legal documents and about — rendered as an in-app panel (not a modal).
 */
export function SettingsView({
  theme,
  onUpdateTheme,
  account,
  onSaveAccount,
  history,
  onClearHistory,
  onOpenLegal,
  onPurgeTemp
}: {
  theme: ThemeSettings;
  onUpdateTheme: (next: ThemeSettings) => void;
  account: UserAccountProfile | null;
  onSaveAccount: (profile: UserAccountProfile | null) => void;
  history: ActivityHistoryItem[];
  onClearHistory: () => void;
  onOpenLegal: (doc: 'privacy' | 'terms') => void;
  onPurgeTemp: () => void;
}) {
  const [name, setName] = useState(account?.name || '');
  const [email, setEmail] = useState(account?.email || '');
  const desktop = isDesktopShell();

  const appearanceOptions: Array<{ mode: AppearanceMode; label: string; icon: React.ReactNode }> = [
    { mode: 'dark', label: 'Dark', icon: <Moon size={14} /> },
    { mode: 'light', label: 'Light', icon: <Sun size={14} /> },
    { mode: 'system', label: 'System', icon: <Monitor size={14} /> }
  ];

  return (
    <div className="settings-view">
      <h1 className="view-title">Settings</h1>
      <p className="view-sub">Preferences are stored locally on this machine.</p>

      <section className="settings-panel">
        <h3 className="settings-panel-title">Appearance</h3>
        <div className="settings-segmented" role="group" aria-label="Appearance mode">
          {appearanceOptions.map((opt) => (
            <button
              key={opt.mode}
              type="button"
              className={`settings-seg-btn${theme.appearance === opt.mode ? ' active' : ''}`}
              onClick={() => onUpdateTheme({ ...theme, appearance: opt.mode })}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={theme.smoothScrolling !== false}
            onChange={(e) => onUpdateTheme({ ...theme, smoothScrolling: e.target.checked })}
          />
          Smooth scrolling
        </label>
      </section>

      <section className="settings-panel">
        <h3 className="settings-panel-title">Activity history</h3>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={!!account?.saveHistory}
            onChange={(e) =>
              onSaveAccount({
                name: account?.name || name || 'Local user',
                email: account?.email || email || 'local@device',
                saveHistory: e.target.checked,
                persistSettings: true,
                createdAt: account?.createdAt || Date.now()
              })
            }
          />
          Record tool activity on this machine
        </label>
        {history.length > 0 ? (
          <>
            <ul className="settings-history">
              {history.slice(0, 8).map((h) => (
                <li key={h.id} className="settings-history-row">
                  <span className="settings-history-name">{h.toolName}</span>
                  <span className="settings-history-file">{h.fileName}</span>
                  <span className="mono settings-history-date">
                    {new Date(h.timestamp).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="settings-btn" onClick={onClearHistory}>
              <Trash2 size={13} />
              Clear history
            </button>
          </>
        ) : (
          <p className="settings-muted">No recorded activity yet.</p>
        )}
      </section>

      <section className="settings-panel">
        <h3 className="settings-panel-title">Local account (optional)</h3>
        <div className="settings-fields">
          <label className="settings-field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              placeholder="Local user"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>Email</span>
            <input
              type="text"
              value={email}
              placeholder="local@device"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </div>
        <div className="settings-btn-row">
          <button
            type="button"
            className="settings-btn primary"
            onClick={() =>
              onSaveAccount({
                name: name || 'Local user',
                email: email || 'local@device',
                saveHistory: account?.saveHistory ?? true,
                persistSettings: true,
                createdAt: account?.createdAt || Date.now()
              })
            }
          >
            Save profile
          </button>
          {account && (
            <button type="button" className="settings-btn" onClick={() => onSaveAccount(null)}>
              Remove profile
            </button>
          )}
        </div>
      </section>

      <section className="settings-panel">
        <h3 className="settings-panel-title">Legal</h3>
        <div className="settings-btn-row">
          <button type="button" className="settings-btn" onClick={() => onOpenLegal('privacy')}>
            <FileText size={13} />
            Privacy Policy
          </button>
          <button type="button" className="settings-btn" onClick={() => onOpenLegal('terms')}>
            <FileText size={13} />
            Terms of Service
          </button>
        </div>
      </section>

      <section className="settings-panel">
        <h3 className="settings-panel-title">
          <Info size={13} />
          About
        </h3>
        <p className="settings-muted mono">
          Local Desk v{__APP_VERSION__} · Electron shell: {desktop ? 'desktop (frameless)' : 'browser'} ·
          Engine: PDF.js + WASM OCR · 100% local processing
        </p>
      </section>
    </div>
  );
}
