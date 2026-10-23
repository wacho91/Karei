import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import TablesPage from './pages/TablesPage';
import RecetasPage from './pages/RecetasPage';
import CocinaPage from './pages/CocinaPage';
import VentasPage from './pages/VentasPage';
import { useAuthStore, type Rol } from './store/authStore';

/** Exige sesión + uno de los roles (ADMIN pasa siempre, igual que el backend). */
function RutaProtegida({ roles }: { roles: Rol[] }) {
  const token = useAuthStore((s) => s.token);
  const tieneRol = useAuthStore((s) => s.tieneRol);

  if (!token) return <Navigate to="/login" replace />;
  if (!tieneRol(...roles)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Fix visual del tema oscuro: Chrome y Safari pintan las cajas autocompletadas
 *  (correo/contraseña guardados) de blanco/celeste por encima del diseño.
 *  Este CSS global les gana y las devuelve al tema Kārei en TODO el app,
 *  incluido el login. No toca lógica ni cambia nada más del diseño. */
function FixAutocompletado() {
  return (
    <style>{`
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus,
      input:-webkit-autofill:active,
      input:autofill,
      input:autofill:hover,
      input:autofill:focus,
      input:autofill:active {
        -webkit-text-fill-color: #f1f5f9 !important;
        caret-color: #f1f5f9 !important;
        -webkit-box-shadow: 0 0 0 1000px #1e293b inset !important;
        transition: background-color 9999s ease-in-out 0s;
      }
    `}</style>
  );
}

/** La raíz "/" no está guardada: solo decide a dónde ir cada rol (evita bucles). */
function Inicio() {
  const token = useAuthStore((s) => s.token);
  const usuario = useAuthStore((s) => s.usuario);
  const homePorRol = useAuthStore((s) => s.homePorRol);
  return <Navigate to={token && usuario ? homePorRol() : '/login'} replace />;
}

export function App() {
  return (
    <>
      <FixAutocompletado />
      <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Layout único; dentro, cada rama con su candado de rol */}
      <Route element={<AppLayout />}>
        <Route index element={<Inicio />} />

        {/* Solo ADMIN */}
        <Route element={<RutaProtegida roles={['ADMIN']} />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="ventas" element={<VentasPage />} />
          <Route path="recetas" element={<RecetasPage />} />
        </Route>

        {/* Meseros (ADMIN también puede) */}
        <Route element={<RutaProtegida roles={['WAITER']} />}>
          <Route path="pos" element={<TablesPage />} />
          <Route path="nuevo-pedido" element={<ProductsPage />} />
        </Route>

        {/* Cocina */}
        <Route element={<RutaProtegida roles={['KITCHEN']} />}>
          <Route path="cocina" element={<CocinaPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}