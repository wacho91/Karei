import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import TablesPage from './pages/TablesPage';
import RecetasPage from './pages/RecetasPage';
import CocinaPage from './pages/CocinaPage';

export function App() {
  const token = localStorage.getItem('karei_token');

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" /> : <LoginPage />} />
      
      <Route path="/" element={token ? <AppLayout /> : <Navigate to="/login" />}>
        <Route index element={<DashboardPage />} />
        <Route path="nuevo-pedido" element={<ProductsPage />} />
        <Route path="pos" element={<TablesPage />} />
        <Route path="recetas" element={<RecetasPage />} />
        <Route path="cocina" element={<CocinaPage />} />
      </Route>
    </Routes>
  );
}