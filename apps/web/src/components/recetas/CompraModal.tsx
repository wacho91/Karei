import { useState } from 'react';
import type { Ingrediente } from '@/types/inventario';
import { formatoCOP } from '@/lib/formato';

interface Props {
  ingrediente: Ingrediente;
  onClose: () => void;
  onConfirm: (cantidad: number, precioNuevo: number | null) => Promise<boolean>;
}

/** Modal de compra: llega mercancía al inventario y se amortigua el precio del mercado. */
export const CompraModal = ({ ingrediente, onClose, onConfirm }: Props) => {
  const [cantidad, setCantidad] = useState('');
  const [precio, setPrecio] = useState('');
  const [guardando, setGuardando] = useState(false);

  const enviar = async () => {
    if (!cantidad || Number(cantidad) <= 0 || guardando) return;
    setGuardando(true);
    const ok = await onConfirm(Number(cantidad), precio ? Number(precio) : null);
    setGuardando(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-white font-bold text-lg mb-1">📥 Registrar compra</h3>
        <p className="text-slate-400 text-sm capitalize mb-4">
          {ingrediente.name} · Stock actual: {ingrediente.stock}{ingrediente.usage_unit}
        </p>

        <label className="text-xs text-slate-400">
          Cantidad recibida (en {ingrediente.usage_unit})
        </label>
        <input
          type="number" min={0} step="any" autoFocus
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          placeholder={ingrediente.purchase_unit === 'PAQUETE'
            ? `Ej: ${ingrediente.content_qty} (un paquete)`
            : `Ej: ${ingrediente.content_qty}`}
          className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-3 outline-none focus:ring-2 focus:ring-amber-500"
        />

        <label className="text-xs text-slate-400">
          Precio pagado ahora ($) — opcional, si el mercado cambió
        </label>
        <input
          type="number" min={0}
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder={`Actual: ${formatoCOP(ingrediente.purchase_price)}`}
          className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-2 outline-none focus:ring-2 focus:ring-amber-500"
        />
        <p className="text-xs text-slate-500 mb-4">
          Si registras un precio nuevo, el costo de todas tus recetas se recalcula solo.
        </p>

        <div className="flex gap-2">
          <button
            onClick={enviar}
            disabled={guardando}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition-colors"
          >
            {guardando ? 'Registrando...' : '📥 Registrar compra'}
          </button>
          <button
            onClick={onClose}
            className="px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};