import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ChevronDown, ChevronUp, Code2, ArrowUpRight } from 'lucide-react';

export const GITHUB_REPO_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GITHUB_REPO_URL) ||
  'https://github.com/rehanmumtaz/local-desk';

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
  // Default to minimized state as requested
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
            <div className="group relative overflow-hidden inline-flex items-center rounded-full backdrop-blur-xl bg-gradient-to-r from-[#0A2218]/75 via-[#0E3324]/60 to-[#071811]/75 text-[#ECFDF5] border border-emerald-400/35 shadow-[0_12px_30px_-6px_rgba(2,12,8,0.75),0_0_22px_-4px_rgba(16,185,129,0.28)] hover:border-emerald-400/65 hover:from-[#0C2A1E]/85 hover:via-[#12402D]/70 hover:to-[#091E15]/85 hover:shadow-[0_14px_34px_-6px_rgba(2,12,8,0.85),0_0_28px_-2px_rgba(16,185,129,0.45)] transition-all duration-300">
              {/* Subtle translucent diagonal glass sheen */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-emerald-500/12 via-transparent to-teal-300/18"
              />

              {/* Main Pill Expand Trigger */}
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                title="Expand VibeCoded by Rehan Mumtaz signature card"
                className="relative inline-flex items-center gap-2.5 pl-3.5 pr-2.5 py-2 cursor-pointer focus-visible:outline-none"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold tracking-tight text-emerald-50/95">
                  VibeCoded by <span className="font-extrabold text-emerald-300">Rehan Mumtaz</span>
                </span>
                <ChevronUp className="w-3.5 h-3.5 text-emerald-400/80 group-hover:text-emerald-300 group-hover:-translate-y-0.5 transition-transform duration-200" />
              </button>

              {/* Direct GitHub Repository Link Button inside Minimized Pill */}
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open Rehan Mumtaz GitHub Repository"
                aria-label="Open Rehan Mumtaz GitHub Repository"
                className="group/gh relative inline-flex items-center gap-1 pl-2.5 pr-3 py-2 border-l border-emerald-400/25 text-emerald-300/85 hover:text-white hover:bg-emerald-500/20 transition-all duration-300 cursor-pointer"
              >
                <GitHubMarkSvg className="w-3.5 h-3.5 transition-transform duration-300 ease-out group-hover/gh:scale-110 group-hover/gh:-rotate-6" />
                <ArrowUpRight className="w-3 h-3 opacity-70 transition-all duration-300 ease-out group-hover/gh:opacity-100 group-hover/gh:translate-x-0.5 group-hover/gh:-translate-y-0.5" />
              </a>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl backdrop-blur-xl bg-gradient-to-br from-[#0D281D]/75 via-[#081A13]/65 to-[#05100C]/80 text-[#ECFDF5] border border-emerald-400/35 shadow-[0_20px_45px_-10px_rgba(2,10,7,0.82),0_0_32px_-6px_rgba(16,185,129,0.3)] min-w-[285px]">
              {/* Top Translucent Emerald Signature Accent Bar */}
              <div className="h-1 w-full bg-gradient-to-r from-emerald-500/80 via-teal-300/90 to-emerald-600/80" />

              {/* Diagonal Glassmorphic Gradient Wash */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-emerald-500/12 via-transparent to-teal-300/15"
              />

              {/* Subtle Ambient Emerald Corner Glow */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full bg-emerald-400/20 blur-2xl"
              />

              <div className="relative px-4 py-3.5 flex items-start gap-3.5">
                {/* Left Icon Badge */}
                <div className="w-10 h-10 rounded-xl backdrop-blur-md bg-emerald-500/15 border border-emerald-400/35 flex items-center justify-center text-emerald-300 shrink-0 shadow-inner mt-0.5">
                  <Code2 className="w-5 h-5 stroke-[2.2]" />
                </div>

                {/* Center Copy & Interactive GitHub Repository Link */}
                <div className="min-w-0 flex-1 pr-1">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-emerald-400">
                      VibeCoded by
                    </span>
                  </div>
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Visit Rehan Mumtaz on GitHub"
                    className="group/author inline-flex items-center gap-1.5 text-[15px] font-extrabold tracking-tight text-white hover:text-emerald-300 leading-snug mt-0.5 transition-colors cursor-pointer"
                  >
                    <span>Rehan Mumtaz</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 opacity-75 transition-transform duration-300 ease-out group-hover/author:translate-x-0.5 group-hover/author:-translate-y-0.5 group-hover/author:opacity-100" />
                  </a>
                  <div className="text-[10px] font-mono text-emerald-200/75 mt-0.5 flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Local Desk · PDF &amp; Document Studio</span>
                  </div>

                  {/* Interactive GitHub Repository Pill Button */}
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/repo mt-2.5 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/22 border border-emerald-400/25 hover:border-emerald-400/55 text-[11px] font-mono font-semibold text-emerald-200 hover:text-white transition-all duration-300 cursor-pointer"
                  >
                    <GitHubMarkSvg className="w-3.5 h-3.5 text-emerald-300 transition-transform duration-300 ease-out group-hover/repo:scale-110 group-hover/repo:-rotate-6" />
                    <span>GitHub Repository</span>
                    <ArrowUpRight className="w-3 h-3 text-emerald-300 transition-transform duration-300 ease-out group-hover/repo:translate-x-0.5 group-hover/repo:-translate-y-0.5" />
                  </a>
                </div>

                {/* Minimize Button */}
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Minimize signature card"
                  title="Minimize"
                  className="self-start p-1.5 rounded-lg text-emerald-300/75 hover:text-white hover:bg-emerald-500/20 border border-transparent hover:border-emerald-400/30 transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
