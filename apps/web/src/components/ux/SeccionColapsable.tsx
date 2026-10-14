import { useState, type ReactNode } from 'react';

interface Props {
  titulo: string;
  children: ReactNode;
  abiertaPorDefecto?: boolean;
}

/** Sección con título clicable: expande/colapsa su contenido con animación. */
export const SeccionColapsable = ({ titulo, children, abiertaPorDefecto = true }: Props) => {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);

  return (
    <div className="bg-slate-800/30 border border-slate-700 p-4 rounded-2xl">
      <button
        onClick={() => setAbierta((a) => !a)}
        className="w-full flex justify-between items-center text-slate-400 text-sm font-bold uppercase tracking-widest hover:text-slate-200 transition-colors"
      >
        <span>{titulo}</span>
        <span className={`transition-transform duration-300 ${abierta ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {/* Truco grid-rows: anima la altura sin JavaScript y no desmonta los hijos
          (la búsqueda y la página se conservan aunque la sección esté colapsada). */}
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          abierta ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
};