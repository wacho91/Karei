# @karei/ui-kit — Design System

Design System premium de Karei. Inspirado en Stripe (densidad, precisión) y Apple (claridad, jerarquía).

## Principios

1. **Tokens primero.** Ningún componente usa hex, px o ms hardcodeados. Todo viene de `tokens/`.
2. **Semántico sobre literal.** Los componentes consumen `semanticColors`, no `palette.ember[500]`.
3. **Dark mode first-class.** Cada token tiene variante `light` y `dark`.
4. **Accesibilidad AA mínimo.** Contraste 4.5:1 en texto, focus ring visible, `prefers-reduced-motion` respetado.
5. **Densidad enterprise.** El POS se usa con prisa: targets táctiles ≥ 44px, tabular-nums en precios.

## Estructura
