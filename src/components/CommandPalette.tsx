import React, { useEffect, useState, useRef } from 'react';
import { PdfToolDefinition, ThemePreset } from '../types/pdf';
import { PDF_TOOLS_CATALOG } from '../data/toolsCatalog';
import { ToolIcon } from './IconMapper';
import { Search, X, CornerDownLeft, Sparkles, Palette } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTool: (tool: PdfToolDefinition) => void;
  onSelectThemePreset: (preset: ThemePreset) => void;
  onLoadSampleIntoEditor: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTool,
  onSelectThemePreset,
  onLoadSampleIntoEditor
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  const normalizedQuery = query.trim().toLowerCase();

  const matchingTools = PDF_TOOLS_CATALOG.filter((tool) => {
    if (!normalizedQuery) return true;
    const haystack = [
      tool.name,
      tool.shortName,
      tool.description,
      tool.categoryLabel,
      ...tool.keywords
    ]
      .join(' ')
      .toLowerCase();

    const tokens = normalizedQuery.split(/\s+/);
    return tokens.every((tok) => haystack.includes(tok));
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          matchingTools.length ? (prev + 1) % matchingTools.length : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          matchingTools.length
            ? (prev - 1 + matchingTools.length) % matchingTools.length
            : 0
        );
      } else if (e.key === 'Enter' && matchingTools[selectedIndex]) {
        e.preventDefault();
        onSelectTool(matchingTools[selectedIndex]);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, matchingTools, selectedIndex, onSelectTool, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette and Global Tool Search"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-theme-elevated border border-theme-strong rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-theme-subtle">
          <Search className="w-4 h-4 text-theme-accent shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 35+ PDF tools by name or task (e.g., 'hide objects', 'redact', 'merge', 'docx')..."
            className="w-full bg-transparent text-sm text-theme-primary placeholder:text-theme-muted focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 text-theme-muted hover:text-theme-primary cursor-pointer"
              aria-label="Clear search query"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-xs font-mono text-theme-muted border border-theme-subtle rounded hover:text-theme-primary cursor-pointer"
          >
            ESC
          </button>
        </div>

        {/* Quick Actions Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-theme-surface border-b border-theme-subtle text-xs">
          <div className="flex items-center gap-2">
            <span className="text-theme-muted">Quick Launch:</span>
            <button
              type="button"
              onClick={() => {
                onLoadSampleIntoEditor();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-theme-muted text-theme-primary hover:bg-theme-accent hover:text-white transition-colors font-medium cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Open Editor with Sample PDF
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-theme-muted" />
            <span className="text-theme-muted">Theme:</span>
            {(['obsidian', 'midnight', 'evergreen', 'ivory'] as ThemePreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onSelectThemePreset(preset)}
                className="px-2 py-0.5 rounded capitalize text-theme-secondary hover:text-theme-primary hover:bg-theme-muted transition-colors cursor-pointer"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto divide-y divide-theme-subtle">
          {matchingTools.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-2">
              <p className="text-sm font-semibold text-theme-primary">
                No tools matched &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-theme-secondary">
                Try searching for &ldquo;merge&rdquo;, &ldquo;remove objects&rdquo;, &ldquo;redact&rdquo;, &ldquo;ocr&rdquo;, or &ldquo;excel&rdquo;.
              </p>
            </div>
          ) : (
            matchingTools.map((tool, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    onSelectTool(tool);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between gap-4 px-4 py-3 text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-theme-muted' : 'hover:bg-theme-surface'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-accent shrink-0 mt-0.5">
                      <ToolIcon name={tool.iconName} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-theme-primary truncate">
                          {tool.name}
                        </span>
                        <span className="text-xs text-theme-muted" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs text-theme-secondary truncate">
                          {tool.categoryLabel}
                        </span>
                      </div>
                      <p className="text-xs text-theme-secondary line-clamp-1 mt-0.5">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-theme-muted shrink-0">
                    <span>Open</span>
                    <CornerDownLeft className="w-3.5 h-3.5" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer keyboard hints */}
        <div className="px-4 py-2.5 bg-theme-surface border-t border-theme-subtle flex items-center justify-between text-xs text-theme-muted">
          <div className="flex items-center gap-4">
            <span>↑↓ Navigate</span>
            <span>·</span>
            <span>↵ Launch Tool</span>
            <span>·</span>
            <span>ESC Close</span>
          </div>
          <span className="font-mono tabular-nums">{matchingTools.length} tools available</span>
        </div>
      </div>
    </div>
  );
};
