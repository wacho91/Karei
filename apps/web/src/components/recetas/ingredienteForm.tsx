import { useEffect, useState } from 'react';
import {
  UNIDADES_COMPRA, contenidoSugerido, unidadUsoDe,
  type UnidadCompra,
} from '../../constants/unidades';
import type { Ingrediente, IngredienteInput } from '@/types/inventario';

const nuevoForm = (compra: UnidadCompra = 'KG'): IngredienteInput => ({
  name: '',
  purchase_unit: compra,
  purchase_price: 0,
  content_qty: contenidoSugerido(compra) ?? 1,
  usage_unit: unidadUsoDe(compra),
  stock: 0,
  min_stock: 0,
});

interface Props {
  onCreate: (datos: IngredienteInput) => Promise<boolean>;
  onUpdate: (id: string, datos: IngredienteInput) => Promise<boolean>;
  editando: Ingrediente | null;
  onCancelarEdicion: () => void;
}

export const IngredienteForm = ({ onCreate, onUpdate, editando, onCancelarEdicion }: Props) => {
  const [form, setForm] = useState<IngredienteInput>(nuevoForm());
  const [guardando, setGuardando] = useState(false);

  // Al seleccionar "editar", el formulario se llena con los datos del ingrediente.
  useEffect(() => {
    if (editando) {
      setForm({
        name: editando.name,
        purchase_unit: editando.purchase_unit,
        purchase_price: editando.purchase_price,
        content_qty: editando.content_qty,
        usage_unit: editando.usage_unit,
        stock: editando.stock,
        min_stock: editando.min_stock,
      });
    }
  }, [editando]);

  const cambiarCompra = (compra: UnidadCompra) => {
    setForm((prev) => ({
      ...prev,
      purchase_unit: compra,
      usage_unit: unidadUsoDe(compra), // conversión automática, sin decisión humana
      content_qty: contenidoSugerido(compra) ?? prev.content_qty,
    }));
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando || !form.name || form.purchase_price <= 0) return;
    setGuardando(true);
    const ok = editando
      ? await onUpdate(editando.id, form)
      : await onCreate(form);
    if (ok) {
      setForm(nuevoForm(form.purchase_unit));
      if (editando) onCancelarEdicion();
    }
    setGuardando(false);
  };

  const esPaquete = form.purchase_unit === 'PAQUETE';

  return (
    <form onSubmit={enviar} className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl mb-6">
      <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">
        {editando ? '✏️ Editando Ingrediente' : 'Nuevo Ingrediente'}
      </h3>

      <input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Ej: Carne molida"
        className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-3 outline-none focus:ring-2 focus:ring-amber-500"
      />

      <div className="grid grid-cols-2 gap-3 mb-3">
        <select
          value={form.purchase_unit}
          onChange={(e) => cambiarCompra(e.target.value as UnidadCompra)}
          className="bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none"
        >
          {UNIDADES_COMPRA.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>
        <input
          type="number" min={1}
          value={form.purchase_price || ''}
          onChange={(e) => setForm({ ...form, purchase_price: Number(e.target.value) })}
          placeholder="Precio de compra ($)"
          className="bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs text-slate-400">
            {esPaquete ? '¿Cuántas unidades trae?' : 'Contenido (auto)'}
          </label>
          <input
            type="number" min={0.01} step="any"
            value={form.content_qty || ''}
            onChange={(e) => setForm({ ...form, content_qty: Number(e.target.value) })}
            className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Se usa en (automático)</label>
          <div className="w-full bg-slate-900/50 border border-slate-700/50 text-slate-400 p-3 rounded-lg text-sm">
            {form.usage_unit === 'G' ? 'Gramos (G)' : form.usage_unit === 'ML' ? 'Mililitros (ML)' : 'Unidades (UND)'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <input
          type="number" min={0} step="any"
          value={form.stock || ''}
          onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
          placeholder={`Stock actual (${form.usage_unit})`}
          className="bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
        />
        <input
          type="number" min={0} step="any"
          value={form.min_stock || ''}
          onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })}
          placeholder="Stock mínimo"
          className="bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={guardando}
          className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 font-bold py-2 rounded-lg transition-colors"
        >
          {guardando ? 'Guardando...' : editando ? '💾 Guardar cambios' : '+ Agregar'}
        </button>
        {editando && (
          <button
            type="button"
            onClick={onCancelarEdicion}
            className="px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
};