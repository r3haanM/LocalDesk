import React from 'react';

interface VellumLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Bespoke architectural brand mark and typography-led wordmark for Vellum.
 * Combines a layered isometric folded document prism ("V" fold geometry)
 * with refined geometric display typography.
 */
export const VellumLogo: React.FC<VellumLogoProps> = ({
  size = 'md',
  className = ''
}) => {
  const dimensions = {
    sm: { box: 'w-6 h-6', text: 'text-base', gap: 'gap-2' },
    md: { box: 'w-7 h-7', text: 'text-xl', gap: 'gap-2.5' },
    lg: { box: 'w-9 h-9', text: 'text-2xl', gap: 'gap-3' }
  }[size];

  return (
    <span className={`inline-flex items-center ${dimensions.gap} select-none ${className}`}>
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={`${dimensions.box} shrink-0 transition-transform duration-200 group-hover:scale-[1.04]`}
      >
        <defs>
          <linearGradient id="vellum-prism-primary" x1="4" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--accent-secondary)" />
            <stop offset="100%" stopColor="var(--accent-primary)" />
          </linearGradient>
          <linearGradient id="vellum-prism-fold" x1="18" y1="6" x2="30" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#C4B5FD" stopOpacity="0.78" />
          </linearGradient>
        </defs>

        {/* Outer Squircle Architectural Frame */}
        <rect
          x="2"
          y="2"
          width="32"
          height="32"
          rx="8.5"
          fill="url(#vellum-prism-primary)"
        />

        {/* Subtle Inner Technical Hairline */}
        <rect
          x="2.75"
          y="2.75"
          width="30.5"
          height="30.5"
          rx="7.75"
          stroke="white"
          strokeOpacity="0.22"
          strokeWidth="1"
        />

        {/* Back Document Sheet Layer */}
        <path
          d="M10.5 9.5C10.5 8.67157 11.1716 8 12 8H22.5L26.5 12V25.5C26.5 26.3284 25.8284 27 25 27H12C11.1716 27 10.5 26.3284 10.5 25.5V9.5Z"
          fill="#0F0E17"
          fillOpacity="0.28"
        />

        {/* Isometric Vellum "V" Ribbon Left Wing */}
        <path
          d="M9.5 10.5L17.6 26.8C17.85 27.3 18.55 27.3 18.8 26.8L22.2 20L15.4 10.5H9.5Z"
          fill="white"
        />

        {/* Isometric Vellum Folded Page Right Wing */}
        <path
          d="M20.6 10.5L16.8 18.2L20.1 24.4L26.8 10.5H20.6Z"
          fill="url(#vellum-prism-fold)"
        />

        {/* Corner Dog-Ear Precision Cut */}
        <path
          d="M22.5 8L26.5 12H23.5C22.9477 12 22.5 11.5523 22.5 11V8Z"
          fill="white"
          fillOpacity="0.55"
        />
      </svg>

      <span className={`${dimensions.text} font-extrabold tracking-tight text-theme-primary leading-none`}>
        Vellum<span className="text-theme-accent">.</span>
      </span>
    </span>
  );
};
