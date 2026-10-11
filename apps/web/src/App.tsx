import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { TablesPage } from '@/pages/TablesPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { KdsPage } from '@/pages/KdsPage';
import { LoginPage } from '@/pages/LoginPage';
import { useAuthStore } from '@/store/authStore';
import { useThemeEffect } from '@/hooks/useThemeEffect';

export function App() {
  useThemeEffect();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tables" element={<TablesPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/kds" element={<KdsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}
