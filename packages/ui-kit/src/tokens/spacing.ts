/**
 * Karei Design System — Spacing, Radius, Shadow, Motion
 * Escala base 4px. Todo múltiplo de 4.
 */

export const space = {
  0:  '0',
  1:  '0.25rem',  // 4
  2:  '0.5rem',   // 8
  3:  '0.75rem',  // 12
  4:  '1rem',     // 16
  5:  '1.25rem',  // 20
  6:  '1.5rem',   // 24
  8:  '2rem',     // 32
  10: '2.5rem',   // 40
  12: '3rem',     // 48
  16: '4rem',     // 64
  20: '5rem',     // 80
  24: '6rem',     // 96
} as const;

export const radius = {
  none: '0',
  sm:   '0.375rem', // 6px — inputs, badges
  md:   '0.5rem',   // 8px — buttons, cards
  lg:   '0.75rem',  // 12px — modals, panels
  xl:   '1rem',     // 16px — hero cards
  '2xl': '1.5rem',  // 24px — marketing
  full: '9999px',   // pills, avatars
} as const;

export const shadow = {
  none: 'none',
  xs:   '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
  sm:   '0 1px 3px 0 rgba(15, 23, 42, 0.08), 0 1px 2px -1px rgba(15, 23, 42, 0.06)',
  md:   '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.06)',
  lg:   '0 10px 15px -3px rgba(15, 23, 42, 0.10), 0 4px 6px -4px rgba(15, 23, 42, 0.06)',
  xl:   '0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
  '2xl':'0 25px 50px -12px rgba(15, 23, 42, 0.25)',
  // Focus ring — accesibilidad
  focus: '0 0 0 3px rgba(255, 77, 15, 0.35)',
  focusDanger: '0 0 0 3px rgba(239, 68, 68, 0.35)',
} as const;

export const motion = {
  duration: {
    instant: '80ms',
    fast:    '150ms',
    normal:  '220ms',
    slow:    '320ms',
    slower:  '480ms',
  },
  easing: {
    standard:   'cubic-bezier(0.2, 0, 0, 1)',
    decelerate: 'cubic-bezier(0, 0, 0, 1)',
    accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
    spring:     'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

export const zIndex = {
  base:     0,
  dropdown: 1000,
  sticky:   1100,
  overlay:  1200,
  modal:    1300,
  popover:  1400,
  toast:    1500,
  tooltip:  1600,
} as const;

export const breakpoint = {
  sm:  '640px',
  md:  '768px',
  lg:  '1024px',
  xl:  '1280px',
  '2xl': '1536px',
} as const;
