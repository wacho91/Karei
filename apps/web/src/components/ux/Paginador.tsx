interface Props {
  pagina: number;
  totalPaginas: number;
  totalRegistros: number;
  onAnterior: () => void;
  onSiguiente: () => void;
}

export const Paginador = ({
  pagina, totalPaginas, totalRegistros, onAnterior, onSiguiente,
}: Props) => (
  <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-700/50 text-xs text-slate-400">
    <span>{totalRegistros} registro(s)</span>
    {totalPaginas > 1 && (
      <div className="flex items-center gap-2">
        <button
          onClick={onAnterior}
          disabled={pagina === 1}
          className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ← Anterior
        </button>
        <span>Página {pagina} de {totalPaginas}</span>
        <button
          onClick={onSiguiente}
          disabled={pagina === totalPaginas}
          className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Siguiente →
        </button>
      </div>
    )}
  </div>
);