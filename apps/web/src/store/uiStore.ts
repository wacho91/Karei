import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  activeBranchId: string | null;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setActiveBranch: (branchId: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      sidebarCollapsed: false,
      activeBranchId: null,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setActiveBranch: (activeBranchId) => set({ activeBranchId }),
    }),
    {
      name: 'karei.ui',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
