/**
 * Karei Design System — Typography Tokens
 * Fuentes:
 *  - Display/UI: "Inter" (variable, óptica enterprise, legible en POS).
 *  - Mono: "JetBrains Mono" (CUFE, NIT, códigos QR, tickets).
 *  - Numeric: tabular-nums obligatorio en precios y cantidades.
 */

export const fontFamily = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
} as const;

export const fontWeight = {
  regular:  400,
  medium:   500,
  semibold: 600,
  bold:     700,
} as const;

/**
 * Escala tipográfica — ratio 1.250 (Major Third).
 * Base 16px. Line-heights ajustados por densidad de uso.
 */
export const fontSize = {
  xs:   '0.75rem',   // 12px — labels, badges
  sm:   '0.875rem',  // 14px — body compacto, tablas
  base: '1rem',      // 16px — body
  lg:   '1.125rem',  // 18px — subtítulos
  xl:   '1.25rem',   // 20px — títulos de card
  '2xl': '1.5rem',   // 24px — títulos de sección
  '3xl': '1.875rem', // 30px — page titles
  '4xl': '2.25rem',  // 36px — hero
  '5xl': '3rem',     // 48px — marketing
} as const;

export const lineHeight = {
  none:    1,
  tight:   1.15,
  snug:    1.3,
  normal:  1.5,
  relaxed: 1.65,
} as const;

export const letterSpacing = {
  tighter: '-0.03em',
  tight:   '-0.015em',
  normal:  '0',
  wide:    '0.015em',
  wider:   '0.05em',
  widest:  '0.1em', // para labels uppercase
} as const;

/**
 * Text styles — combinaciones listas para usar.
 * Cada estilo es una decisión de diseño, no una sugerencia.
 */
export const textStyles = {
  display: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize['5xl'],
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.tight,
    letterSpacing: letterSpacing.tighter,
  },
  h1: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  h2: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.snug,
    letterSpacing: letterSpacing.tight,
  },
  h3: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.snug,
    letterSpacing: letterSpacing.normal,
  },
  h4: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.snug,
    letterSpacing: letterSpacing.normal,
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.normal,
    letterSpacing: letterSpacing.normal,
  },
  bodySm: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.normal,
    letterSpacing: letterSpacing.normal,
  },
  label: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.snug,
    letterSpacing: letterSpacing.normal,
  },
  caption: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.snug,
    letterSpacing: letterSpacing.wide,
  },
  overline: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.snug,
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase' as const,
  },
  // ─── Estilos de dominio Karei ─────────────────────────────────
  price: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.tight,
    letterSpacing: letterSpacing.tight,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  priceLarge: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.tight,
    letterSpacing: letterSpacing.tighter,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  mono: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.normal,
    letterSpacing: letterSpacing.normal,
  },
  cufe: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.snug,
    letterSpacing: letterSpacing.normal,
    wordBreak: 'break-all' as const,
  },
} as const;

export type TextStyle = keyof typeof textStyles;
