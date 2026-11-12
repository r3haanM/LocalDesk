import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PdfToolDefinition } from '../types/pdf';
import { PDF_TOOLS_CATALOG, getOutputExtensionLabel } from '../data/toolsCatalog';
import { ToolIcon } from './IconMapper';
import { Search, X, CornerDownLeft } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTool: (tool: PdfToolDefinition) => void;
}

const ESSENTIAL_TOOL_IDS = [
  'edit-pdf',
  'pdf-to-word',
  'word-to-pdf',
  'merge-pdf',
  'split-pdf',
  'compress-pdf',
  'pdf-to-excel',
  'protect-pdf'
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTool
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const normalizedQuery = query.trim().toLowerCase();

  const displayedTools = useMemo(() => {
    if (!normalizedQuery) {
      return ESSENTIAL_TOOL_IDS.map((id) =>
        PDF_TOOLS_CATALOG.find((t) => t.id === id)
      ).filter((t): t is PdfToolDefinition => Boolean(t));
    }

    const tokens = normalizedQuery.split(/\s+/);
    return PDF_TOOLS_CATALOG.filter((tool) => {
      const haystack = [
        tool.name,
        tool.shortName,
        tool.categoryLabel,
        ...tool.keywords
      ]
        .join(' ')
        .toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
    }).slice(0, 8);
  }, [normalizedQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(
      `[data-cmd-index="${selectedIndex}"]`
    );
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          displayedTools.length ? (prev + 1) % displayedTools.length : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          displayedTools.length
            ? (prev - 1 + displayedTools.length) % displayedTools.length
            : 0
        );
      } else if (e.key === 'Enter' && displayedTools[selectedIndex]) {
        e.preventDefault();
        onSelectTool(displayedTools[selectedIndex]);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, displayedTools, selectedIndex, onSelectTool, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Quick Tool Search"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-black/55 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{
              type: 'spring',
              stiffness: 420,
              damping: 32,
              mass: 0.75
            }}
            className="w-full max-w-lg bg-theme-surface border border-theme-subtle rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Minimal Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-theme-subtle">
              <Search className="w-4 h-4 text-theme-accent shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools (e.g. Edit, Word, Merge, Compress)..."
                className="w-full bg-transparent text-sm text-theme-primary placeholder:text-theme-muted focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 rounded-md text-theme-muted hover:text-theme-primary transition-colors cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-2 py-0.5 text-[11px] font-mono text-theme-muted bg-theme-elevated rounded-md hover:text-theme-primary transition-colors cursor-pointer"
              >
                ESC
              </button>
            </div>

            {/* Clean Results List (No divider lines, only essential info) */}
            <div ref={listRef} className="p-2 max-h-[340px] overflow-y-auto">
              <div className="px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider text-theme-muted">
                {normalizedQuery ? 'Matching Tools' : 'Quick Access'}
              </div>

              {displayedTools.length === 0 ? (
                <div className="py-10 px-4 text-center">
                  <p className="text-sm font-medium text-theme-secondary">
                    No tools found for &ldquo;{query}&rdquo;
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {displayedTools.map((tool, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        data-cmd-index={idx}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => {
                          onSelectTool(tool);
                          onClose();
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-theme-elevated text-theme-primary'
                            : 'text-theme-secondary hover:bg-theme-elevated/60 hover:text-theme-primary'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                              isSelected
                                ? 'bg-theme-accent text-white'
                                : 'bg-theme-elevated text-theme-accent'
                            }`}
                          >
                            <ToolIcon name={tool.iconName} className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-semibold truncate">
                            {tool.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono text-theme-muted">
                            {tool.acceptedExtensions[0]} → {getOutputExtensionLabel(tool)}
                          </span>
                          <CornerDownLeft
                            className={`w-3.5 h-3.5 transition-opacity ${
                              isSelected
                                ? 'opacity-100 text-theme-accent'
                                : 'opacity-0'
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

