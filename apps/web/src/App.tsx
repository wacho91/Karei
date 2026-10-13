import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import TablesPage from './pages/TablesPage';

export function App() {
  const token = localStorage.getItem('karei_token');

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" /> : <LoginPage />} />
      
      <Route path="/" element={token ? <AppLayout /> : <Navigate to="/login" />}>
        <Route index element={<DashboardPage />} />
        {/* Nueva ruta del POS */}
        <Route path="pos" element={<TablesPage />} />
        <Route path="nuevo-pedido" element={<ProductsPage />} />
      </Route>
    </Routes>
  );
}