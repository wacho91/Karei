import { useState } from 'react';
import { MesaCard } from '@/components/pos/MesaCard';
import { PanelCuenta } from '@/components/pos/PanelCuenta';
import { MenuRapido } from '@/components/pos/MenuRapido';
import { ModalMesa } from '@/components/pos/ModalMesa';
import {
  useActualizarMesa, useCrearMesa, useDesactivarMesa, useMesas,
} from '@/hooks/usePos';
import { confirmarAccion, toastError, toastExito, toastInfo } from '@/lib/alertas';
import type { Mesa, MesaInput } from '@/types/pos';

export default function TablesPage() {
  const { data: mesas, isLoading } = useMesas();
  const crearMesa = useCrearMesa();
  const actualizarMesa = useActualizarMesa();
  const desactivarMesa = useDesactivarMesa();

  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [modalCreacion, setModalCreacion] = useState(false);
  const [modalEdicion, setModalEdicion] = useState(false);

  const mesaSeleccionada: Mesa | null = mesas?.find((m) => m.id === seleccionadaId) ?? null;

  const zonas = new Map<string, Mesa[]>();
  mesas?.forEach((m) => {
    const zona = m.zone ?? 'Salón';
    if (!zonas.has(zona)) zonas.set(zona, []);
    zonas.get(zona)!.push(m);
  });

  const guardarMesa = async (datos: MesaInput, mesaId: string | null): Promise<boolean> => {
    try {
      if (mesaId) {
        await actualizarMesa.mutateAsync({ mesaId, datos });
        toastExito(`${datos.name} actualizada`);
      } else {
        await crearMesa.mutateAsync(datos);
        toastExito(`${datos.name} lista (${datos.zone ?? 'Salón'})`);
      }
      return true;
    } catch (err: unknown) {
      const detalle = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toastError(detalle ?? 'Error al guardar la mesa');
      return false;
    }
  };

  const desactivar = async () => {
    if (!mesaSeleccionada) return;
    const ok = await confirmarAccion(
      `¿Desactivar ${mesaSeleccionada.name}?`,
      'Su historial de ventas se conserva, pero dejará de aparecer en el mapa.',
      'Sí, desactivar',
    );
    if (!ok) return;
    const res = await desactivarMesa.mutateAsync(mesaSeleccionada.id);
    toastInfo(res.mensaje);
    setSeleccionadaId(null);
  };

  const crearDemo = async () => {
    toastInfo('Creando el restaurante completo...');
    // 6 mesas en Salón + 4 en Terraza (las existentes se conservan)
    const datos = [
      ...['M1', 'M2', 'M3', 'M4', 'M5', 'M6'].map((code, i) => ({
        code, name: `Mesa ${i + 1}`, capacity: 4, zone: 'Salón',
      })),
      ...['T1', 'T2', 'T3', 'T4'].map((code, i) => ({
        code, name: `Terraza ${i + 1}`, capacity: 4, zone: 'Terraza',
      })),
    ];
    const resultados = await Promise.allSettled(datos.map((d) => crearMesa.mutateAsync(d)));
    const ok = resultados.filter((r) => r.status === 'fulfilled').length;
    const yaHabia = datos.length - ok;
    toastExito(`${ok} mesas listas${yaHabia > 0 ? ` (${yaHabia} ya existían)` : ''} 🪑`);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-3xl font-bold text-white">POS / Comedor 🍽️</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setModalCreacion(true)}
            className="bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-bold px-4 py-2 rounded-lg transition-colors"
          >
            ➕ Nueva mesa
          </button>
          <button
            onClick={crearDemo}
            disabled={crearMesa.isPending}
            className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            ⚡ Crear restaurante demo
          </button>
        </div>
      </div>
      <p className="text-slate-400 mb-6">
        Mapa del restaurante. Clic en una mesa para abrir la cuenta o tomar el pedido.
      </p>

      {modalCreacion && (
        <ModalMesa mesa={null} onClose={() => setModalCreacion(false)} onSave={guardarMesa} />
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
              <p className="text-slate-400 mt-4">No hay mesas aún. Crea la primera o usa el botón demo.</p>
            </div>
          ) : (
            [...zonas.entries()].map(([zona, mesasZona], idx) => (
              <div key={zona} className={idx > 0 ? 'border-t border-slate-700/50 pt-10 mt-10' : ''}>
                <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  {zona === 'Terraza' ? '🌙 ' : ''}{zona}
                </h3>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-8 justify-items-center">
                  {mesasZona.map((mesa) => (
                    <MesaCard
                      key={mesa.id}
                      mesa={mesa}
                      seleccionada={seleccionadaId === mesa.id}
                      onClick={() => setSeleccionadaId(mesa.id)}
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
              <div className="flex gap-2">
                <button
                  onClick={() => setModalEdicion(true)}
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

              {modalEdicion && (
                <ModalMesa mesa={mesaSeleccionada} onClose={() => setModalEdicion(false)} onSave={guardarMesa} />
              )}

              <PanelCuenta mesa={mesaSeleccionada} />
              {mesaSeleccionada.status !== 'AVAILABLE' && (
                <MenuRapido
                  tableId={mesaSeleccionada.id}
                  bloqueado={mesaSeleccionada.order_id !== null && mesaSeleccionada.status === 'OCCUPIED'}
                  onAgregado={(nombre) => toastExito(`${nombre} agregado a la cuenta`)}
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