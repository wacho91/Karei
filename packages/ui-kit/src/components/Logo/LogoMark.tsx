import * as React from 'react';
import { Logo, type LogoProps } from './Logo';

/**
 * LogoMark — Atajo para el isotipo solo (favicon, avatares, app icon).
 */
export const LogoMark = React.forwardRef<SVGSVGElement, Omit<LogoProps, 'variant'>>(
  function LogoMark(props, ref) {
    return <Logo ref={ref} variant="mark" {...props} />;
  },
);

LogoMark.displayName = 'LogoMark';
