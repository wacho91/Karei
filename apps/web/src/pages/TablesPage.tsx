import { useState } from 'react';
import { MesaCard } from '@/components/pos/MesaCard';
import { PanelCuenta } from '@/components/pos/PanelCuenta';
import { MenuRapido } from '@/components/pos/MenuRapido';
import { useCrearMesa, useMesas } from '@/hooks/usePos';
import type { Mesa } from '@/types/pos';

export default function TablesPage() {
  const { data: mesas, isLoading } = useMesas();
  const crearMesa = useCrearMesa();
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const mesaSeleccionada: Mesa | null = mesas?.find((m) => m.id === seleccionadaId) ?? null;
  const pedidoBloqueado = mesaSeleccionada?.status !== 'AVAILABLE' && !!mesaSeleccionada;

  // Zonas: lo que venga en zone, y el resto cae en "Salón"
  const zonas = new Map<string, Mesa[]>();
  mesas?.forEach((m) => {
    const zona = m.zone ?? 'Salón';
    if (!zonas.has(zona)) zonas.set(zona, []);
    zonas.get(zona)!.push(m);
  });

  const crearDemo = () => {
    setMensaje('Creando mesas de demostración...');
    const codigos = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'];
    Promise.allSettled(
      codigos.map((code, i) =>
        crearMesa.mutateAsync({
          code,
          name: i < 6 ? `Mesa ${i + 1}` : `Terraza ${i - 5}`,
          capacity: 4,
          zone: i < 6 ? 'Salón' : 'Terraza',
        }),
      ),
    ).then(() => setMensaje('✅ Mesas listas (las existentes se conservan)'));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-3xl font-bold text-white">POS / Comedor 🍽️</h1>
        <button
          onClick={crearDemo}
          disabled={crearMesa.isPending}
          className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          ⚡ Crear mesas demo
        </button>
      </div>
      <p className="text-slate-400 mb-6">
        Mapa del restaurante. Clic en una mesa para abrir la cuenta o tomar el pedido.
      </p>

      {mensaje && (
        <div className="bg-slate-800 border border-slate-600 text-slate-300 p-3 rounded-lg mb-6 text-sm">
          {mensaje}
        </div>
      )}

      <div className="flex gap-8">
        {/* === PLANO DEL COMEDOR === */}
        <div
          className="w-2/3 bg-slate-800/10 p-8 rounded-2xl border border-slate-700/30 shadow-inner"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        >
          {isLoading ? (
            <p className="text-slate-500 text-center py-16">Cargando mesas...</p>
          ) : !mesas || mesas.length === 0 ? (
            <div className="text-center py-16">
              <span className="text-6xl">🪑</span>
              <p className="text-slate-400 mt-4">No hay mesas aún. Usa "Crear mesas demo" arriba.</p>
            </div>
          ) : (
            [...zonas.entries()].map(([zona, mesasZona], idx) => (
              <div key={zona} className={idx > 0 ? 'border-t border-slate-700/50 pt-10 mt-10' : ''}>
                <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  {zona}
                </h3>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-8 justify-items-center">
                  {mesasZona.map((mesa) => (
                    <MesaCard
                      key={mesa.id}
                      mesa={mesa}
                      seleccionada={seleccionadaId === mesa.id}
                      onClick={() => {
                        setSeleccionadaId(mesa.id);
                        setMensaje(null);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* === PANEL DE CUENTA + MENÚ === */}
        <div className="w-1/3 flex flex-col gap-6">
          {mesaSeleccionada ? (
            <>
              <PanelCuenta mesa={mesaSeleccionada} />
              {mesaSeleccionada.status !== 'AVAILABLE' && (
                <MenuRapido
                  tableId={mesaSeleccionada.id}
                  bloqueado={!pedidoBloqueado}
                  onAgregado={(nombre) => setMensaje(`✅ ${nombre} agregado a la cuenta`)}
                />
              )}
            </>
          ) : (
            <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl flex flex-col items-center justify-center h-48 text-slate-500">
              <span className="text-6xl mb-6">🛎️</span>
              <p className="text-lg font-medium text-slate-400">Selecciona una mesa</p>
              <p className="text-sm text-slate-600">para ver la cuenta en vivo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}