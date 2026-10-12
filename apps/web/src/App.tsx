import { Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';

// Página temporal para que Vite no explote y podamos ver el diseño base
const TempHome = () => (
  <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
    <div className="text-center">
      <h1 className="text-6xl font-bold text-amber-500 mb-4">Kārei 🍜</h1>
      <p className="text-slate-400 text-xl">SaaS GastroTech de Nivel Enterprise</p>
      <p className="text-slate-500 text-sm mt-6">Backend conectado. Frontend listo para construir módulos.</p>
    </div>
  </div>
);

export function App() {
  return (
    <Routes>
      {/* Cualquier ruta que visites, te mostrará el Login por ahora */}
      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
}

//export function App() {
//  return (
//    <BrowserRouter>
//      <Routes>
//        {/* Mientras no tengamos las páginas creadas, todo va a esta pantalla temporal */}
//        <Route path="*" element={<TempHome />} />
//      </Routes>
//    </BrowserRouter>
//  );
//}