// Kārei · modal para crear una mesa nueva
import { useState } from 'react';
import type { DatosMesa } from '../../lib/mesasApi';

interface Props {
  onCrear: (d: DatosMesa) => Promise<void>;
  onCerrar: () => void;
}

export default function ModalNuevaMesa({ onCrear, onCerrar }: Props) {
  const [nombre, setNombre] = useState('');
  const [zona, setZona] = useState('Salón');
  const [capacidad, setCapacidad] = useState(4);
  const [ocupado, setOcupado] = useState(false);

  async function crear() {
    if (!nombre.trim()) return;
    setOcupado(true);
    await onCrear({ nombre: nombre.trim(), zona: zona.trim() || 'Salón', capacidad: Number(capacidad) || 4 });
    setOcupado(false);
    onCerrar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold mb-4">Nueva mesa</h2>

        <label className="block text-xs text-zinc-400 mb-1">Nombre / código</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Mesa 5"
          className="w-full mb-3 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-500" />

        <label className="block text-xs text-zinc-400 mb-1">Zona</label>
        <select value={zona} onChange={(e) => setZona(e.target.value)}
          className="w-full mb-3 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-500">
          {['Salón', 'Terraza', 'Bar', 'VIP'].map((z) => (<option key={z} value={z}>{z}</option>))}
        </select>

        <label className="block text-xs text-zinc-400 mb-1">Capacidad (personas)</label>
        <input type="number" min={1} value={capacidad} onChange={(e) => setCapacidad(Number(e.target.value))}
          className="w-full mb-4 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-500" />

        <div className="flex gap-2">
          <button onClick={onCerrar} className="flex-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 py-2.5 font-medium">Cancelar</button>
          <button onClick={crear} disabled={!nombre.trim() || ocupado}
            className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 py-2.5 font-semibold text-zinc-950 disabled:opacity-50">
            {ocupado ? 'Creando…' : 'Crear mesa'}
          </button>
        </div>
      </div>
    </div>
  );
}