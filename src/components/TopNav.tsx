import React, { useState } from 'react';
import { ToolCategory, PdfToolDefinition } from '../types/pdf';
import { PDF_TOOLS_CATALOG } from '../data/toolsCatalog';
import { ToolIcon } from './IconMapper';
import { VellumLogo } from './VellumLogo';
import { Menu, X } from 'lucide-react';

interface TopNavProps {
  activeView: 'home' | 'directory' | 'workspace';
  onNavigateHome: () => void;
  onNavigateDirectory: (category?: ToolCategory | 'all') => void;
  onSelectTool: (tool: PdfToolDefinition) => void;
  onOpenEditorDirect: () => void;
  onOpenCommandPalette?: () => void;
  onOpenSettingsModal?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onNavigateHome,
  onNavigateDirectory,
  onSelectTool,
  onOpenEditorDirect
}) => {
  const [megaMenuOpen, setMegaMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="relative z-40 border-b border-theme-subtle bg-theme-surface/95 backdrop-blur-md">
      {/* Strict 3-Zone Top Bar Contract */}
      <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8 px-6 py-4">
        {/* Zone 1: Brand wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setMegaMenuOpen(false);
            onNavigateHome();
          }}
          className="group whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-violet-500 rounded"
        >
          <VellumLogo size="md" />
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-8 text-sm font-medium text-theme-secondary"
        >
          <a
            href="#tools"
            onClick={(e) => {
              e.preventDefault();
              setMegaMenuOpen(!megaMenuOpen);
            }}
            className="hover:text-theme-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            12 Core Tools
          </a>
          <a
            href="#pdf-editor"
            onClick={(e) => {
              e.preventDefault();
              setMegaMenuOpen(false);
              onOpenEditorDirect();
            }}
            className="hover:text-theme-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            PDF Editor
          </a>
          <a
            href="#organize"
            onClick={(e) => {
              e.preventDefault();
              setMegaMenuOpen(false);
              onNavigateDirectory('organize-pdf');
            }}
            className="hover:text-theme-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Organize
          </a>
          <a
            href="#security"
            onClick={(e) => {
              e.preventDefault();
              setMegaMenuOpen(false);
              onNavigateDirectory('pdf-security');
            }}
            className="hover:text-theme-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Security
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMegaMenuOpen(false);
              onOpenEditorDirect();
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-theme-accent rounded-lg hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
          >
            Open PDF Editor
          </button>

          <button
            type="button"
            aria-label="Toggle Mobile Navigation"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg border border-theme-subtle text-theme-primary hover:bg-theme-muted"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Curated 12-Tool Quick Launcher Drawer */}
      {megaMenuOpen && (
        <div
          onMouseLeave={() => setMegaMenuOpen(false)}
          className="border-t border-theme-subtle bg-theme-elevated shadow-2xl"
        >
          <div className="max-w-[1440px] mx-auto px-6 py-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-theme-subtle">
              <div>
                <h2 className="text-sm font-bold text-theme-primary">
                  Curated 12-Tool Document Studio
                </h2>
                <p className="text-xs text-theme-secondary mt-0.5">
                  100% free with zero paywalls, zero watermarks, and full guest parity.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMegaMenuOpen(false);
                  onNavigateDirectory('all');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-theme-accent border border-theme-subtle rounded-lg hover:bg-theme-muted whitespace-nowrap shrink-0 cursor-pointer"
              >
                View Studio Grid
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {PDF_TOOLS_CATALOG.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    setMegaMenuOpen(false);
                    onSelectTool(tool);
                  }}
                  className="flex items-center gap-3 p-3 rounded-lg bg-theme-surface border border-theme-subtle hover:border-theme-accent text-left transition-colors cursor-pointer"
                >
                  <div className="p-2 rounded-md bg-theme-elevated text-theme-accent shrink-0">
                    <ToolIcon name={tool.iconName} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-theme-primary truncate">
                      {tool.name}
                    </div>
                    <div className="text-[11px] text-theme-muted truncate">
                      {tool.categoryLabel}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-theme-subtle bg-theme-elevated px-6 py-5 space-y-3">
          <div className="flex flex-col space-y-2 text-sm font-medium">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateHome();
              }}
              className="text-left py-2 text-theme-primary border-b border-theme-subtle"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenEditorDirect();
              }}
              className="text-left py-2 text-theme-primary border-b border-theme-subtle"
            >
              Professional 2D PDF Editor
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateDirectory('all');
              }}
              className="text-left py-2 text-theme-primary border-b border-theme-subtle"
            >
              All 12 Core Tools
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateDirectory('organize-pdf');
              }}
              className="text-left py-2 text-theme-secondary"
            >
              Organize &amp; Reorder Pages
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateDirectory('pdf-security');
              }}
              className="text-left py-2 text-theme-secondary"
            >
              Security &amp; Batch Queue
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
