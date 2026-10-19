// src/components/mesas/ModalNuevaMesa.tsx — v2
// FIX E-9: solo se pinta si abierto === true (o si se monta sin la prop).
// Nada de "salir solo": false, funciones o valores raros → return null.
import { useEffect, useState } from 'react';
import { alertaAviso } from '../../lib/alertas';

type Props = {
  abierto?: boolean;
  onCerrar?: () => void;
  cerrar?: () => void;
  alCerrar?: () => void;
  onCrear?: (datos: any) => any;
  crear?: (datos: any) => any;
  alCrear?: (datos: any) => any;
};

export default function ModalNuevaMesa(props: Props) {
  const p: any = props;
  const visible = p.abierto === undefined ? true : p.abierto === true;
  const [nombre, setNombre] = useState('');
  const [area, setArea] = useState('Salón');
  const [capacidad, setCapacidad] = useState(4);
  const [creando, setCreando] = useState(false);

  const cerrar = p.onCerrar ?? p.cerrar ?? p.alCerrar;
  const crear = p.onCrear ?? p.crear ?? p.alCrear;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar?.(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [cerrar]);

  if (!visible) return null; // ⬅ BLINDAJE: jamás se pinta si no toca

  const enviar = async () => {
    if (!nombre.trim()) { alertaAviso('Escribe el nombre o código de la mesa'); return; }
    const cap = Number(capacidad);
    if (!cap || cap < 1) { alertaAviso('La capacidad debe ser al menos 1'); return; }
    setCreando(true);
    try {
      await crear?.({
        nombre: nombre.trim(), name: nombre.trim(), code: nombre.trim(),
        area, zona: area, zone: area, capacidad: cap, capacity: cap,
      });
    } finally { setCreando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={() => cerrar?.()}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-sm p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white">Nueva mesa</h2>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Nombre o código</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: M7"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Área</label>
          <select value={area} onChange={(e) => setArea(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500">
            <option>Salón</option>
            <option>Terraza</option>
            <option>Bar</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Capacidad</label>
          <input type="number" min={1} value={capacidad}
            onChange={(e) => setCapacidad(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => cerrar?.()}
            className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 text-sm hover:bg-slate-600">Cancelar</button>
          <button onClick={enviar} disabled={creando}
            className="px-4 py-2 rounded-lg bg-amber-500 text-slate-900 text-sm font-semibold hover:bg-amber-400 disabled:opacity-50">
            {creando ? 'Creando…' : 'Crear mesa'}
          </button>
        </div>
      </div>
    </div>
  );
}