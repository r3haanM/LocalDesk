import React, { useState } from 'react';
import {
  ThemeSettings,
  ThemePreset,
  AppearanceMode,
  UserAccountProfile,
  ActivityHistoryItem
} from '../types/pdf';
import { X, Sun, Moon, Monitor, Trash2, Check, UserCheck } from 'lucide-react';

interface ThemeAndAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeSettings;
  onUpdateTheme: (next: ThemeSettings) => void;
  account: UserAccountProfile | null;
  onSaveAccount: (profile: UserAccountProfile | null) => void;
  history: ActivityHistoryItem[];
  onClearHistory: () => void;
}

const PRESET_CARDS: Array<{
  id: ThemePreset;
  name: string;
  subtitle: string;
  hex: string;
  swatchBg: string;
  swatchAccent: string;
}> = [
  {
    id: 'obsidian',
    name: 'Obsidian',
    subtitle: 'Charcoal & Violet',
    hex: '#17171D',
    swatchBg: '#17171D',
    swatchAccent: '#7C3AED'
  },
  {
    id: 'midnight',
    name: 'Midnight',
    subtitle: 'Navy & Blue',
    hex: '#101C32',
    swatchBg: '#101C32',
    swatchAccent: '#3B82F6'
  },
  {
    id: 'evergreen',
    name: 'Evergreen',
    subtitle: 'Forest & Emerald',
    hex: '#14251F',
    swatchBg: '#14251F',
    swatchAccent: '#10B981'
  },
  {
    id: 'ivory',
    name: 'Ivory',
    subtitle: 'Warm Neutral & Plum',
    hex: '#F3F0EB',
    swatchBg: '#F3F0EB',
    swatchAccent: '#7E22CE'
  }
];

export const ThemeAndAccountModal: React.FC<ThemeAndAccountModalProps> = ({
  isOpen,
  onClose,
  theme,
  onUpdateTheme,
  account,
  onSaveAccount,
  history,
  onClearHistory
}) => {
  const [emailInput, setEmailInput] = useState(account?.email || '');
  const [nameInput, setNameInput] = useState(account?.name || '');
  const [saveHistoryPref, setSaveHistoryPref] = useState(account?.saveHistory ?? true);
  const [syncMessage, setSyncMessage] = useState('');

  if (!isOpen) return null;

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.includes('@')) {
      setSyncMessage('Please enter a valid email address.');
      return;
    }
    const nextProfile: UserAccountProfile = {
      email: emailInput.trim(),
      name: nameInput.trim() || emailInput.split('@')[0],
      saveHistory: saveHistoryPref,
      persistSettings: true,
      createdAt: Date.now()
    };
    onSaveAccount(nextProfile);

    try {
      await fetch('/api/account/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: nextProfile.email,
          name: nextProfile.name,
          themePreset: theme.preset,
          appearance: theme.appearance,
          saveHistory: nextProfile.saveHistory
        })
      });
      setSyncMessage('Workspace preferences synchronized.');
    } catch {
      setSyncMessage('Preferences saved to local workspace storage.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Appearance, Themes, and Workspace Account Settings"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto bg-theme-elevated border border-theme-strong rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme-subtle">
          <div>
            <h2 className="text-lg font-bold text-theme-primary">
              Studio Appearance &amp; Workspace Preferences
            </h2>
            <p className="text-xs text-theme-secondary">
              Customize theme presets, contrast modes, and optional workspace synchronization.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className="p-1.5 rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-muted cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* 1. Theme Presets */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-theme-primary">01. Theme Presets</h3>
              <span className="text-xs font-mono text-theme-muted">
                Active: {theme.preset.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {PRESET_CARDS.map((p) => {
                const active = theme.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onUpdateTheme({ ...theme, preset: p.id })}
                    className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                      active
                        ? 'border-theme-accent bg-theme-surface ring-1 ring-violet-500/40'
                        : 'border-theme-subtle bg-theme-surface hover:border-theme-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-4 h-4 rounded border border-white/20 inline-block"
                          style={{ backgroundColor: p.swatchBg }}
                        />
                        <span
                          className="w-4 h-4 rounded inline-block"
                          style={{ backgroundColor: p.swatchAccent }}
                        />
                      </div>
                      {active && <Check className="w-4 h-4 text-theme-accent" />}
                    </div>
                    <div className="text-sm font-bold text-theme-primary">{p.name}</div>
                    <div className="text-xs text-theme-secondary">{p.subtitle}</div>
                    <div className="text-[11px] font-mono text-theme-muted mt-1">{p.hex}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Appearance Mode & Custom Accent */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-theme-subtle">
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-theme-primary">02. Luminance Mode</h3>
              <div className="flex items-center gap-1.5 p-1 bg-theme-muted rounded-lg">
                {(
                  [
                    { id: 'dark', label: 'Dark', icon: Moon },
                    { id: 'light', label: 'Light', icon: Sun },
                    { id: 'system', label: 'System', icon: Monitor }
                  ] as Array<{ id: AppearanceMode; label: string; icon: any }>
                ).map((item) => {
                  const Icon = item.icon;
                  const active = theme.appearance === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onUpdateTheme({ ...theme, appearance: item.id })}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-theme-elevated text-theme-primary shadow-xs'
                          : 'text-theme-secondary hover:text-theme-primary'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-theme-primary">03. Custom Accent Override</h3>
              <div className="flex items-center gap-2">
                {['#7C3AED', '#2563EB', '#059669', '#9333EA', '#E11D48', '#D97706'].map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => onUpdateTheme({ ...theme, customAccent: hex })}
                    aria-label={`Set accent color ${hex}`}
                    className={`w-7 h-7 rounded-lg border transition-transform cursor-pointer ${
                      theme.customAccent === hex ? 'scale-110 border-white ring-2 ring-violet-400' : 'border-black/20'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
                {theme.customAccent && (
                  <button
                    type="button"
                    onClick={() => onUpdateTheme({ ...theme, customAccent: undefined })}
                    className="text-xs text-theme-secondary hover:text-theme-primary underline ml-2 cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* 3. Optional Account & Equal Guest Access */}
          <section className="pt-4 border-t border-theme-subtle space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-theme-primary">
                  04. Optional Workspace Profile (100% Free — Equal Guest &amp; Account Capabilities)
                </h3>
                <p className="text-xs text-theme-secondary mt-0.5">
                  Guests have full unrestricted access to every PDF tool and editor feature. Creating an optional profile simply synchronizes your theme settings and optional activity log.
                </p>
              </div>
              {account && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveAccount(null);
                    setSyncMessage('Signed out to anonymous guest mode.');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-rose-500 border border-theme-subtle rounded-lg hover:bg-theme-muted whitespace-nowrap cursor-pointer"
                >
                  Switch to Guest Mode
                </button>
              )}
            </div>

            <form onSubmit={handleAccountSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Display Name (optional)"
                className="px-3 py-2 text-xs rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary focus:outline-none focus:border-theme-accent"
              />
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Email for preference sync"
                className="px-3 py-2 text-xs rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary focus:outline-none focus:border-theme-accent"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-theme-accent rounded-lg hover:opacity-95 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                {account ? 'Update Synced Profile' : 'Save Optional Profile'}
              </button>
            </form>

            <div className="flex items-center justify-between text-xs text-theme-secondary">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveHistoryPref}
                  onChange={(e) => setSaveHistoryPref(e.target.checked)}
                  className="rounded border-theme-subtle"
                />
                <span>Keep local session activity log in browser storage</span>
              </label>
              {syncMessage && <span className="text-theme-accent font-medium">{syncMessage}</span>}
            </div>
          </section>

          {/* 4. Recent Activity Log */}
          <section className="pt-4 border-t border-theme-subtle space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-theme-primary">
                05. Local Processing History ({history.length})
              </h3>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="inline-flex items-center gap-1 text-xs text-rose-500 hover:underline cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Local History
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-theme-muted py-3">
                No recent operations recorded in this browser session. Guest documents are never retained on any server.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto divide-y divide-theme-subtle border border-theme-subtle rounded-lg bg-theme-surface">
                {history.map((item) => (
                  <div key={item.id} className="px-3.5 py-2 flex items-center justify-between text-xs">
                    <div className="min-w-0">
                      <span className="font-semibold text-theme-primary">{item.toolName}</span>
                      <span className="mx-1.5 text-theme-muted">·</span>
                      <span className="text-theme-secondary truncate">{item.outputFileName}</span>
                    </div>
                    <span className="font-mono text-theme-muted tabular-nums shrink-0 ml-3">
                      {(item.outputSize / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
