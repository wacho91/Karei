import { useState } from 'react';
import { useEnviarNuevaComanda, useMenuRecetas, useMesas } from '@/hooks/usePos';
import { formatoCOP } from '@/lib/formato';
import { toastError, toastExito } from '@/lib/alertas';

type ItemCarrito = { recipe_id: string; name: string; price: number; quantity: number };

export default function ProductsPage() {
  const { data: recetas, isLoading } = useMenuRecetas();
  const { data: mesas } = useMesas();
  const enviar = useEnviarNuevaComanda();

  const [mesaId, setMesaId] = useState('');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  const mesaSeleccionada = mesas?.find((m) => m.id === mesaId);
  const subtotal = carrito.reduce((s, i) => s + i.price * i.quantity, 0);

  const agregarAlCarrito = (r: { id: string; name: string; price: number }) => {
    setCarrito((prev) => {
      const existe = prev.find((i) => i.recipe_id === r.id);
      if (existe) {
        return prev.map((i) =>
          i.recipe_id === r.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { recipe_id: r.id, name: r.name, price: r.price, quantity: 1 }];
    });
  };

  const cambiarCantidad = (recipeId: string, delta: number) => {
    setCarrito((prev) =>
      prev
        .map((i) =>
          i.recipe_id === recipeId ? { ...i, quantity: i.quantity + delta } : i,
        )
        .filter((i) => i.quantity > 0),
    );
  };

  const enviarAMesa = async (directoACocina: boolean) => {
    if (!mesaId || carrito.length === 0 || enviar.isPending) return;
    try {
      await enviar.mutateAsync({
        tableId: mesaId,
        items: carrito.map(({ recipe_id, quantity }) => ({ recipe_id, quantity })),
        directoACocina,
      });
      toastExito(
        directoACocina
          ? `🚀 Pedido enviado a cocina (${mesaSeleccionada?.name})`
          : `🧾 Agregado a la cuenta de ${mesaSeleccionada?.name}`,
      );
      setCarrito([]);
    } catch (err: unknown) {
      const axiosDetalle = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const mensaje = axiosDetalle ?? (err as Error)?.message ?? 'Error al enviar el pedido';
      toastError(mensaje);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">Nuevo Pedido 📝</h1>
      <p className="text-slate-400 mb-8">
        Selecciona la mesa, arma el pedido del menú real y envíalo a la cuenta.
      </p>

      <div className="flex gap-8">
        {/* === MENÚ REAL DE LA BASE DE DATOS === */}
        <div className="w-2/3">
          <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Menú</h3>
          {isLoading ? (
            <p className="text-slate-500 text-center py-16">Cargando menú...</p>
          ) : !recetas || recetas.length === 0 ? (
            <div className="text-center py-16">
              <span className="text-6xl">📖</span>
              <p className="text-slate-400 mt-4">
                No hay recetas activas. Créalas en el módulo de Recetas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {recetas.map((r) => (
                <button
                  key={r.id}
                  onClick={() => agregarAlCarrito(r)}
                  className="bg-slate-800/50 hover:bg-amber-500/10 hover:border-amber-500/50 border border-slate-700 text-white font-medium p-4 rounded-xl transition-colors text-left"
                >
                  {r.name}
                  <span className="block text-amber-500 text-sm mt-1">{formatoCOP(r.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* === CARRITO === */}
        <div className="w-1/3">
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl">
            <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Carrito</h3>

            <label className="text-xs text-slate-400">Mesa destino</label>
            <select
              value={mesaId}
              onChange={(e) => setMesaId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-4 outline-none"
            >
              <option value="">Seleccionar mesa...</option>
              {mesas?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.status === 'AVAILABLE' ? '(libre)' : `(ocupada · ${formatoCOP(m.open_total)})`}
                </option>
              ))}
            </select>

            {carrito.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">Agrega productos al carrito.</p>
            ) : (
              <ul className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {carrito.map((item) => (
                  <li key={item.recipe_id} className="flex justify-between items-center text-slate-300 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => cambiarCantidad(item.recipe_id, -1)}
                          className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-white text-xs"
                        >
                          −
                        </button>
                        <span className="w-7 text-center font-bold text-amber-400">{item.quantity}</span>
                        <button
                          onClick={() => cambiarCantidad(item.recipe_id, 1)}
                          className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-white text-xs"
                        >
                          +
                        </button>
                      </div>
                      <span>{item.name}</span>
                    </div>
                    <span className="font-medium">{formatoCOP(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-between border-t border-slate-700 pt-3 mb-4">
              <span className="text-slate-400">Subtotal</span>
              <span className="text-lg font-bold text-white">{formatoCOP(subtotal)}</span>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => enviarAMesa(false)}
                disabled={!mesaId || carrito.length === 0 || enviar.isPending}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-900 font-bold py-3 rounded-lg transition-colors"
              >
                🧾 Agregar a la cuenta
              </button>
              <button
                onClick={() => enviarAMesa(true)}
                disabled={!mesaId || carrito.length === 0 || enviar.isPending}
                className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-bold py-3 rounded-lg transition-colors"
              >
                {enviar.isPending ? 'Enviando...' : '🚀 Enviar directo a cocina'}
              </button>
            </div>
            {mesaSeleccionada && mesaSeleccionada.status !== 'AVAILABLE' && (
              <p className="text-[10px] text-slate-500 mt-2 text-center">
                {mesaSeleccionada.name} está ocupada: los items se suman a su cuenta abierta.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}