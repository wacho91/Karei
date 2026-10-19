// Mesas agrupadas por zona + acciones globales
import MesaCard from './MesaCard';
import { zonaMesa, type Mesa } from '../../lib/tipos';

interface Props {
  mesas: Mesa[];
  mesaIdSeleccionada: number | null;
  cargando: boolean;
  onSeleccionar: (mesa: Mesa) => void;
  onQuitar: (mesa: Mesa) => void;
  onNuevaMesa: () => void;
  onCrearDemo: () => void;
  onDiagnostico: () => void;
}

export default function MapaMesas(props: Props) {
  const { mesas, mesaIdSeleccionada, cargando, onSeleccionar, onQuitar, onNuevaMesa, onCrearDemo, onDiagnostico } = props;

  const zonas = new Map<string, Mesa[]>();
  for (const m of mesas ?? []) {
    const z = zonaMesa(m);
    if (!zonas.has(z)) zonas.set(z, []);
    zonas.get(z)!.push(m);
  }

  return (
    <section className="flex-1">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">POS · Comedor</h1>
          <p className="text-sm text-zinc-500">Selecciona una mesa para abrir su comanda</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onDiagnostico} className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500">Diagnóstico</button>
          <button onClick={onCrearDemo} className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500">Crear mesas demo</button>
          <button onClick={onNuevaMesa} className="rounded-xl bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400">+ Nueva mesa</button>
        </div>
      </header>

      {cargando && <p className="text-sm text-zinc-500">Cargando mesas…</p>}

      {!cargando && mesas.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-sm text-zinc-500">
          No hay mesas creadas. Usa «Crear mesas demo» o «+ Nueva mesa».
        </div>
      )}

      {[...zonas.entries()].map(([zona, lista]) => (
        <div key={zona} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">{zona}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {lista.map(m => (
              <MesaCard
                key={m.id}
                mesa={m}
                seleccionada={m.id === mesaIdSeleccionada}
                onSeleccionar={onSeleccionar}
                onQuitar={onQuitar}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}