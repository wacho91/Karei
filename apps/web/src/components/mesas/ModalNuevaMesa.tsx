// Crear una mesa nueva: nombre, zona y capacidad
import { useState } from 'react';

interface Props {
  onCrear: (datos: { nombre: string; zona: string; capacidad: number }) => void;
  onCerrar: () => void;
}

export default function ModalNuevaMesa({ onCrear, onCerrar }: Props) {
  const [nombre, setNombre] = useState('');
  const [zona, setZona] = useState('Salón');
  const [capacidad, setCapacidad] = useState(4);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-zinc-100">Nueva mesa</h2>

        <label className="mt-3 block text-xs font-semibold uppercase tracking-widest text-zinc-500">Nombre</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="M4"
          className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />

        <label className="mt-3 block text-xs font-semibold uppercase tracking-widest text-zinc-500">Zona</label>
        <select value={zona} onChange={e => setZona(e.target.value)}
          className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
          <option>Salón</option>
          <option>Terraza</option>
          <option>Barra</option>
        </select>

        <label className="mt-3 block text-xs font-semibold uppercase tracking-widest text-zinc-500">Capacidad (personas)</label>
        <input type="number" min={1} value={capacidad} onChange={e => setCapacidad(Number(e.target.value))}
          className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />

        <div className="mt-4 flex gap-2">
          <button onClick={onCerrar} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm text-zinc-300 hover:border-zinc-500">Cancelar</button>
          <button disabled={!nombre.trim()} onClick={() => onCrear({ nombre: nombre.trim(), zona, capacidad })}
            className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40">
            Crear mesa
          </button>
        </div>
      </div>
    </div>
  );
}