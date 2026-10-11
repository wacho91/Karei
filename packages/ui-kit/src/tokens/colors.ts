/**
 * Karei Design System — Color Tokens
 * Paleta premium inspirada en Stripe/Apple.
 * Base: "Ember" (cálido gastronómico) + "Slate" (neutro enterprise).
 *
 * Reglas:
 *  - Nunca usar hex directo en componentes. Siempre tokens semánticos.
 *  - Contraste mínimo AA (4.5:1) en texto sobre fondo.
 *  - Dark mode es first-class, no un afterthought.
 */

export const palette = {
  // ─── Brand: Ember (fuego, cocina, pasión) ─────────────────────
  ember: {
    50:  '#FFF4ED',
    100: '#FFE6D5',
    200: '#FFC9AA',
    300: '#FFA374',
    400: '#FF7139',
    500: '#FF4D0F', // primary
    600: '#F03300',
    700: '#C72400',
    800: '#9E1F05',
    900: '#7F1D0A',
    950: '#450A02',
  },

  // ─── Neutral: Slate (enterprise, sobrio) ──────────────────────
  slate: {
    0:   '#FFFFFF',
    50:  '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
    950: '#020617',
  },

  // ─── Semantic: Success (pagos, confirmaciones) ────────────────
  jade: {
    50:  '#ECFDF5',
    100: '#D1FAE5',
    300: '#6EE7B7',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
    900: '#064E3B',
  },

  // ─── Semantic: Warning (food cost alto, stock bajo) ───────────
  amber: {
    50:  '#FFFBEB',
    100: '#FEF3C7',
    300: '#FCD34D',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    900: '#78350F',
  },

  // ─── Semantic: Danger (errores, DIAN rechazado) ───────────────
  crimson: {
    50:  '#FEF2F2',
    100: '#FEE2E2',
    300: '#FCA5A5',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    900: '#7F1D1D',
  },

  // ─── Semantic: Info (KDS, notificaciones) ─────────────────────
  azure: {
    50:  '#EFF6FF',
    100: '#DBEAFE',
    300: '#93C5FD',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    900: '#1E3A8A',
  },
} as const;

/**
 * Tokens semánticos — la ÚNICA capa que los componentes deben consumir.
 * Mapean intención → color, no color → color.
 */
export const semanticColors = {
  light: {
    // Superficies
    bg: {
      canvas:   palette.slate[50],
      surface:  palette.slate[0],
      elevated: palette.slate[0],
      sunken:   palette.slate[100],
      inverse:  palette.slate[900],
      overlay:  'rgba(15, 23, 42, 0.48)',
    },
    // Texto
    fg: {
      default:  palette.slate[900],
      muted:    palette.slate[600],
      subtle:   palette.slate[400],
      inverse:  palette.slate[0],
      brand:    palette.ember[600],
      onBrand:  palette.slate[0],
    },
    // Bordes
    border: {
      default: palette.slate[200],
      strong:  palette.slate[300],
      subtle:  palette.slate[100],
      focus:   palette.ember[500],
    },
    // Acciones
    action: {
      primary:        palette.ember[500],
      primaryHover:   palette.ember[600],
      primaryActive:  palette.ember[700],
      secondary:      palette.slate[100],
      secondaryHover: palette.slate[200],
      ghost:          'transparent',
      ghostHover:     palette.slate[100],
      danger:         palette.crimson[600],
      dangerHover:    palette.crimson[700],
    },
    // Estados
    status: {
      success: palette.jade[600],
      warning: palette.amber[600],
      danger:  palette.crimson[600],
      info:    palette.azure[600],
    },
    // Estados de mesa (dominio Karei)
    table: {
      free:     palette.jade[500],
      occupied: palette.ember[500],
      billing:  palette.amber[500],
      reserved: palette.azure[500],
    },
  },

  dark: {
    bg: {
      canvas:   palette.slate[950],
      surface:  palette.slate[900],
      elevated: palette.slate[800],
      sunken:   palette.slate[950],
      inverse:  palette.slate[50],
      overlay:  'rgba(2, 6, 23, 0.72)',
    },
    fg: {
      default:  palette.slate[50],
      muted:    palette.slate[400],
      subtle:   palette.slate[500],
      inverse:  palette.slate[900],
      brand:    palette.ember[400],
      onBrand:  palette.slate[950],
    },
    border: {
      default: palette.slate[800],
      strong:  palette.slate[700],
      subtle:  palette.slate[900],
      focus:   palette.ember[400],
    },
    action: {
      primary:        palette.ember[500],
      primaryHover:   palette.ember[400],
      primaryActive:  palette.ember[600],
      secondary:      palette.slate[800],
      secondaryHover: palette.slate[700],
      ghost:          'transparent',
      ghostHover:     palette.slate[800],
      danger:         palette.crimson[500],
      dangerHover:    palette.crimson[400],
    },
    status: {
      success: palette.jade[500],
      warning: palette.amber[500],
      danger:  palette.crimson[500],
      info:    palette.azure[500],
    },
    table: {
      free:     palette.jade[500],
      occupied: palette.ember[500],
      billing:  palette.amber[500],
      reserved: palette.azure[500],
    },
  },
} as const;

export type ColorMode = keyof typeof semanticColors;
export type SemanticColors = typeof semanticColors.light;
