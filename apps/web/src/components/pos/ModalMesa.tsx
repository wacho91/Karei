import { useEffect, useState } from 'react';
import type { Mesa, MesaInput } from '@/types/pos';

interface Props {
  mesa: Mesa | null; // null = crear nueva
  onClose: () => void;
  onSave: (datos: MesaInput, mesaId: string | null) => Promise<boolean>;
}

const inicial = { code: '', name: '', capacity: 4, zone: 'Salón' };

export const ModalMesa = ({ mesa, onClose, onSave }: Props) => {
  const [form, setForm] = useState(inicial);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setForm(
      mesa
        ? { code: mesa.code, name: mesa.name, capacity: mesa.capacity, zone: mesa.zone ?? 'Salón' }
        : inicial,
    );
  }, [mesa]);

  const enviar = async () => {
    if (guardando || !form.code || !form.name || form.capacity < 1) return;
    setGuardando(true);
    const ok = await onSave({ ...form, zone: form.zone || null }, mesa?.id ?? null);
    setGuardando(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-white font-bold text-lg mb-1">
          {mesa ? '✏️ Editar mesa' : '➕ Nueva mesa'}
        </h3>
        <p className="text-slate-400 text-sm mb-4">
          {mesa ? 'Actualiza los datos de la mesa.' : 'Registra una mesa del restaurante.'}
        </p>

        <label className="text-xs text-slate-400">Código (corto y único)</label>
        <input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          disabled={!!mesa}
          placeholder="Ej: M1, T2"
          className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-3 outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
        />

        <label className="text-xs text-slate-400">Nombre visible</label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Ej: Mesa 1, Terraza 2"
          className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-3 outline-none focus:ring-2 focus:ring-amber-500"
        />

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-slate-400">Capacidad (puestos)</label>
            <input
              type="number" min={1} max={50}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">Zona</label>
            <input
              value={form.zone ?? ''}
              onChange={(e) => setForm({ ...form, zone: e.target.value })}
              placeholder="Ej: Salón, Terraza"
              className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={enviar}
            disabled={guardando}
            className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 font-bold py-2.5 rounded-lg transition-colors"
          >
            {guardando ? 'Guardando...' : '💾 Guardar'}
          </button>
          <button onClick={onClose} className="px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};