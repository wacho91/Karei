import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@karei.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulamos un login por ahora para probar la vista
    setTimeout(() => {
      setLoading(false);
      alert('¡Login de prueba! En el próximo paso conectaremos esto al backend.');
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-slate-700">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-extrabold text-amber-500 mb-2">Kārei 🍜</h1>
          <p className="text-slate-400 tracking-wide font-medium">SaaS GastroTech de Nivel Enterprise</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Correo Electrónico</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition"
              placeholder="admin@karei.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Contraseña / PIN</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition"
              placeholder="********"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-3 rounded-lg transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verificando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}