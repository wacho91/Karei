import * as React from 'react';

/**
 * Karei Logo — Marca principal.
 *
 * Concepto: la letra "K" se construye con dos trazos que evocan
 * un tenedor (vertical) y un cuchillo (diagonal), unidos por un
 * punto de "fuego" (ember) que representa el calor de la cocina.
 * El punto también funciona como el "punto de venta" (POS).
 *
 * Props:
 *  - variant: 'full' (isotipo + wordmark) | 'mark' (solo isotipo)
 *  - size: escala base en px (el SVG escala proporcionalmente)
 *  - tone: 'brand' | 'mono' | 'inverse' — controla el color
 *  - animated: activa el pulso del punto ember (para loading/splash)
 */

export type LogoVariant = 'full' | 'mark';
export type LogoTone = 'brand' | 'mono' | 'inverse';

export interface LogoProps extends React.SVGProps<SVGSVGElement> {
  variant?: LogoVariant;
  size?: number;
  tone?: LogoTone;
  animated?: boolean;
  title?: string;
}

const toneMap: Record<LogoTone, { mark: string; accent: string; word: string }> = {
  brand:   { mark: '#0F172A', accent: '#FF4D0F', word: '#0F172A' },
  mono:    { mark: 'currentColor', accent: 'currentColor', word: 'currentColor' },
  inverse: { mark: '#FFFFFF', accent: '#FF7139', word: '#FFFFFF' },
};

export const Logo = React.forwardRef<SVGSVGElement, LogoProps>(function Logo(
  {
    variant = 'full',
    size = 32,
    tone = 'brand',
    animated = false,
    title = 'Karei',
    className,
    style,
    ...rest
  },
  ref,
) {
  const colors = toneMap[tone];
  const isFull = variant === 'full';

  // ViewBox: mark = 40x40, full = 160x40 (mark + wordmark)
  const viewBox = isFull ? '0 0 160 40' : '0 0 40 40';
  const width = isFull ? size * 4 : size;
  const height = size;

  return (
    <svg
      ref={ref}
      role="img"
      aria-label={title}
      viewBox={viewBox}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', ...style }}
      {...rest}
    >
      <title>{title}</title>

      {/* ─── Isotipo: K construida con tenedor + cuchillo ─── */}
      <g>
        {/* Trazo vertical (tenedor / columna) */}
        <rect
          x="6"
          y="6"
          width="4.5"
          height="28"
          rx="2.25"
          fill={colors.mark}
        />

        {/* Trazo diagonal superior (cuchillo) */}
        <path
          d="M14 6 L26 20 L20.5 20 L12.5 10.5 Z"
          fill={colors.mark}
        />

        {/* Trazo diagonal inferior (cuchillo) */}
        <path
          d="M14 34 L26 20 L20.5 20 L12.5 29.5 Z"
          fill={colors.mark}
        />

        {/* Punto ember — el "fuego" / POS */}
        <circle
          cx="30"
          cy="20"
          r="4"
          fill={colors.accent}
        >
          {animated && (
            <animate
              attributeName="r"
              values="4;5.2;4"
              dur="1.6s"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
            />
          )}
        </circle>
      </g>

      {/* ─── Wordmark ─── */}
      {isFull && (
        <text
          x="46"
          y="27"
          fontFamily="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fontSize="22"
          fontWeight={700}
          letterSpacing="-0.02em"
          fill={colors.word}
        >
          Karei
        </text>
      )}
    </svg>
  );
});

Logo.displayName = 'Logo';
