/**
 * Configuración tipada de variables de entorno.
 * Falla rápido si falta algo crítico.
 */
interface Env {
  apiBaseUrl: string;
  wsUrl: string;
  defaultTenantSlug: string;
  enableKds: boolean;
  enableDian: boolean;
  enableAnalytics: boolean;
  appEnv: 'development' | 'staging' | 'production';
  sentryDsn: string | null;
}

function bool(v: string | undefined, fallback = false): boolean {
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

export const env: Env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1',
  wsUrl: import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws',
  defaultTenantSlug: import.meta.env.VITE_DEFAULT_TENANT_SLUG ?? 'karei-demo',
  enableKds: bool(import.meta.env.VITE_ENABLE_KDS, true),
  enableDian: bool(import.meta.env.VITE_ENABLE_DIAN, true),
  enableAnalytics: bool(import.meta.env.VITE_ENABLE_ANALYTICS, true),
  appEnv: (import.meta.env.VITE_APP_ENV as Env['appEnv']) ?? 'development',
  sentryDsn: import.meta.env.VITE_SENTRY_DSN || null,
};
