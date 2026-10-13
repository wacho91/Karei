import { useState } from "react";
import { UNIDADES_COMPRA, UNIDADES_USO, sugerirContenido } from "../../constants/unidades";
import type { IngredienteInput } from "../../types/inventario";

const inicial = (): IngredienteInput => ({
  name: "",
  purchase_unit: "KG",
  purchase_price: 0,
  content_qty: sugerirContenido("KG", "G"),
  usage_unit: "G",
  stock: 0,
  min_stock: 0,
});

interface Props {
  onSubmit: (datos: IngredienteInput) => Promise<boolean>;
}

export const IngredienteForm = ({ onSubmit }: Props) => {
  const [form, setForm] = useState<IngredienteInput>(inicial());
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo: keyof IngredienteInput, valor: string | number) => {
    const nuevo = { ...form, [campo]: valor };
    if (campo === "purchase_unit" || campo === "usage_unit") {
      nuevo.content_qty = sugerirContenido(nuevo.purchase_unit, nuevo.usage_unit);
    }
    setForm(nuevo);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando || !form.name || form.purchase_price <= 0) return;
    setGuardando(true);
    const ok = await onSubmit(form);
    if (ok) setForm(inicial());
    setGuardando(false);
  };

  return (
    <form onSubmit={enviar} className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl mb-6">
      <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Nuevo Ingrediente</h3>

      <input
        value={form.name}
        onChange={(e) => cambiar("name", e.target.value)}
        placeholder="Ej: Carne molida"
        className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-3 outline-none focus:ring-2 focus:ring-amber-500"
      />

      <div className="grid grid-cols-2 gap-3 mb-3">
        <select
          value={form.purchase_unit}
          onChange={(e) => cambiar("purchase_unit", e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none"
        >
          {UNIDADES_COMPRA.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>
        <input
          type="number" min={1}
          value={form.purchase_price || ""}
          onChange={(e) => cambiar("purchase_price", Number(e.target.value))}
          placeholder="Precio de compra ($)"
          className="bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs text-slate-400">Contenido que trae</label>
          <input
            type="number" min={0.01} step="any"
            value={form.content_qty || ""}
            onChange={(e) => cambiar("content_qty", Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Se usa en</label>
          <select
            value={form.usage_unit}
            onChange={(e) => cambiar("usage_unit", e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none"
          >
            {UNIDADES_USO.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <input
          type="number" min={0} step="any"
          value={form.stock || ""}
          onChange={(e) => cambiar("stock", Number(e.target.value))}
          placeholder={`Stock actual (${form.usage_unit})`}
          className="bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
        />
        <input
          type="number" min={0} step="any"
          value={form.min_stock || ""}
          onChange={(e) => cambiar("min_stock", Number(e.target.value))}
          placeholder="Stock mínimo"
          className="bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={guardando}
        className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 font-bold py-2 rounded-lg transition-colors"
      >
        {guardando ? "Guardando..." : "+ Agregar"}
      </button>
    </form>
  );
};