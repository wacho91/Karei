import { useState } from 'react';
import { useAbrirMesa, useCobrar, useEnviarACocina, usePedidoActivo, useQuitarItem } from '@/hooks/usePos';
import type { Mesa } from '@/types/pos';
import { formatoCOP } from '@/lib/formato';

const PORCENTAJES = [0, 10, 15];

export const PanelCuenta = ({ mesa }: { mesa: Mesa }) => {
  const { data: pedido, isLoading } = usePedidoActivo(mesa.id);
  const abrirMesa = useAbrirMesa();
  const enviarCocina = useEnviarACocina();
  const quitarItem = useQuitarItem();
  const cobrar = useCobrar();

  const [pctPropina, setPctPropina] = useState(10);
  const [metodo, setMetodo] = useState('CASH');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const propina = pedido ? Math.round((pedido.subtotal * pctPropina) / 100) : 0;
  const total = pedido ? pedido.subtotal + propina : 0;
  const editable = pedido?.status === 'CONFIRMED'; // aún no fue a cocina

  const handleAbrir = () => abrirMesa.mutate(mesa.id, { onError: (e) => setMensaje(extraerError(e)) });

  const handleCocina = () => {
    if (!pedido) return;
    enviarCocina.mutate(pedido.id, {
      onSuccess: (res) => {
        setMensaje(res.warnings.length ? res.warnings.join(' · ') : '📤 Pedido enviado a cocina');
      },
      onError: (e) => setMensaje(extraerError(e)),
    });
  };

  const handleCobrar = () => {
    if (!pedido) return;
    cobrar.mutate(
      { tableId: mesa.id, tip: propina, method: metodo },
      {
        onSuccess: (res) => {
          setMensaje(`✅ ${res.order_number} cobrada: ${formatoCOP(res.total)}`);
          setPctPropina(10);
        },
        onError: (e) => setMensaje(extraerError(e)),
      },
    );
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-sm backdrop-blur-sm">
      <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
        <div>
          <h2 className="text-2xl font-bold text-white">{mesa.name}</h2>
          <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${mesa.status === 'AVAILABLE' ? 'text-emerald-400' : 'text-amber-400'}`}>
            {mesa.status === 'AVAILABLE' ? 'Libre' : 'Ocupada'} · {mesa.capacity} puestos
          </p>
        </div>
        {pedido && (
          <span className="text-xs text-slate-400 font-mono">{pedido.order_number}</span>
        )}
      </div>

      {mensaje && (
        <div className="bg-slate-900 border border-slate-600 text-slate-300 p-2.5 rounded-lg mb-4 text-xs">
          {mensaje}
        </div>
      )}

      {mesa.status === 'AVAILABLE' ? (
        <div className="flex flex-col items-center py-6">
          <span className="text-5xl mb-4">🪑</span>
          <button
            onClick={handleAbrir}
            disabled={abrirMesa.isPending}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 font-bold py-3 rounded-lg transition-colors"
          >
            {abrirMesa.isPending ? 'Abriendo...' : '🪑 Abrir Mesa (llegaron clientes)'}
          </button>
        </div>
      ) : isLoading || !pedido ? (
        <p className="text-slate-500 text-sm text-center py-6">Cargando cuenta...</p>
      ) : (
        <>
          <div className="max-h-44 overflow-y-auto mb-4 py-2">
            {pedido.items.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">Sin items. Agrega del menú ↓</p>
            ) : (
              <ul className="space-y-3">
                {pedido.items.map((item) => (
                  <li key={item.id} className="flex justify-between items-center text-slate-300 text-sm group">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-700 text-amber-400 w-7 h-7 flex items-center justify-center rounded-md font-bold text-xs">
                        {item.quantity}x
                      </span>
                      <div>
                        <span>{item.recipe_name}</span>
                        {item.notes && <p className="text-[10px] text-slate-500">📝 {item.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatoCOP(item.quantity * item.unit_price)}</span>
                      {editable && (
                        <button
                          onClick={() => quitarItem.mutate({ tableId: mesa.id, itemId: item.id })}
                          className="text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                          title="Quitar"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3 bg-slate-900/50 p-4 rounded-xl border border-slate-700">
            <div className="flex justify-between text-sm text-slate-400">
              <span>Subtotal</span>
              <span>{formatoCOP(pedido.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Propina</span>
              <div className="flex gap-2">
                {PORCENTAJES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPctPropina(p)}
                    className={`px-3 py-1 text-xs rounded-lg ${pctPropina === p ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}
                  >
                    {p}%
                  </button>
                ))}
                <span className="text-xs text-slate-500 self-center">{formatoCOP(propina)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center border-t border-slate-700 pt-3">
              <span className="text-lg font-bold text-white">Total</span>
              <span className="text-2xl font-extrabold text-amber-500">{formatoCOP(total)}</span>
            </div>

            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white p-2.5 rounded-lg text-sm outline-none"
            >
              <option value="CASH">💵 Efectivo</option>
              <option value="CARD">💳 Tarjeta</option>
              <option value="TRANSFER">🏦 Transferencia</option>
              <option value="NEQUI">📱 Nequi</option>
            </select>

            <div className="flex gap-2">
              {editable && pedido.items.length > 0 && (
                <button
                  onClick={handleCocina}
                  disabled={enviarCocina.isPending}
                  className="flex-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-bold py-3 rounded-lg transition-colors"
                >
                  📤 A cocina
                </button>
              )}
              <button
                onClick={handleCobrar}
                disabled={cobrar.isPending || pedido.items.length === 0}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold py-3 rounded-lg transition-colors"
              >
                {cobrar.isPending ? 'Cobrando...' : '💵 Cobrar y liberar'}
              </button>
            </div>
            {!editable && pedido.status !== 'PAID' && (
              <p className="text-[10px] text-slate-500 text-center">
                🔒 En cocina: no se pueden agregar ni quitar items de esta ronda
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

function extraerError(err: unknown): string {
  const detalle = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detalle ?? 'Ocurrió un error inesperado';
}