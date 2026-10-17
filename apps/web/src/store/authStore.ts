import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Rol = 'ADMIN' | 'WAITER' | 'KITCHEN';

export interface UsuarioSesion {
  id: string;
  email: string;
  full_name: string;
  tenant_id: string;
  roles: Rol[];
}

interface AuthEstado {
  token: string | null;
  usuario: UsuarioSesion | null;
  setSession: (token: string, usuario: UsuarioSesion) => void;
  logout: () => void;
  tieneRol: (...roles: Rol[]) => boolean;
  homePorRol: () => string;
}

export const useAuthStore = create<AuthEstado>()(
  persist(
    (set, get) => ({
      token: null,
      usuario: null,

      setSession: (token, usuario) => set({ token, usuario }),

      logout: () => set({ token: null, usuario: null }),

      // ADMIN siempre pasa (misma regla que el backend)
      tieneRol: (...roles) => {
        const u = get().usuario;
        if (!u) return false;
        const misRoles = u.roles ?? [];
        if (misRoles.includes('ADMIN')) return true;
        return roles.some((r) => misRoles.includes(r));
      },

      homePorRol: () => {
        const u = get().usuario;
        const roles = u?.roles ?? [];
        if (roles.includes('ADMIN')) return '/dashboard';
        if (roles.includes('WAITER')) return '/pos';
        if (roles.includes('KITCHEN')) return '/kds';
        return '/login';
      },
    }),
    { name: 'karei-auth' }
  )
);