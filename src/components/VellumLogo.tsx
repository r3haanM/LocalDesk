import React from 'react';
import { LocalDeskLogo, LocalDeskLogoProps } from './Brand/LocalDeskLogo';

export interface VellumLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Legacy compatibility wrapper — renders the official Local Desk brand identity.
 */
export const VellumLogo: React.FC<VellumLogoProps & Partial<LocalDeskLogoProps>> = ({
  size = 'md',
  className = '',
  ...rest
}) => {
  return <LocalDeskLogo size={size} className={className} {...rest} />;
};

export { LocalDeskLogo };
