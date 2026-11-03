import React, { useState } from 'react';
import { ToolCategory, PdfToolDefinition, AppearanceMode } from '../types/pdf';
import { PDF_TOOLS_CATALOG } from '../data/toolsCatalog';
import { ToolIcon } from './IconMapper';
import { LocalDeskLogo } from './Brand/LocalDeskLogo';
import { AnimatedThemeToggle } from './AnimatedThemeToggle';
import { Menu, X, Download } from 'lucide-react';

interface TopNavProps {
  activeView: 'home' | 'directory' | 'workspace';
  onNavigateHome: () => void;
  onNavigateDirectory: (category?: ToolCategory | 'all') => void;
  onSelectTool: (tool: PdfToolDefinition) => void;
  onOpenEditorDirect: () => void;
  appearance: AppearanceMode;
  onUpdateAppearance: (mode: AppearanceMode) => void;
  onOpenCommandPalette?: () => void;
  onOpenDesktopRelease?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onNavigateHome,
  onNavigateDirectory,
  onSelectTool,
  onOpenEditorDirect,
  appearance,
  onUpdateAppearance,
  onOpenDesktopRelease
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
          className="group whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-emerald-500 rounded"
        >
          <LocalDeskLogo size="md" />
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
            All Tools
          </a>
          <a
            href="#conversions"
            onClick={(e) => {
              e.preventDefault();
              setMegaMenuOpen(false);
              onNavigateDirectory('convert-from-pdf');
            }}
            className="hover:text-theme-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Conversions
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
            href="#security"
            onClick={(e) => {
              e.preventDefault();
              setMegaMenuOpen(false);
              onNavigateDirectory('pdf-security');
            }}
            className="hover:text-theme-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Security &amp; Batch
          </a>
        </nav>

        {/* Zone 3: Direct Theme Icon + Windows App + 1 Primary Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <AnimatedThemeToggle
            appearance={appearance}
            onToggle={onUpdateAppearance}
          />

          {onOpenDesktopRelease && (
            <button
              type="button"
              onClick={() => {
                setMegaMenuOpen(false);
                onOpenDesktopRelease();
              }}
              title="Download Local Desk for Windows (64-bit) & Offline Privacy Audit"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-theme-primary bg-theme-elevated border border-theme-subtle hover:border-theme-accent rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-theme-accent" />
              <span>Windows App</span>
            </button>
          )}

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

      {/* Quick Launcher Drawer */}
      {megaMenuOpen && (
        <div
          onMouseLeave={() => setMegaMenuOpen(false)}
          className="border-t border-theme-subtle bg-theme-elevated shadow-2xl"
        >
          <div className="max-w-[1440px] mx-auto px-6 py-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-theme-subtle">
              <div>
                <h2 className="text-sm font-bold text-theme-primary">
                  Local Desk PDF Studio &amp; Conversion Suite
                </h2>
                <p className="text-xs text-theme-secondary mt-0.5">
                  Direct 2D canvas editing, PDF to Office, Images &amp; Web, and Formats to PDF—100% local &amp; private.
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
                View Full Studio Grid
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 max-h-[65vh] overflow-y-auto pr-1">
              {PDF_TOOLS_CATALOG.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    setMegaMenuOpen(false);
                    onSelectTool(tool);
                  }}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-theme-surface border border-theme-subtle hover:border-theme-accent text-left transition-colors cursor-pointer"
                >
                  <div className="p-2 rounded-md bg-theme-elevated text-theme-accent shrink-0">
                    <ToolIcon name={tool.iconName} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-theme-primary truncate">
                      {tool.name}
                    </div>
                    <div className="text-[11px] text-theme-muted truncate">
                      {tool.conversionSubcategoryLabel || tool.categoryLabel}
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
                onNavigateDirectory('convert-from-pdf');
              }}
              className="text-left py-2 text-theme-primary border-b border-theme-subtle"
            >
              Conversion Suite
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
