import { useState } from 'react';
import { useIngredientes } from '@/hooks/useIngredientes';
import { useRecetas } from '@/hooks/useRecetas';
import { IngredienteForm } from '@/components/recetas/ingredienteForm';
import { IngredienteList } from '@/components/recetas/IngredienteList';
import { RecetaCard } from '@/components/recetas/RecetaCard';

type ItemTemporal = {
  ingredient_id: string;
  name: string;
  quantity: number;
  unit: string;
  costo: number;
};

export default function RecetasPage() {
  const { ingredientes, error, crear: crearIngrediente, eliminar } = useIngredientes();
  const { recetas, error: errorRecetas, crear: crearReceta } = useRecetas();

  const [recipeName, setRecipeName] = useState('');
  const [selectedIng, setSelectedIng] = useState('');
  const [recipeQty, setRecipeQty] = useState('');
  const [recipePrice, setRecipePrice] = useState('');
  const [currentItems, setCurrentItems] = useState<ItemTemporal[]>([]);

  const seleccionado = ingredientes.find((i) => i.id === selectedIng);
  const costoActual = currentItems.reduce((sum, item) => sum + item.costo, 0);

  const addItemToRecipe = () => {
    if (!seleccionado || !recipeQty || Number(recipeQty) <= 0) return;
    setCurrentItems([
      ...currentItems,
      {
        ingredient_id: seleccionado.id,
        name: seleccionado.name,
        quantity: Number(recipeQty),
        unit: seleccionado.usage_unit,
        costo: Number(recipeQty) * seleccionado.cost_per_unit,
      },
    ]);
    setSelectedIng('');
    setRecipeQty('');
  };

  const saveRecipe = async () => {
    if (!recipeName || currentItems.length === 0 || Number(recipePrice) <= 0) return;
    const ok = await crearReceta({
      name: recipeName,
      description: null,
      price: Number(recipePrice),
      items: currentItems.map(({ ingredient_id, quantity }) => ({ ingredient_id, quantity })),
    });
    if (ok) {
      setRecipeName('');
      setCurrentItems([]);
      setRecipePrice('');
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">Recetas y Food Cost 📖</h1>
      <p className="text-slate-400 mb-8">Registra ingredientes, arma tus platos y calcula tu margen de utilidad.</p>

      {(error || errorRecetas) && (
        <div className="bg-rose-500/10 border border-rose-500 text-rose-400 p-3 rounded-lg mb-6 text-sm">
          {error || errorRecetas}
        </div>
      )}

      <div className="flex gap-8">
        {/* === COLUMNA IZQUIERDA: Ingredientes === */}
        <div className="w-1/3">
          <IngredienteForm onSubmit={crearIngrediente} />
          <IngredienteList ingredientes={ingredientes} onEliminar={eliminar} />
        </div>

        {/* === COLUMNA DERECHA: Recetas === */}
        <div className="w-2/3">
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl mb-6">
            <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Crear Receta</h3>

            <input
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              placeholder="Nombre del plato (Ej: Hamburguesa)"
              className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-4 outline-none focus:ring-2 focus:ring-amber-500"
            />

            <div className="flex gap-2 mb-4">
              <select
                value={selectedIng}
                onChange={(e) => setSelectedIng(e.target.value)}
                className="w-2/3 bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none"
              >
                <option value="">Seleccionar ingrediente...</option>
                {ingredientes.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name} (${ing.cost_per_unit}/{ing.usage_unit})
                  </option>
                ))}
              </select>
              <input
                type="number" min={0} step="any"
                value={recipeQty}
                onChange={(e) => setRecipeQty(e.target.value)}
                placeholder={seleccionado ? `Cant. (${seleccionado.usage_unit})` : 'Cant.'}
                className="w-1/3 bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={addItemToRecipe}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 rounded-lg transition-colors"
              >
                +
              </button>
            </div>

            <div className="mb-4 bg-slate-900/50 p-4 rounded-lg border border-slate-700 min-h-[80px]">
              {currentItems.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">Agrega items a la receta.</p>
              ) : (
                <ul className="space-y-2">
                  {currentItems.map((item, i) => (
                    <li key={i} className="flex justify-between text-slate-300 text-sm">
                      <span>{item.quantity} {item.unit} de {item.name}</span>
                      <span className="text-amber-400">${item.costo.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
              {currentItems.length > 0 && (
                <p className="text-right text-xs text-slate-400 mt-3 border-t border-slate-700 pt-2">
                  Costo total: <span className="text-white font-bold">${costoActual.toLocaleString()}</span>
                </p>
              )}
            </div>

            <input
              type="number" min={0}
              value={recipePrice}
              onChange={(e) => setRecipePrice(e.target.value)}
              placeholder="Precio de Venta ($)"
              className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-4 outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={saveRecipe}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg transition-colors"
            >
              💾 Guardar Receta
            </button>
          </div>

          <div className="bg-slate-800/30 border border-slate-700 p-6 rounded-2xl">
            <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Menú del Restaurante</h3>
            {recetas.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">Aún no has creado recetas.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recetas.map((receta) => (
                  <RecetaCard key={receta.id} receta={receta} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}