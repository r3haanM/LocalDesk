import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ChevronDown, ChevronUp, Code2, ShieldCheck, ArrowUpRight } from 'lucide-react';

export const GITHUB_REPO_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GITHUB_REPO_URL) ||
  'https://github.com/r3haanM/LocalDesk';

export const SOCIAL_LINKS = {
  github: GITHUB_REPO_URL,
  linkedin: 'https://linkedin.com/in/rehan-mumtaz',
  x: 'https://x.com/cyber_cypher007',
  medium: 'https://rehanmumtaz.medium.com'
};

interface VibeCodedOverlayProps {
  visible: boolean;
  repoUrl?: string;
}

const GitHubMarkSvg: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

export const VibeCodedOverlay: React.FC<VibeCodedOverlayProps> = ({
  visible,
  repoUrl = GITHUB_REPO_URL
}) => {
  // Default to minimized state
  const [collapsed, setCollapsed] = useState(true);

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          key="vibecoded-signature-overlay"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          aria-label="Creator signature overlay"
          className="fixed bottom-5 right-5 z-40 select-none"
        >
          {collapsed ? (
            <div className="group relative overflow-hidden inline-flex items-center rounded-full backdrop-blur-xl vibecoded-pill transition-all duration-300">
              {/* Main Pill Expand Trigger */}
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                title="Expand Rehan Mumtaz signature card"
                className="relative inline-flex items-center gap-2 pl-3.5 pr-2.5 py-2 cursor-pointer focus-visible:outline-none"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 dark:bg-emerald-400" />
                </span>
                <Sparkles className="w-3.5 h-3.5 vibecoded-icon shrink-0" />
                <span className="text-xs font-semibold tracking-tight vibecoded-text-primary">
                  VibeCoded by <span className="font-extrabold vibecoded-text-accent">Rehan Mumtaz</span>
                </span>
                <ChevronUp className="w-3.5 h-3.5 vibecoded-icon opacity-85 group-hover:-translate-y-0.5 transition-transform duration-200" />
              </button>

              {/* Direct GitHub Repository Link Button inside Minimized Pill */}
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open Rehan Mumtaz GitHub Repository"
                aria-label="Open Rehan Mumtaz GitHub Repository"
                className="group/gh relative inline-flex items-center gap-1 pl-2.5 pr-3 py-2 border-l vibecoded-divider vibecoded-icon hover:bg-emerald-500/10 transition-all duration-300 cursor-pointer"
              >
                <GitHubMarkSvg className="w-3.5 h-3.5 transition-transform duration-300 ease-out group-hover/gh:scale-110 group-hover/gh:-rotate-6" />
                <ArrowUpRight className="w-3 h-3 opacity-80 transition-all duration-300 ease-out group-hover/gh:opacity-100 group-hover/gh:translate-x-0.5 group-hover/gh:-translate-y-0.5" />
              </a>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl backdrop-blur-xl vibecoded-card min-w-[284px]">
              {/* Top Emerald-Teal Accent Bar */}
              <div className="h-[3px] w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400" />

              {/* Subtle Corner Glow */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-10 -right-10 w-24 h-24 rounded-full bg-emerald-500/15 blur-2xl"
              />

              <div className="relative px-4 py-3.5 flex items-start justify-between gap-3.5">
                <div className="flex items-center gap-3">
                  {/* Left Icon Badge */}
                  <div className="w-10 h-10 rounded-xl vibecoded-badge flex items-center justify-center shrink-0">
                    <Code2 className="w-5 h-5 stroke-[2.2]" />
                  </div>

                  {/* Center Copy & GitHub Link */}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 vibecoded-icon shrink-0" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] vibecoded-text-accent">
                        VibeCoded Signature
                      </span>
                    </div>
                    <a
                      href={repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Visit Rehan Mumtaz on GitHub"
                      className="group/author inline-flex items-center gap-1 text-sm font-extrabold tracking-tight vibecoded-text-primary hover:opacity-85 leading-tight mt-0.5 transition-opacity cursor-pointer"
                    >
                      <span>Rehan Mumtaz</span>
                      <ArrowUpRight className="w-3.5 h-3.5 vibecoded-icon opacity-85 transition-transform duration-300 ease-out group-hover/author:translate-x-0.5 group-hover/author:-translate-y-0.5 group-hover/author:opacity-100" />
                    </a>
                    <div className="text-[11px] vibecoded-text-secondary mt-0.5">
                      Offline PDF &amp; Document Studio
                    </div>
                  </div>
                </div>

                {/* Minimize Button */}
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Minimize signature card"
                  title="Minimize"
                  className="p-1 rounded-lg vibecoded-text-secondary hover:bg-emerald-500/10 transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Card Footer with Social Icons & Direct GitHub Repository Action */}
              <div className="relative px-4 py-2 border-t vibecoded-divider flex items-center justify-between gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1.5 vibecoded-text-secondary font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 vibecoded-icon shrink-0" />
                  <span>100% Local</span>
                </span>

                <div className="inline-flex items-center gap-1.5">
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="GitHub Repository"
                    aria-label="GitHub Repository"
                    className="p-1.5 rounded-lg vibecoded-action-btn transition-all duration-200 cursor-pointer"
                  >
                    <GitHubMarkSvg className="w-3.5 h-3.5 vibecoded-icon" />
                  </a>
                  <a
                    href={SOCIAL_LINKS.x}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="X (Twitter)"
                    aria-label="X (Twitter)"
                    className="p-1.5 rounded-lg vibecoded-action-btn transition-all duration-200 cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-3.5 h-3.5 vibecoded-icon">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                  <a
                    href={SOCIAL_LINKS.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="LinkedIn"
                    aria-label="LinkedIn"
                    className="p-1.5 rounded-lg vibecoded-action-btn transition-all duration-200 cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-3.5 h-3.5 vibecoded-icon">
                      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                    </svg>
                  </a>
                  <a
                    href={SOCIAL_LINKS.medium}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Medium"
                    aria-label="Medium"
                    className="p-1.5 rounded-lg vibecoded-action-btn transition-all duration-200 cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-3.5 h-3.5 vibecoded-icon">
                      <path d="M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zm7.42 0c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
