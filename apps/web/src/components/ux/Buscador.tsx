interface Props {
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
}

export const Buscador = ({ valor, onChange, placeholder = 'Buscar...' }: Props) => (
  <div className="relative mb-3">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
    <input
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-900 border border-slate-700 text-white p-2.5 pl-9 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500"
    />
  </div>
);