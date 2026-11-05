import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ChevronDown, ChevronUp, Code2 } from 'lucide-react';

interface VibeCodedOverlayProps {
  visible: boolean;
}

export const VibeCodedOverlay: React.FC<VibeCodedOverlayProps> = ({ visible }) => {
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
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Expand VibeCoded by Rehan Mumtaz signature card"
              className="group inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-gradient-to-r from-[#0A1F17] via-[#0D281E] to-[#0A1F17] text-[#ECFDF5] border border-emerald-500/40 shadow-[0_12px_30px_-6px_rgba(2,12,8,0.85),0_0_20px_-4px_rgba(16,185,129,0.35)] hover:border-emerald-400/70 hover:shadow-[0_14px_34px_-6px_rgba(2,12,8,0.9),0_0_26px_-2px_rgba(16,185,129,0.5)] transition-all cursor-pointer"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold tracking-tight text-emerald-50/90">
                VibeCoded by <span className="font-extrabold text-emerald-300">Rehan Mumtaz</span>
              </span>
              <ChevronUp className="w-3.5 h-3.5 text-emerald-400/80 group-hover:text-emerald-300 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          ) : (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0D261C] via-[#091A13] to-[#06120D] text-[#ECFDF5] border border-emerald-500/45 shadow-[0_20px_45px_-10px_rgba(2,10,7,0.92),0_0_32px_-6px_rgba(16,185,129,0.35)] min-w-[265px]">
              {/* Top Emerald Signature Accent Bar */}
              <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />

              {/* Subtle Ambient Emerald Glow */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full bg-emerald-500/15 blur-2xl"
              />

              <div className="relative px-4 py-3.5 flex items-center gap-3.5">
                {/* Left Icon Badge */}
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shrink-0 shadow-inner">
                  <Code2 className="w-5 h-5 stroke-[2.2]" />
                </div>

                {/* Center Copy */}
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-emerald-400">
                      VibeCoded by
                    </span>
                  </div>
                  <div className="text-[15px] font-extrabold tracking-tight text-white leading-snug mt-0.5">
                    Rehan Mumtaz
                  </div>
                  <div className="text-[10px] font-mono text-emerald-200/70 mt-0.5 flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Local Desk · PDF &amp; Document Studio</span>
                  </div>
                </div>

                {/* Minimize Button */}
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Minimize signature card"
                  title="Minimize"
                  className="self-start p-1.5 rounded-lg text-emerald-300/70 hover:text-white hover:bg-emerald-500/20 border border-transparent hover:border-emerald-500/30 transition-colors cursor-pointer"
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
