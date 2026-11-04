import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Terminal, ChevronDown, ChevronUp } from 'lucide-react';

interface VibeCodedOverlayProps {
  visible: boolean;
}

export const VibeCodedOverlay: React.FC<VibeCodedOverlayProps> = ({ visible }) => {
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
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Expand creator signature"
              className="group flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#091812]/95 border-2 border-[#10B981]/60 hover:border-[#34D399] text-[#ECFDF5] shadow-[0_12px_32px_-8px_rgba(4,13,10,0.85),0_0_20px_-4px_rgba(16,185,129,0.3)] backdrop-blur-md transition-all cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981] animate-pulse" />
              <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-[#A7F3D0]">
                VibeCoded · <span className="text-[#ECFDF5]">Rehan Mumtaz</span>
              </span>
              <ChevronUp className="w-3.5 h-3.5 text-[#34D399] group-hover:-translate-y-0.5 transition-transform" />
            </button>
          ) : (
            <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-[#0D231A] via-[#091812] to-[#06100C] border-2 border-[#10B981]/70 hover:border-[#34D399] shadow-[0_18px_42px_-10px_rgba(2,10,7,0.92),0_0_28px_-6px_rgba(16,185,129,0.35)] backdrop-blur-md transition-all duration-200">
              {/* Top Emerald Highlight Bar */}
              <div className="h-1 w-full bg-gradient-to-r from-[#059669] via-[#10B981] to-[#34D399]" />

              {/* Subtle Radial Emerald Glow */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full bg-[#10B981]/15 blur-xl group-hover:bg-[#34D399]/25 transition-colors"
              />

              <div className="relative z-10 px-4 py-3 flex items-center gap-3.5">
                {/* Forest & Emerald Monogram Emblem */}
                <div className="w-9 h-9 rounded-lg bg-[#10B981]/15 border border-[#10B981]/50 flex items-center justify-center text-[#34D399] shadow-inner shrink-0">
                  <Terminal className="w-4 h-4 stroke-[2.2]" />
                </div>

                {/* Signature Typography */}
                <div className="pr-1">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-[#34D399]" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-[#34D399]">
                      VibeCoded by
                    </span>
                  </div>
                  <div className="text-sm font-extrabold tracking-tight text-[#ECFDF5] leading-snug">
                    Rehan Mumtaz
                  </div>
                </div>

                {/* Collapse Toggle Button */}
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  title="Minimize signature badge"
                  aria-label="Minimize signature badge"
                  className="ml-1 p-1 rounded-md text-[#6EE7B7]/60 hover:text-[#ECFDF5] hover:bg-[#10B981]/20 transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
