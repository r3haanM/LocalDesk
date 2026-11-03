import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AppearanceMode } from '../types/pdf';

export interface AnimatedThemeToggleProps {
  appearance: AppearanceMode;
  onToggle: (nextMode: AppearanceMode) => void;
  showLabel?: boolean;
  className?: string;
}

interface RippleWave {
  id: number;
  x: number;
  y: number;
  toDark: boolean;
}

/**
 * Direct 1-Click Animated Theme Toggle Icon
 * - Morphs smoothly between a Luminous Mint-Emerald Crescent Moon (Dark) and a
 *   Radiant Golden-Emerald Sun (Light) with spring rotation and color interpolation.
 * - Triggers a circular radial iris clip-path reveal from the exact click origin
 *   plus a luminous optical ring wave—no modal popup required.
 */
export const AnimatedThemeToggle: React.FC<AnimatedThemeToggleProps> = ({
  appearance,
  onToggle,
  showLabel = false,
  className = ''
}) => {
  const [ripple, setRipple] = useState<RippleWave | null>(null);

  const isCurrentlyDark =
    appearance === 'dark' ||
    (appearance === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const handleTriggerToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const nextMode: AppearanceMode = isCurrentlyDark ? 'light' : 'dark';
    const nextIsDark = nextMode === 'dark';

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX || rect.left + rect.width / 2;
    const clickY = e.clientY || rect.top + rect.height / 2;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      document.documentElement.classList.toggle('dark', nextIsDark);
      onToggle(nextMode);
      return;
    }

    // Spawn luminous radial ring from the button position
    const waveId = Date.now();
    setRipple({ id: waveId, x: clickX, y: clickY, toDark: nextIsDark });
    window.setTimeout(() => {
      setRipple((prev) => (prev?.id === waveId ? null : prev));
    }, 620);

    const maxRadius = Math.hypot(
      Math.max(clickX, window.innerWidth - clickX),
      Math.max(clickY, window.innerHeight - clickY)
    );

    const docWithVT = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    };

    if (typeof docWithVT.startViewTransition === 'function') {
      try {
        const transition = docWithVT.startViewTransition(() => {
          flushSync(() => {
            document.documentElement.classList.toggle('dark', nextIsDark);
            onToggle(nextMode);
          });
        });

        transition.ready
          .then(() => {
            document.documentElement.animate(
              {
                clipPath: [
                  `circle(0px at ${clickX}px ${clickY}px)`,
                  `circle(${maxRadius}px at ${clickX}px ${clickY}px)`
                ]
              },
              {
                duration: 520,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                pseudoElement: '::view-transition-new(root)'
              }
            );
          })
          .catch(() => {
            // Ignore interrupted transition errors
          });
        return;
      } catch {
        // Fallback if ViewTransition throws
      }
    }

    document.documentElement.classList.toggle('dark', nextIsDark);
    onToggle(nextMode);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleTriggerToggle}
        title={isCurrentlyDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label={isCurrentlyDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        className={`group relative inline-flex items-center justify-center gap-2 rounded-xl border border-theme-subtle bg-theme-surface hover:border-theme-accent transition-all duration-300 cursor-pointer select-none overflow-hidden ${
          showLabel ? 'px-3 py-1.5' : 'w-9 h-9'
        } ${className}`}
      >
        {/* Subtle Ambient Glow Inside Button That Transitions Color */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
            isCurrentlyDark
              ? 'bg-radial from-emerald-400/15 via-transparent to-transparent opacity-100'
              : 'bg-radial from-amber-400/20 via-emerald-500/10 to-transparent opacity-100'
          }`}
        />

        {/* Animated Morphing Sun / Crescent Moon Icon with Color Transition */}
        <motion.div
          key={isCurrentlyDark ? 'moon-icon' : 'sun-icon'}
          initial={{ rotate: isCurrentlyDark ? -90 : 90, scale: 0.65, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: isCurrentlyDark ? 90 : -90, scale: 0.65, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 20 }}
          className="relative z-10 flex items-center justify-center"
        >
          {isCurrentlyDark ? (
            /* Luminous Mint-Emerald Crescent Moon + Sparkle Star */
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-[#34D399] group-hover:text-[#6EE7B7] transition-colors duration-300 drop-shadow-[0_0_6px_rgba(52,211,153,0.45)]"
            >
              <path
                d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
                fill="currentColor"
                fillOpacity="0.22"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <motion.circle
                cx="18.5"
                cy="5.5"
                r="1.3"
                fill="#A7F3D0"
                animate={{ scale: [0.85, 1.25, 0.85], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </svg>
          ) : (
            /* Radiant Golden-Emerald Sun with Blooming Rays */
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-[#059669] group-hover:text-[#D97706] transition-colors duration-300 drop-shadow-[0_0_6px_rgba(245,158,11,0.35)]"
            >
              <circle
                cx="12"
                cy="12"
                r="4.5"
                fill="#F59E0B"
                fillOpacity="0.28"
                stroke="currentColor"
                strokeWidth="2"
              />
              <g stroke="#D97706" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="2" x2="12" y2="4.2" />
                <line x1="12" y1="19.8" x2="12" y2="22" />
                <line x1="4.93" y1="4.93" x2="6.48" y2="6.48" />
                <line x1="17.52" y1="17.52" x2="19.07" y2="19.07" />
                <line x1="2" y1="12" x2="4.2" y2="12" />
                <line x1="19.8" y1="12" x2="22" y2="12" />
                <line x1="4.93" y1="19.07" x2="6.48" y2="17.52" />
                <line x1="17.52" y1="6.48" x2="19.07" y2="4.93" />
              </g>
            </svg>
          )}
        </motion.div>

        {showLabel && (
          <span className="relative z-10 text-xs font-semibold text-theme-secondary group-hover:text-theme-primary transition-colors">
            {isCurrentlyDark ? 'Dark' : 'Light'}
          </span>
        )}
      </button>

      {/* Luminous Optical Shockwave Ring on Click */}
      <AnimatePresence>
        {ripple && (
          <motion.div
            key={ripple.id}
            initial={{
              width: 16,
              height: 16,
              x: ripple.x - 8,
              y: ripple.y - 8,
              opacity: 0.75
            }}
            animate={{
              width: 2200,
              height: 2200,
              x: ripple.x - 1100,
              y: ripple.y - 1100,
              opacity: 0
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden="true"
            className={`pointer-events-none fixed top-0 left-0 z-[9998] rounded-full border-2 ${
              ripple.toDark
                ? 'border-emerald-400/60 shadow-[0_0_40px_rgba(16,185,129,0.35)]'
                : 'border-amber-400/70 shadow-[0_0_40px_rgba(245,158,11,0.35)]'
            }`}
          />
        )}
      </AnimatePresence>
    </>
  );
};
