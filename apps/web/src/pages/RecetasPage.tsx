import { useState } from 'react';

// Tipos
type Ingredient = { id: number; name: string; price: number };
type RecipeItem = { ingredientId: number; name: string; quantity: number; price: number };
type Recipe = { id: number; name: string; items: RecipeItem[]; cost: number; price: number };

export default function RecetasPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  
  // Formulario de ingredientes
  const [ingName, setIngName] = useState('');
  const [ingPrice, setIngPrice] = useState('');
  
  // Formulario de recetas
  const [recipeName, setRecipeName] = useState('');
  const [selectedIng, setSelectedIng] = useState('');
  const [recipeQty, setRecipeQty] = useState('');
  const [currentItems, setCurrentItems] = useState<RecipeItem[]>([]);
  const [recipePrice, setRecipePrice] = useState('');

  // Lógica Ingredientes
  const addIngredient = () => {
    if (!ingName || !ingPrice) return;
    setIngredients([...ingredients, { id: Date.now(), name: ingName, price: parseFloat(ingPrice) }]);
    setIngName('');
    setIngPrice('');
  };

  // Lógica Recetas
  const addItemToRecipe = () => {
    const ing = ingredients.find(i => i.id === Number(selectedIng));
    if (!ing || !recipeQty) return;
    setCurrentItems([...currentItems, { ingredientId: ing.id, name: ing.name, quantity: parseFloat(recipeQty), price: ing.price }]);
    setSelectedIng('');
    setRecipeQty('');
  };

  const saveRecipe = () => {
    if (!recipeName || currentItems.length === 0 || !recipePrice) return;
    const cost = currentItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    setRecipes([...recipes, { id: Date.now(), name: recipeName, items: currentItems, cost, price: parseFloat(recipePrice) }]);
    setRecipeName('');
    setCurrentItems([]);
    setRecipePrice('');
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">Recetas y Food Cost 📖</h1>
      <p className="text-slate-400 mb-8">Registra ingredientes, arma tus platos y calcula tu margen de utilidad.</p>

      <div className="flex gap-8">
        {/* === COLUMNA IZQUIERDA: Ingredientes === */}
        <div className="w-1/3">
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl mb-6">
            <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Nuevo Ingrediente</h3>
            <input value={ingName} onChange={(e) => setIngName(e.target.value)} placeholder="Ej: Carne molida (1kg)" className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-3 outline-none focus:ring-2 focus:ring-amber-500" />
            <input value={ingPrice} onChange={(e) => setIngPrice(e.target.value)} type="number" placeholder="Precio ($)" className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-4 outline-none focus:ring-2 focus:ring-amber-500" />
            <button onClick={addIngredient} className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-2 rounded-lg transition-colors">+ Agregar</button>
          </div>

          <div className="bg-slate-800/30 border border-slate-700 p-4 rounded-2xl">
            <h3 className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-4">Inventario</h3>
            {ingredients.length === 0 ? <p className="text-slate-500 text-sm py-4 text-center">Sin ingredientes.</p> : (
              <ul className="space-y-2">
                {ingredients.map(ing => (
                  <li key={ing.id} className="flex justify-between text-slate-300 text-sm p-2 bg-slate-900/50 rounded-lg">
                    <span>{ing.name}</span>
                    <span className="text-amber-400 font-medium">$ {ing.price.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* === COLUMNA DERECHA: Creador de Recetas y Lista === */}
        <div className="w-2/3">
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl mb-6">
            <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Crear Receta</h3>
            <input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="Nombre del plato (Ej: Hamburguesa)" className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-4 outline-none focus:ring-2 focus:ring-amber-500" />
            
            <div className="flex gap-2 mb-4">
              <select value={selectedIng} onChange={(e) => setSelectedIng(e.target.value)} className="w-2/3 bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none">
                <option value="">Seleccionar ingrediente...</option>
                {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name}</option>
                )}
              </select>
              <input value={recipeQty} onChange={(e) => setRecipeQty(e.target.value)} type="number" placeholder="Cant." className="w-1/3 bg-slate-900 border border-slate-700 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-amber-500" />
              <button onClick={addItemToRecipe} className="bg-slate-700 hover:bg-slate-600 text-white px-4 rounded-lg transition-colors">+</button>
            </div>

            <div className="mb-4 bg-slate-900/50 p-4 rounded-lg border border-slate-700 min-h-[80px]">
              {currentItems.length === 0 ? <p className="text-slate-500 text-sm text-center py-4">Agrega items a la receta.</p> : (
                <ul className="space-y-2">
                  {currentItems.map((item, index) => (
                    <li key={index} className="flex justify-between text-slate-300 text-sm">
                      <span>{item.quantity} x {item.name}</span>
                      <span className="text-amber-400">$ {(item.quantity * item.price).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <input value={recipePrice} onChange={(e) => setRecipePrice(e.target.value)} type="number" placeholder="Precio de Venta ($)" className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-4 outline-none focus:ring-2 focus:ring-amber-500" />
            <button onClick={saveRecipe} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg transition-colors">💾 Guardar Receta</button>
          </div>

          {/* Lista de Recetas Guardadas */}
          <div className="bg-slate-800/30 border border-slate-700 p-6 rounded-2xl">
            <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Menú del Restaurante</h3>
            {recipes.length === 0 ? <p className="text-slate-500 text-sm text-center py-4">Aún no has creado recetas.</p> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recipes.map(recipe => {
                  const margin = recipe.price > 0 ? ((recipe.price - recipe.cost) / recipe.price) * 100 : 0;
                  const marginColor = margin > 65 ? 'text-emerald-400' : margin > 40 ? 'text-amber-400' : 'text-rose-400';
                  return (
                    <div key={recipe.id} className="bg-slate-900/50 border border-slate-700 p-4 rounded-xl">
                      <h4 className="text-lg font-bold text-white mb-2">{recipe.name}</h4>
                      <div className="space-y-1 text-xs text-slate-400">
                        <p>Costo: <span className="text-white font-medium">$ {recipe.cost.toLocaleString()}</span></p>
                        <p>Venta: <span className="text-white font-medium">$ {recipe.price.toLocaleString()}</span></p>
                        <p>Margen: <span className={`font-bold ${marginColor}`}>{margin.toFixed(1)}%</span></p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}