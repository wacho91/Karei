import { useState } from 'react';
import { MesaCard } from '@/components/pos/MesaCard';
import { PanelCuenta } from '@/components/pos/PanelCuenta';
import { MenuRapido } from '@/components/pos/MenuRapido';
import { ModalMesa } from '@/components/pos/ModalMesa';
import {
  useActualizarMesa, useCrearMesa, useDesactivarMesa, useMesas,
} from '@/hooks/usePos';
import type { Mesa, MesaInput } from '@/types/pos';

export default function TablesPage() {
  const { data: mesas, isLoading } = useMesas();
  const crearMesa = useCrearMesa();
  const actualizarMesa = useActualizarMesa();
  const desactivarMesa = useDesactivarMesa();

  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  const mesaSeleccionada: Mesa | null = mesas?.find((m) => m.id === seleccionadaId) ?? null;

  // Zonas dinámicas: lo que venga en zone, y el resto cae en "Salón"
  const zonas = new Map<string, Mesa[]>();
  mesas?.forEach((m) => {
    const zona = m.zone ?? 'Salón';
    if (!zonas.has(zona)) zonas.set(zona, []);
    zonas.get(zona)!.push(m);
  });

  const guardarMesa = async (datos: MesaInput, mesaId: string | null): Promise<boolean> => {
    try {
      if (mesaId) {
        const { code, ...resto } = datos;
        await actualizarMesa.mutateAsync({ mesaId, datos: resto });
        setMensaje('✅ Mesa actualizada');
      } else {
        await crearMesa.mutateAsync(datos);
        setMensaje(`✅ Mesa ${datos.code} lista`);
      }
      return true;
    } catch (err: unknown) {
      const detalle = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMensaje(`❌ ${detalle ?? 'Error al guardar la mesa'}`);
      return false;
    }
  };

  const desactivar = async () => {
    if (!mesaSeleccionada) return;
    if (!window.confirm(`¿Desactivar ${mesaSeleccionada.name}? Su historial de ventas se conserva, pero dejará de aparecer en el mapa.`)) return;
    const res = await desactivarMesa.mutateAsync(mesaSeleccionada.id);
    setMensaje(`📦 ${res.mensaje}`);
    setSeleccionadaId(null);
  };

  const crearDemo = async () => {
    setMensaje('Creando mesas de demostración...');
    const datos = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'T1', 'T2'].map((code, i) => ({
      code,
      name: code.startsWith('T') ? `Terraza ${code.slice(1)}` : `Mesa ${code.slice(1)}`,
      capacity: 4,
      zone: code.startsWith('T') ? 'Terraza' : 'Salón',
    }));
    const resultados = await Promise.allSettled(datos.map((d) => crearMesa.mutateAsync(d)));
    const ok = resultados.filter((r) => r.status === 'fulfilled').length;
    setMensaje(`✅ ${ok} mesas listas (las existentes se conservan)`);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-3xl font-bold text-white">POS / Comedor 🍽️</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setModalAbierto(true)}
            className="bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-bold px-4 py-2 rounded-lg transition-colors"
          >
            ➕ Nueva mesa
          </button>
          <button
            onClick={crearDemo}
            disabled={crearMesa.isPending}
            className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            ⚡ Crear mesas demo
          </button>
        </div>
      </div>
      <p className="text-slate-400 mb-6">
        Mapa del restaurante. Clic en una mesa para abrir la cuenta o tomar el pedido.
      </p>

      {mensaje && (
        <div className="bg-slate-800 border border-slate-600 text-slate-300 p-3 rounded-lg mb-6 text-sm">
          {mensaje}
        </div>
      )}

      {modalAbierto && (
        <ModalMesa
          mesa={null}
          onClose={() => setModalAbierto(false)}
          onSave={guardarMesa}
        />
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
              <p className="text-slate-400 mt-4">No hay mesas aún. Crea la primera con "➕ Nueva mesa".</p>
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

        {/* === PANEL DERECHO === */}
        <div className="w-1/3 flex flex-col gap-6">
          {mesaSeleccionada ? (
            <>
              {/* Barra de gestión de la mesa */}
              <div className="flex gap-2">
                <button
                  onClick={() => setModalAbierto(true)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm py-2 rounded-lg transition-colors"
                >
                  ✏️ Editar
                </button>
                {mesaSeleccionada.status === 'AVAILABLE' && (
                  <button
                    onClick={desactivar}
                    disabled={desactivarMesa.isPending}
                    className="flex-1 bg-slate-700 hover:bg-rose-600/80 text-white text-sm py-2 rounded-lg transition-colors"
                  >
                    📦 Desactivar
                  </button>
                )}
              </div>

              {modalAbierto && (
                <ModalMesa mesa={mesaSeleccionada} onClose={() => setModalAbierto(false)} onSave={guardarMesa} />
              )}

              <PanelCuenta mesa={mesaSeleccionada} />
              {mesaSeleccionada.status !== 'AVAILABLE' && (
                <MenuRapido
                  tableId={mesaSeleccionada.id}
                  bloqueado={mesaSeleccionada.order_id === null || true}
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