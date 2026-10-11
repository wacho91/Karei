import { useEffect } from 'react';
import { useUiStore } from '@/store/uiStore';

/**
 * Aplica la clase .dark al <html> según el tema seleccionado.
 * Respeta prefers-color-scheme cuando theme === 'system'.
 */
export function useThemeEffect(): void {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && media.matches);
      root.classList.toggle('dark', isDark);
    };

    apply();
    if (theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
  }, [theme]);
}
