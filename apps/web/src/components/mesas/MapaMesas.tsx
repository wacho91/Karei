// Kārei · mapa de mesas agrupado por zonas
import type { Mesa } from '../../lib/tipos';
import MesaCard from './MesaCard';

interface Props {
  mesas: Mesa[];
  ocupadas: number[];
  mesaId: number | null;
  cargando: boolean;
  onSeleccionar: (id: number) => void;
  onEliminar: (id: number) => void;
  onDiagnostico: () => void;
  onDemo: () => void;
  onNueva: () => void;
}

const BOTON = 'rounded-lg border px-3 py-1.5 text-xs font-medium transition';

export default function MapaMesas(p: Props) {
  const zonas = [...new Set(p.mesas.map((m) => m.zona || 'Salón'))];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <button onClick={p.onDiagnostico} className={`${BOTON} border-zinc-700 bg-zinc-900 hover:border-zinc-500`}>Diagnóstico</button>
        <button onClick={p.onDemo} className={`${BOTON} border-zinc-700 bg-zinc-900 hover:border-zinc-500`}>Crear mesas demo</button>
        <button onClick={p.onNueva} className={`${BOTON} border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20`}>+ Nueva mesa</button>
        {p.cargando && <span className="text-xs text-zinc-500">Cargando mesas…</span>}
      </div>

      {!p.mesas.length && !p.cargando && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
          <p className="text-3xl mb-2">🍽️</p>
          <p className="font-medium">No hay mesas todavía</p>
          <p className="text-sm mt-1">Usa «Crear mesas demo» o «+ Nueva mesa» para empezar.</p>
        </div>
      )}

      {zonas.map((zona) => (
        <section key={zona} className="mb-6">
          <h3 className="text-xs font-semibold tracking-widest text-zinc-500 mb-3">{zona.toUpperCase()}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {p.mesas.filter((m) => (m.zona || 'Salón') === zona).map((m) => (
              <MesaCard key={m.id} mesa={m} ocupada={p.ocupadas.includes(m.id)}
                seleccionada={p.mesaId === m.id}
                onClick={() => p.onSeleccionar(m.id)} onEliminar={() => p.onEliminar(m.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}