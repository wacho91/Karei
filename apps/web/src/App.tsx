import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';

export function App() {
  // Verificamos si hay token guardado en el navegador
  const token = localStorage.getItem('karei_token');

  return (
    <Routes>
      {/* Si va al login y ya tiene token, lo mandamos al Dashboard */}
      <Route path="/login" element={token ? <Navigate to="/" /> : <LoginPage />} />
      
      {/* Si va a la raíz y no tiene token, lo mandamos al login */}
      <Route path="/" element={token ? <AppLayout /> : <Navigate to="/login" />}>
        <Route index element={<DashboardPage />} />
      </Route>
    </Routes>
  );
}