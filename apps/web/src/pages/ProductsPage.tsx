import { useEffect, useMemo, useState } from 'react';
import * as hooksPos from '../hooks/usePos';

// Hooks que ya existen en el proyecto
const useMenuRecetas = (hooksPos as any).useMenuRecetas;
const useMesas = (hooksPos as any).useMesas;
const useEnviarNuevaComanda = (hooksPos as any).useEnviarNuevaComanda;

type ItemCarrito = {
  recipe_id: string;
  nombre: string;
  precio: number;
  quantity: number;
  notes: string;
};

type Aviso = { tipo: 'ok' | 'error'; texto: string };

// Extrae la lista sin importar si el hook devuelve el array o el resultado de react-query
const extraerLista = (x: any): any[] => {
  if (Array.isArray(x)) return x;
  if (Array.isArray(x?.data)) return x.data;
  if (Array.isArray(x?.data?.data)) return x.data.data;
  return [];
};

const textoMesa = (m: any): string =>
  m?.name ?? m?.label ?? (m?.number != null ? `Mesa ${m.number}` : null) ?? m?.code ?? 'Mesa';

const categoriaDe = (r: any): string => {
  const c = r?.category ?? r?.categoria ?? r?.category_name;
  if (typeof c === 'string' && c.trim()) return c;
  if (c?.name) return String(c.name);
  return 'Otros';
};

const formatearPrecio = (v: number): string =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

export default function ProductsPage() {
  const [busqueda, setBusqueda] = useState('');
  const [categoriaSel, setCategoriaSel] = useState('Todas');
  const [mesaSel, setMesaSel] = useState('');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const respuestaRecetas: any = useMenuRecetas ? useMenuRecetas() : null;
  const respuestaMesas: any = useMesas ? useMesas() : null;
  const mutacionEnvio: any = useEnviarNuevaComanda ? useEnviarNuevaComanda() : null;

  const recetas = useMemo(
    () =>
      extraerLista(respuestaRecetas).map((r: any, i: number) => ({
        id: String(r?.id ?? r?.recipe_id ?? i),
        nombre: String(r?.name ?? r?.nombre ?? r?.title ?? 'Ítem'),
        precio: Number(r?.price ?? r?.precio ?? r?.sale_price ?? 0),
        categoria: categoriaDe(r),
      })),
    [respuestaRecetas],
  );

  const mesas = useMemo(
    () =>
      extraerLista(respuestaMesas)
        .map((m: any) => ({
          id: String(m?.id ?? m?.table_id ?? ''),
          texto: textoMesa(m),
          zona:
            typeof (m?.zone ?? m?.area) === 'string'
              ? m?.zone ?? m?.area
              : m?.zone?.name ?? m?.area?.name ?? '',
          estado: String(m?.status ?? m?.estado ?? '').toLowerCase(),
        }))
        .filter((m: any) => m.id !== ''),
    [respuestaMesas],
  );

  const mesasLibres = mesas.filter(
    (m: any) =>
      !m.estado || ['libre', 'disponible', 'available', 'free', 'open', 'activa'].includes(m.estado),
  );
  const opcionesMesa = mesasLibres.length > 0 ? mesasLibres : mesas;

  const categorias = useMemo(() => {
    const set = new Set<string>();
    recetas.forEach((r: any) => set.add(r.categoria));
    return ['Todas', ...Array.from(set)];
  }, [recetas]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3200);
    return () => clearTimeout(t);
  }, [aviso]);

  const agregar = (receta: { id: string; nombre: string; precio: number }) => {
    setCarrito((prev) => {
      const existe = prev.find((it) => it.recipe_id === receta.id);
      if (existe) {
        return prev.map((it) => (it.recipe_id === receta.id ? { ...it, quantity: it.quantity + 1 } : it));
      }
      return [...prev, { recipe_id: receta.id, nombre: receta.nombre, precio: receta.precio, quantity: 1, notes: '' }];
    });
  };

  const cambiarCantidad = (recipeId: string, delta: number) => {
    setCarrito((prev) =>
      prev
        .map((it) => (it.recipe_id === recipeId ? { ...it, quantity: it.quantity + delta } : it))
        .filter((it) => it.quantity > 0),
    );
  };

  const quitar = (recipeId: string) => setCarrito((prev) => prev.filter((it) => it.recipe_id !== recipeId));

  const cambiarNotas = (recipeId: string, notas: string) =>
    setCarrito((prev) => prev.map((it) => (it.recipe_id === recipeId ? { ...it, notes: notas } : it)));

  const total = carrito.reduce((acc, it) => acc + it.precio * it.quantity, 0);

  const enviar = async () => {
    if (!mesaSel || carrito.length === 0 || enviando) return;
    const mesa = opcionesMesa.find((m: any) => m.id === mesaSel);
    const payload = {
      table_id: mesaSel,
      items: carrito.map((it) => ({
        recipe_id: it.recipe_id,
        quantity: it.quantity,
        notes: it.notes.trim() ? it.notes.trim() : undefined,
      })),
    };
    setEnviando(true);
    try {
      const enviarFn = mutacionEnvio?.mutateAsync ?? mutacionEnvio?.mutate;
      if (!enviarFn) throw new Error('No se encontró la función de envío del pedido.');
      await enviarFn(payload);
      setAviso({ tipo: 'ok', texto: `Comanda enviada a ${mesa?.texto ?? 'la mesa'}. Cocina ya la está viendo.` });
      setCarrito([]);
      setMesaSel('');
    } catch (e: any) {
      const detalle = e?.response?.data?.detail;
      const texto =
        typeof detalle === 'string'
          ? detalle
          : 'No se pudo enviar la comanda. Revisa que la mesa esté libre e intenta de nuevo.';
      setAviso({ tipo: 'error', texto });
    } finally {
      setEnviando(false);
    }
  };

  const recetasFiltradas = recetas.filter(
    (r: any) =>
      (categoriaSel === 'Todas' || r.categoria === categoriaSel) &&
      (busqueda.trim() === '' || r.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())),
  );

  const qtyEnCarrito = (recipeId: string) => carrito.find((it) => it.recipe_id === recipeId)?.quantity ?? 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Nuevo pedido</h1>
            <p className="text-sm text-slate-400">
              Arma la comanda, sube cantidades sin límite y deja las especificaciones para cocina.
            </p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mesa</span>
            <select
              value={mesaSel}
              onChange={(e) => setMesaSel(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-400"
            >
              <option value="">Selecciona una mesa…</option>
              {opcionesMesa.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.texto}
                  {m.zona ? ` · ${m.zona}` : ''}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_380px]">
          <section>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar en el menú…"
                className="w-full max-w-xs rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-400"
              />
              {categorias.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoriaSel(c)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    categoriaSel === c
                      ? 'bg-amber-400 text-slate-950'
                      : 'border border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400/50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {recetasFiltradas.length === 0 ? (
              <p className="mt-6 rounded-2xl border border-dashed border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
                No hay ítems con esa búsqueda. Revisa el menú o crea recetas primero.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {recetasFiltradas.map((r: any) => {
                  const qty = qtyEnCarrito(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => agregar(r)}
                      className="group relative flex flex-col items-start gap-1 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-amber-400/60 hover:bg-slate-800/80"
                    >
                      {qty > 0 && (
                        <span className="absolute right-3 top-3 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-950">
                          {qty}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-slate-100">{r.nombre}</span>
                      <span className="text-sm font-bold text-amber-400">{formatearPrecio(r.precio)}</span>
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300 transition group-hover:bg-amber-400 group-hover:text-slate-950">
                        Agregar +
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 lg:sticky lg:top-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">Comanda</h2>
              {carrito.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCarrito([])}
                  className="text-xs font-medium text-slate-500 hover:text-rose-400"
                >
                  Vaciar
                </button>
              )}
            </div>

            {carrito.length === 0 ? (
              <p className="mt-6 rounded-xl border border-dashed border-slate-800 px-3 py-8 text-center text-xs text-slate-600">
                Toca un ítem del menú para agregarlo. Suma cantidades con el botón + o desde el carrito.
              </p>
            ) : (
              <ul className="mt-3 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                {carrito.map((it) => (
                  <li key={it.recipe_id} className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-100">{it.nombre}</span>
                      <button
                        type="button"
                        onClick={() => quitar(it.recipe_id)}
                        className="text-xs font-medium text-slate-500 hover:text-rose-400"
                      >
                        Quitar
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(it.recipe_id, -1)}
                          className="h-7 w-7 rounded-lg border border-slate-700 text-slate-200 hover:border-rose-400 hover:text-rose-400"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-bold text-slate-100">{it.quantity}</span>
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(it.recipe_id, 1)}
                          className="h-7 w-7 rounded-lg border border-slate-700 text-slate-200 hover:border-amber-400 hover:text-amber-400"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-sm font-bold text-slate-300">{formatearPrecio(it.precio * it.quantity)}</span>
                    </div>
                    <textarea
                      value={it.notes}
                      onChange={(e) => cambiarNotas(it.recipe_id, e.target.value)}
                      rows={2}
                      maxLength={255}
                      placeholder="Especificaciones para cocina: sin cebolla, sin aderezos, término…"
                      className="mt-2 w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-amber-400"
                    />
                    {it.notes.trim() && (
                      <span className="mt-1 inline-block rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                        Irá en la comanda
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 border-t border-slate-800 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Total preliminar</span>
                <span className="text-lg font-bold text-amber-400">{formatearPrecio(total)}</span>
              </div>
              <button
                type="button"
                onClick={enviar}
                disabled={!mesaSel || carrito.length === 0 || enviando}
                className="mt-3 w-full rounded-xl bg-amber-400 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {enviando ? 'Enviando…' : 'Enviar a cocina'}
              </button>
              {!mesaSel && carrito.length > 0 && (
                <p className="mt-2 text-center text-xs text-slate-500">Elige la mesa para poder enviar la comanda.</p>
              )}
            </div>
          </aside>
        </div>
      </div>

      {aviso && (
        <div
          className={`fixed bottom-5 right-5 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-xl ${
            aviso.tipo === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
          }`}
        >
          {aviso.texto}
        </div>
      )}
    </div>
  );
}