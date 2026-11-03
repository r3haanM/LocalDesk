import React, { useId } from 'react';

export type LogoVariant = 'horizontal' | 'symbol' | 'wordmark' | 'stacked' | 'app-icon';
export type LogoColorMode = 'color' | 'mono-dark' | 'mono-light';
export type LogoSurface = 'auto' | 'dark' | 'light';
export type LogoRefinementVersion = 'A' | 'B' | 'C';

export interface LocalDeskLogoProps {
  variant?: LogoVariant;
  colorMode?: LogoColorMode;
  surface?: LogoSurface;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Explicit pixel size for symbol / app-icon testing (16, 24, 32, 48, 64, 128, 256) */
  pixelSize?: number;
  /** Controlled refinement direction: 'A' (Minimal), 'B' (Selected Cohesive Forest+Emerald), 'C' (Typographic Terminal) */
  refinementVersion?: LogoRefinementVersion;
  className?: string;
  subtitle?: string;
}

const SIZE_MAP: Record<
  NonNullable<LocalDeskLogoProps['size']>,
  {
    iconPx: number;
    textClass: string;
    subClass: string;
    gapClass: string;
  }
> = {
  xs: {
    iconPx: 20,
    textClass: 'text-sm',
    subClass: 'text-[9px]',
    gapClass: 'gap-2'
  },
  sm: {
    iconPx: 28,
    textClass: 'text-base',
    subClass: 'text-[9.5px]',
    gapClass: 'gap-2.5'
  },
  md: {
    iconPx: 36,
    textClass: 'text-[19px]',
    subClass: 'text-[10px]',
    gapClass: 'gap-3'
  },
  lg: {
    iconPx: 48,
    textClass: 'text-2xl',
    subClass: 'text-[11px]',
    gapClass: 'gap-3.5'
  },
  xl: {
    iconPx: 64,
    textClass: 'text-3xl',
    subClass: 'text-xs',
    gapClass: 'gap-4'
  },
  '2xl': {
    iconPx: 96,
    textClass: 'text-4xl',
    subClass: 'text-sm',
    gapClass: 'gap-5'
  }
};

/**
 * Local Desk — Refined Brand Mark & Wordmark System (Version B Selected)
 *
 * Core Visual Metaphor: "The Grounded Document Plane"
 * - Precision 64×64 grid with a uniform 4.5px negative-space architectural channel
 *   separating the Grounded L-Frame Desk Datum (x:14..23.5, y:40.5..50) from the
 *   Active Document Plane (x:28..50, y:14..36, 22×22 square with 9×9 top-right fold).
 * - Cohesive Forest + Emerald Color System:
 *   - Primary Brand Color: Deep Forest Green (#0D1F18 / #132820)
 *   - Primary Accent: Emerald Green (#10B981 / #34D399 dark / #059669 light)
 *   - Dark-Mode Wordmark Primary: Crisp Off-White (#F2F7F4)
 *   - Light-Mode Surfaces: Clean Neutral (#F6F8F7 / #FFFFFF) with Deep Forest Ink (#0D1F18)
 */
export const LocalDeskLogo: React.FC<LocalDeskLogoProps> = ({
  variant = 'horizontal',
  colorMode = 'color',
  surface = 'auto',
  size = 'md',
  pixelSize,
  refinementVersion = 'B',
  className = '',
  subtitle
}) => {
  const uid = useId().replace(/:/g, '');
  const preset = SIZE_MAP[size];
  const resolvedPx = pixelSize ?? preset.iconPx;

  // Optical Simplification Threshold:
  // At 16px and 24px, simplify internal document calibration bars to a single crisp bar
  const isMicro = resolvedPx <= 24;

  const renderSymbolSvg = (withAppContainer: boolean) => {
    const bgGradId = `ld-bg-${uid}`;
    const sheetGradId = `ld-sheet-${uid}`;
    const frameGradId = `ld-frame-${uid}`;

    // Monochrome overrides
    if (colorMode === 'mono-dark' || colorMode === 'mono-light') {
      const fg = colorMode === 'mono-dark' ? '#0D1F18' : '#F2F7F4';
      const cut = colorMode === 'mono-dark' ? '#FFFFFF' : '#0D1F18';

      return (
        <svg
          width={resolvedPx}
          height={resolvedPx}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0 select-none"
          aria-label="Local Desk Symbol"
        >
          {withAppContainer && (
            <rect
              x="4"
              y="4"
              width="56"
              height="56"
              rx="14"
              stroke={fg}
              strokeWidth="3.5"
              fill="none"
            />
          )}
          {/* Grounded L-Frame Desk Datum */}
          <path
            d="M14 18C14 15.7909 15.7909 14 18 14H21C22.3807 14 23.5 15.1193 23.5 16.5V38C23.5 39.3807 24.6193 40.5 26 40.5H47.5C48.8807 40.5 50 41.6193 50 43V46C50 48.2091 48.2091 50 46 50H18C15.7909 50 14 48.2091 14 46V18Z"
            fill={fg}
          />
          {/* Active Document Sheet Plane (Uniform 4.5px gap from L-frame) */}
          <path
            d="M28 16.5C28 15.1193 29.1193 14 30.5 14H41L50 23V33.5C50 34.8807 48.8807 36 47.5 36H30.5C29.1193 36 28 34.8807 28 33.5V16.5Z"
            fill={fg}
          />
          {/* Corner Fold Cutout */}
          <path d="M40.5 14V21C40.5 22.3807 41.6193 23.5 43 23.5H50" stroke={cut} strokeWidth="2.5" />
          {/* Internal Calibration Bar Cutout */}
          {!isMicro ? (
            <>
              <rect x="32.5" y="23" width="11.5" height="2.6" rx="1.3" fill={cut} />
              <rect x="32.5" y="28" width="7.5" height="2.6" rx="1.3" fill={cut} />
            </>
          ) : (
            <rect x="32.5" y="24.2" width="10.5" height="3.4" rx="1.7" fill={cut} />
          )}
        </svg>
      );
    }

    // Version A: Minimal & Restrained (Tonal Emerald Monolith Symbol)
    if (refinementVersion === 'A') {
      return (
        <svg
          width={resolvedPx}
          height={resolvedPx}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0 select-none"
          aria-label="Local Desk Symbol — Version A"
        >
          {withAppContainer && (
            <>
              <rect
                x="4"
                y="4"
                width="56"
                height="56"
                rx="14"
                fill={surface === 'light' ? '#0D1F18' : '#0F231C'}
              />
              <rect
                x="4.75"
                y="4.75"
                width="54.5"
                height="54.5"
                rx="13.25"
                stroke="#34D399"
                strokeOpacity="0.18"
                strokeWidth="1.2"
              />
            </>
          )}
          <path
            d="M14 18C14 15.7909 15.7909 14 18 14H21C22.3807 14 23.5 15.1193 23.5 16.5V38C23.5 39.3807 24.6193 40.5 26 40.5H47.5C48.8807 40.5 50 41.6193 50 43V46C50 48.2091 48.2091 50 46 50H18C15.7909 50 14 48.2091 14 46V18Z"
            fill="#10B981"
          />
          <path
            d="M28 16.5C28 15.1193 29.1193 14 30.5 14H41L50 23V33.5C50 34.8807 48.8807 36 47.5 36H30.5C29.1193 36 28 34.8807 28 33.5V16.5Z"
            fill="#A7F3D0"
          />
          <path
            d="M41 14V20.5C41 21.8807 42.1193 23 43.5 23H50L41 14Z"
            fill="#34D399"
          />
        </svg>
      );
    }

    // Version B (Selected Master Identity) & Version C Symbol:
    // High-contrast Deep Forest Green vessel (#0D1F18) + Emerald L-Frame (#10B981 -> #059669)
    // + Crisp Off-White/Mint Document Sheet (#F4FBF7 -> #D1FAE5) with uniform 4.5px channel.
    return (
      <svg
        width={resolvedPx}
        height={resolvedPx}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 select-none"
        aria-label="Local Desk Symbol"
      >
        <defs>
          {/* Deep Forest Green Vessel Gradient */}
          <linearGradient id={bgGradId} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#142C23" />
            <stop offset="100%" stopColor="#0A1712" />
          </linearGradient>

          {/* Grounded L-Frame Emerald Gradient */}
          <linearGradient id={frameGradId} x1="14" y1="14" x2="50" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="45%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>

          {/* Active Document Sheet Gradient */}
          <linearGradient id={sheetGradId} x1="28" y1="14" x2="50" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F7FCF9" />
            <stop offset="100%" stopColor="#D1FAE5" />
          </linearGradient>
        </defs>

        {/* Application Icon Squircle Vessel */}
        {withAppContainer && (
          <>
            <rect
              x="4"
              y="4"
              width="56"
              height="56"
              rx="14"
              fill={`url(#${bgGradId})`}
            />
            <rect
              x="4.75"
              y="4.75"
              width="54.5"
              height="54.5"
              rx="13.25"
              stroke="#34D399"
              strokeOpacity={surface === 'light' ? '0.32' : '0.24'}
              strokeWidth="1.25"
            />
          </>
        )}

        {/* Grounded L-Frame Desk Datum (x:14..23.5, y:40.5..50) */}
        <path
          d="M14 18C14 15.7909 15.7909 14 18 14H21C22.3807 14 23.5 15.1193 23.5 16.5V38C23.5 39.3807 24.6193 40.5 26 40.5H47.5C48.8807 40.5 50 41.6193 50 43V46C50 48.2091 48.2091 50 46 50H18C15.7909 50 14 48.2091 14 46V18Z"
          fill={`url(#${frameGradId})`}
        />

        {/* Active Document Sheet Plane (x:28..50, y:14..36 — exact 4.5px channel from L-frame) */}
        <path
          d="M28 16.5C28 15.1193 29.1193 14 30.5 14H41L50 23V33.5C50 34.8807 48.8807 36 47.5 36H30.5C29.1193 36 28 34.8807 28 33.5V16.5Z"
          fill={withAppContainer ? `url(#${sheetGradId})` : '#10B981'}
        />

        {/* Precision 9×9 Corner Fold */}
        <path
          d="M41 14V20.5C41 21.8807 42.1193 23 43.5 23H50L41 14Z"
          fill={withAppContainer ? '#10B981' : '#047857'}
        />

        {/* Internal Document Specification Bars (Optically simplified below 24px) */}
        {!isMicro ? (
          <>
            <rect
              x="32.5"
              y="23"
              width="11.5"
              height="2.6"
              rx="1.3"
              fill={withAppContainer ? '#0D1F18' : '#F2F7F4'}
            />
            <rect
              x="32.5"
              y="28"
              width="7.5"
              height="2.6"
              rx="1.3"
              fill={withAppContainer ? '#059669' : '#D1FAE5'}
            />
          </>
        ) : (
          <rect
            x="32.5"
            y="24.2"
            width="10.5"
            height="3.4"
            rx="1.7"
            fill={withAppContainer ? '#0D1F18' : '#F2F7F4'}
          />
        )}
      </svg>
    );
  };

  if (variant === 'symbol') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        {renderSymbolSvg(false)}
      </div>
    );
  }

  if (variant === 'app-icon') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        {renderSymbolSvg(true)}
      </div>
    );
  }

  // Deliberate Brand Wordmark Color Hierarchy (Decoupled from theme-accent so Desk never turns purple)
  const localTextColor =
    colorMode === 'mono-dark'
      ? 'text-[#0D1F18]'
      : colorMode === 'mono-light'
      ? 'text-[#F2F7F4]'
      : surface === 'dark'
      ? 'text-[#F2F7F4]'
      : surface === 'light'
      ? 'text-[#0D1F18]'
      : 'text-[#0D1F18] dark:text-[#F2F7F4]';

  const deskAccentColor =
    colorMode === 'mono-dark'
      ? 'text-[#0D1F18]'
      : colorMode === 'mono-light'
      ? 'text-[#F2F7F4]'
      : refinementVersion === 'A'
      ? surface === 'dark'
        ? 'text-[#D8ECE3]'
        : surface === 'light'
        ? 'text-[#234236]'
        : 'text-[#234236] dark:text-[#D8ECE3]'
      : surface === 'dark'
      ? 'text-[#34D399]'
      : surface === 'light'
      ? 'text-[#059669]'
      : 'text-[#059669] dark:text-[#34D399]';

  const renderWordmark = (centered = false) => (
    <div className={`flex flex-col justify-center ${centered ? 'items-center text-center' : ''}`}>
      <div
        className={`flex items-baseline leading-none select-none ${preset.textClass}`}
        style={{
          fontFamily: "'Plus Jakarta Sans', 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif",
          letterSpacing: refinementVersion === 'C' ? '-0.036em' : '-0.03em'
        }}
      >
        <span className={`font-extrabold ${localTextColor}`}>Local</span>
        <span
          className={`${
            refinementVersion === 'A'
              ? 'font-semibold ml-[0.24em]'
              : refinementVersion === 'C'
              ? 'font-medium ml-[0.12em]'
              : 'font-bold ml-[0.22em]'
          } ${deskAccentColor}`}
        >
          Desk
        </span>
        {/* Version C explores an integrated baseline bar; Version A and Selected Version B remove the disconnected trailing square */}
        {refinementVersion === 'C' && (
          <span
            className={`ml-[0.14em] inline-block w-[0.38em] h-[0.12em] rounded-[1px] self-baseline mb-[0.04em] ${
              colorMode === 'mono-dark'
                ? 'bg-[#0D1F18]'
                : colorMode === 'mono-light'
                ? 'bg-[#F2F7F4]'
                : 'bg-[#10B981]'
            }`}
            aria-hidden="true"
          />
        )}
      </div>
      {subtitle && (
        <span
          className={`font-mono uppercase tracking-[0.14em] mt-1.5 leading-none ${preset.subClass} ${
            surface === 'dark'
              ? 'text-[#86A89B]'
              : surface === 'light'
              ? 'text-[#3B544A]'
              : 'text-[#3B544A] dark:text-[#86A89B]'
          }`}
        >
          {subtitle}
        </span>
      )}
    </div>
  );

  if (variant === 'wordmark') {
    return <div className={`inline-flex items-center ${className}`}>{renderWordmark(false)}</div>;
  }

  if (variant === 'stacked') {
    return (
      <div className={`inline-flex flex-col items-center text-center gap-3 ${className}`}>
        {renderSymbolSvg(true)}
        {renderWordmark(true)}
      </div>
    );
  }

  // Default: Horizontal Lockup (App Icon + Wordmark)
  return (
    <div className={`inline-flex items-center ${preset.gapClass} ${className}`}>
      {renderSymbolSvg(true)}
      {renderWordmark()}
    </div>
  );
};
