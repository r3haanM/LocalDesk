import React, { useState } from 'react';
import {
  ThemeSettings,
  AppearanceMode,
  UserAccountProfile,
  ActivityHistoryItem
} from '../types/pdf';
import { X, Sun, Moon, Monitor, Trash2, UserCheck, ShieldCheck } from 'lucide-react';

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

const APPEARANCE_OPTIONS: Array<{
  id: AppearanceMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'system', label: 'System', icon: Monitor }
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
  const [statusMessage, setStatusMessage] = useState('');

  if (!isOpen) return null;

  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.includes('@')) {
      setStatusMessage('Please enter a valid email address.');
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
    setStatusMessage('Preferences saved locally on this device.');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Preferences"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-theme-elevated border border-theme-strong rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme-subtle">
          <div>
            <h2 className="text-lg font-bold text-theme-primary">
              Workspace Preferences
            </h2>
            <p className="text-xs text-theme-secondary">
              Configure appearance and local session preferences stored exclusively on your device.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Preferences"
            className="p-1.5 rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-muted cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 1. Appearance */}
          <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-theme-primary">Appearance</h3>
              <p className="text-xs text-theme-secondary">
                Choose how Local Desk looks across your workspace.
              </p>
            </div>

            <div
              role="radiogroup"
              aria-label="Appearance"
              className="inline-flex items-center gap-1 p-1 bg-theme-muted border border-theme-subtle rounded-lg shrink-0"
            >
              {APPEARANCE_OPTIONS.map((item) => {
                const Icon = item.icon;
                const active = theme.appearance === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onUpdateTheme({ appearance: item.id })}
                    className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-3.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-theme-elevated text-theme-primary border border-theme-strong shadow-xs'
                        : 'text-theme-secondary hover:text-theme-primary border border-transparent'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${active ? 'text-theme-accent' : ''}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Optional Local Profile */}
          <section className="pt-5 border-t border-theme-subtle space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-theme-primary">
                  Local Workspace Profile
                </h3>
                <p className="text-xs text-theme-secondary mt-0.5">
                  All PDF tools and editor capabilities are unrestricted. An optional local profile labels your workspace and retains your preferences on this device without cloud transmission.
                </p>
              </div>
              {account && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveAccount(null);
                    setStatusMessage('Switched to anonymous local session.');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-rose-500 border border-theme-subtle rounded-lg hover:bg-theme-muted whitespace-nowrap cursor-pointer"
                >
                  Clear Local Profile
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
                placeholder="Local contact email"
                className="px-3 py-2 text-xs rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary focus:outline-none focus:border-theme-accent"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-theme-accent rounded-lg hover:opacity-95 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                {account ? 'Update Local Profile' : 'Save Local Profile'}
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-theme-secondary">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveHistoryPref}
                  onChange={(e) => setSaveHistoryPref(e.target.checked)}
                  className="rounded border-theme-subtle accent-emerald-600"
                />
                <span>Keep local session activity log in device storage</span>
              </label>
              {statusMessage ? (
                <span className="text-theme-accent font-medium">{statusMessage}</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-theme-muted">
                  <ShieldCheck className="w-3.5 h-3.5 text-theme-accent" />
                  Stored locally only
                </span>
              )}
            </div>
          </section>

          {/* 3. Recent Activity Log */}
          <section className="pt-5 border-t border-theme-subtle space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-theme-primary">
                Local Processing History ({history.length})
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
              <p className="text-xs text-theme-muted py-2">
                No recent operations recorded in this browser session. Documents and preferences remain strictly on your device.
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
