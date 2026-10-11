import type { Config } from 'tailwindcss';

/**
 * Tailwind config — consume tokens del ui-kit.
 * Los colores semánticos se exponen como CSS variables (ver index.css)
 * para soportar dark mode sin duplicar clases.
 */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui-kit/src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Superficies
        canvas: 'rgb(var(--bg-canvas) / <alpha-value>)',
        surface: 'rgb(var(--bg-surface) / <alpha-value>)',
        elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
        sunken: 'rgb(var(--bg-sunken) / <alpha-value>)',
        // Texto
        fg: {
          DEFAULT: 'rgb(var(--fg-default) / <alpha-value>)',
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',
          subtle: 'rgb(var(--fg-subtle) / <alpha-value>)',
          inverse: 'rgb(var(--fg-inverse) / <alpha-value>)',
          brand: 'rgb(var(--fg-brand) / <alpha-value>)',
        },
        // Bordes
        border: {
          DEFAULT: 'rgb(var(--border-default) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
          subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
        },
        // Acciones
        brand: {
          DEFAULT: 'rgb(var(--action-primary) / <alpha-value>)',
          hover: 'rgb(var(--action-primary-hover) / <alpha-value>)',
          active: 'rgb(var(--action-primary-active) / <alpha-value>)',
        },
        // Estados
        success: 'rgb(var(--status-success) / <alpha-value>)',
        warning: 'rgb(var(--status-warning) / <alpha-value>)',
        danger: 'rgb(var(--status-danger) / <alpha-value>)',
        info: 'rgb(var(--status-info) / <alpha-value>)',
        // Estados de mesa
        table: {
          free: 'rgb(var(--table-free) / <alpha-value>)',
          occupied: 'rgb(var(--table-occupied) / <alpha-value>)',
          billing: 'rgb(var(--table-billing) / <alpha-value>)',
          reserved: 'rgb(var(--table-reserved) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        sm: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
        sm: '0 1px 3px 0 rgba(15, 23, 42, 0.08), 0 1px 2px -1px rgba(15, 23, 42, 0.06)',
        md: '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.06)',
        lg: '0 10px 15px -3px rgba(15, 23, 42, 0.10), 0 4px 6px -4px rgba(15, 23, 42, 0.06)',
        xl: '0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
        focus: '0 0 0 3px rgba(255, 77, 15, 0.35)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
