import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { LocalDeskLogo } from './Brand/LocalDeskLogo';
import { Check, Layers, ShieldCheck, Cpu } from 'lucide-react';

export interface StudioLaunchTransitionProps {
  toolName?: string;
  stageMessage?: string;
  mode?: 'full' | 'inline';
  onComplete?: () => void;
}

const PIPELINE_STEPS = [
  {
    id: 'stream',
    code: '01',
    label: 'ISO 32000 Stream & MediaBox Parser',
    icon: Layers
  },
  {
    id: 'matrix',
    code: '02',
    label: '2D Vector Object & OCR Coordinate Matrix',
    icon: Cpu
  },
  {
    id: 'sandbox',
    code: '03',
    label: 'Local Sandbox Memory Locked (Zero Cloud)',
    icon: ShieldCheck
  }
];

/**
 * Choreographed Architectural Studio Launch & Blueprint Assembly Sequence
 * Replaces the static text loader with a 3D isometric multi-plane document
 * calibration animation that works in both Dark Mode and Light Mode.
 */
export const StudioLaunchTransition: React.FC<StudioLaunchTransitionProps> = ({
  toolName = '2D PDF Editor & Object Studio',
  stageMessage,
  mode = 'full',
  onComplete
}) => {
  const [progress, setProgress] = useState<number>(18);
  const [activeStep, setActiveStep] = useState<number>(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 640; // Fast, crisp 640ms studio ignition

    let rafId = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const ratio = Math.min(1, elapsed / duration);
      // Smooth ease-out cubic
      const eased = 1 - Math.pow(1 - ratio, 3);
      const nextPct = Math.min(100, Math.round(18 + eased * 82));
      setProgress(nextPct);

      if (ratio < 0.38) setActiveStep(0);
      else if (ratio < 0.76) setActiveStep(1);
      else setActiveStep(2);

      if (ratio < 1) {
        rafId = requestAnimationFrame(tick);
      } else if (onComplete) {
        onComplete();
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onComplete]);

  const isLocked = progress >= 94;

  return (
    <div
      className={`${
        mode === 'full'
          ? 'min-h-[calc(100vh-72px)] py-14 px-6'
          : 'my-auto py-10 px-6 w-full max-w-xl mx-auto'
      } flex flex-col items-center justify-center bg-theme-canvas text-theme-primary select-none relative overflow-hidden`}
    >
      {/* Subtle Architectural Radial Grid Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-35 dark:opacity-25"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 42%, rgba(16, 185, 129, 0.14) 0%, transparent 62%), linear-gradient(to right, var(--border-subtle) 1px, transparent 1px), linear-gradient(to bottom, var(--border-subtle) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 36px 36px, 36px 36px'
        }}
      />

      <div className="relative z-10 w-full max-w-lg flex flex-col items-center text-center space-y-7">
        {/* 1. 3D Isometric Document Layer Assembly Stage */}
        <div
          className="relative w-52 h-44 flex items-center justify-center"
          style={{ perspective: '900px' }}
          aria-hidden="true"
        >
          {/* Ambient Emerald Studio Glow Beneath Stack */}
          <motion.div
            animate={{
              scale: isLocked ? [1, 1.12, 1] : [0.95, 1.05, 0.95],
              opacity: isLocked ? 0.42 : 0.26
            }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute w-36 h-36 rounded-full bg-emerald-500/30 blur-2xl"
          />

          <div
            className="relative w-32 h-40"
            style={{
              transformStyle: 'preserve-3d',
              transform: 'rotateX(56deg) rotateZ(-34deg)'
            }}
          >
            {/* LAYER 1 (Bottom): Grounded L-Frame Desk Datum & MediaBox Grid */}
            <motion.div
              initial={{ z: -36, opacity: 0 }}
              animate={{
                z: isLocked ? 0 : -26,
                opacity: 1
              }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              style={{ transformStyle: 'preserve-3d' }}
              className="absolute inset-0 rounded-xl bg-theme-surface border-2 border-emerald-600/60 dark:border-emerald-400/50 shadow-xl p-2.5 flex flex-col justify-between"
            >
              {/* Grounded L-Frame Accent */}
              <div className="w-full h-full border-l-4 border-b-4 border-emerald-500 rounded-bl-md p-2 flex flex-col justify-between">
                <div className="flex justify-between items-center">
                  <span className="w-6 h-1 rounded-full bg-emerald-500/60" />
                  <span className="text-[7px] font-mono text-theme-muted">612×792</span>
                </div>
                <div className="grid grid-cols-3 gap-1 opacity-45">
                  <div className="h-3 rounded-xs bg-emerald-500/30" />
                  <div className="h-3 rounded-xs bg-emerald-500/20" />
                  <div className="h-3 rounded-xs bg-emerald-500/30" />
                </div>
              </div>
            </motion.div>

            {/* LAYER 2 (Middle): Vector Content Stream & Typography Plane */}
            <motion.div
              initial={{ z: 0, opacity: 0 }}
              animate={{
                z: isLocked ? 10 : 6,
                opacity: 0.95
              }}
              transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.04 }}
              style={{ transformStyle: 'preserve-3d' }}
              className="absolute inset-0 rounded-xl bg-theme-elevated/95 border border-theme-strong shadow-lg p-3 flex flex-col justify-between"
            >
              <div className="space-y-1.5">
                <div className="w-3/5 h-2 rounded-xs bg-emerald-500/70" />
                <div className="w-full h-1.5 rounded-xs bg-theme-muted" />
                <div className="w-4/5 h-1.5 rounded-xs bg-theme-muted" />
                <div className="w-11/12 h-1.5 rounded-xs bg-theme-muted" />
              </div>

              {/* Vector Diagram Wireframe Box */}
              <div className="h-12 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-1.5 flex items-end gap-1.5">
                <motion.div
                  animate={{ height: ['35%', '85%', '65%'] }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="flex-1 bg-emerald-500/70 rounded-xs"
                />
                <motion.div
                  animate={{ height: ['20%', '60%', '90%'] }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
                  className="flex-1 bg-emerald-400/70 rounded-xs"
                />
                <motion.div
                  animate={{ height: ['50%', '75%', '55%'] }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                  className="flex-1 bg-emerald-600/70 rounded-xs"
                />
              </div>

              <div className="flex items-center justify-between text-[7px] font-mono text-theme-muted">
                <span>STREAM</span>
                <span>ISO-32000</span>
              </div>
            </motion.div>

            {/* LAYER 3 (Top): Active 8-Handle Object Selection & Optical Laser Calibration Sweep */}
            <motion.div
              initial={{ z: 42, opacity: 0 }}
              animate={{
                z: isLocked ? 20 : 38,
                opacity: 1
              }}
              transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.08 }}
              style={{ transformStyle: 'preserve-3d' }}
              className="absolute inset-0 rounded-xl border-2 border-emerald-500 bg-emerald-500/5 overflow-hidden flex flex-col justify-between p-2.5"
            >
              {/* 4 Corner Precision Handles */}
              <div className="flex justify-between">
                <span className="w-2 h-2 bg-emerald-500 rounded-[2px] shadow-xs" />
                <span className="w-2 h-2 bg-emerald-500 rounded-[2px] shadow-xs" />
              </div>

              {/* Center Calibration Target */}
              <div className="mx-auto my-auto px-2 py-1 rounded border border-emerald-500/60 bg-theme-surface/90 text-[8px] font-mono font-bold text-theme-accent tracking-wider">
                {isLocked ? 'READY' : 'CALIBRATING'}
              </div>

              <div className="flex justify-between">
                <span className="w-2 h-2 bg-emerald-500 rounded-[2px] shadow-xs" />
                <span className="w-2 h-2 bg-emerald-500 rounded-[2px] shadow-xs" />
              </div>

              {/* Optical Emerald Laser Scanline */}
              <motion.div
                initial={{ top: '-10%' }}
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#10b981]"
              />
            </motion.div>
          </div>
        </div>

        {/* 2. Centered Brand Lockup (Fixes the off-center wordmark alignment) */}
        <LocalDeskLogo
          variant="stacked"
          size="md"
          pixelSize={48}
          subtitle="ARCHITECTURAL DOCUMENT ENGINE"
        />

        {/* 3. Studio Telemetry & Pipeline Readiness Card */}
        <div className="w-full p-5 rounded-2xl bg-theme-surface border border-theme-subtle shadow-xl space-y-4 text-left">
          <div className="flex items-center justify-between gap-3 border-b border-theme-subtle pb-3">
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-wider text-theme-accent font-semibold">
                Mounting Studio Environment
              </div>
              <div className="text-sm font-bold text-theme-primary truncate mt-0.5">
                {stageMessage || `Opening ${toolName}`}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-sm font-mono font-extrabold text-theme-accent tabular-nums">
                {progress}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 rounded-full bg-theme-muted overflow-hidden">
            <motion.div
              className="h-full bg-theme-accent rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* 3-Step Pipeline Verification List */}
          <div className="space-y-2 pt-1">
            {PIPELINE_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const done = activeStep > idx || progress >= 95;
              const current = activeStep === idx && !done;

              return (
                <div
                  key={step.id}
                  className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border text-xs transition-colors ${
                    done
                      ? 'bg-theme-elevated border-theme-subtle text-theme-primary'
                      : current
                      ? 'bg-theme-elevated/80 border-theme-accent text-theme-primary'
                      : 'bg-theme-canvas border-theme-subtle text-theme-muted opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-[11px] text-theme-accent font-bold tabular-nums">
                      {step.code}
                    </span>
                    <Icon className="w-3.5 h-3.5 text-theme-accent shrink-0" />
                    <span className="font-medium truncate">{step.label}</span>
                  </div>
                  <span className="font-mono text-[10px] shrink-0">
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-theme-accent font-bold">
                        <Check className="w-3 h-3" />
                        LOCKED
                      </span>
                    ) : current ? (
                      <span className="text-theme-secondary">ACTIVE</span>
                    ) : (
                      <span>QUEUED</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {onComplete && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={onComplete}
                className="text-[11px] font-mono text-theme-muted hover:text-theme-primary underline cursor-pointer"
              >
                Enter Immediately →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
