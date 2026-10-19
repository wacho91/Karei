import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as hooksPos from '../hooks/usePos';
import * as apiModule from '../lib/api';
import * as authStore from '../store/authStore';

const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;
const useMesas = (hooksPos as any).useMesas;
const useMenuRecetas = (hooksPos as any).useMenuRecetas;
const useEnviarNuevaComanda = (hooksPos as any).useEnviarNuevaComanda;
const useAuthStore = (authStore as any).useAuthStore;

type ItemBorrador = { recipe_id: string; nombre: string; precio: number; quantity: number; notes: string };
type MesaNorm = { id: string; texto: string; zona: string; capacidad: number; total: number; ocupada: boolean };
type CuentaNorm = { orderId: string; items: any[]; total: number; status: string };
type GrupoPedido = {
  key: string;
  recipeId: string | null;
  nombre: string;
  precio: number;
  enviados: number;
  idsEnviados: string[];
  notasEnviadas: string[];
  borrador: ItemBorrador | null;
};
type Aviso = { tipo: 'ok' | 'error'; texto: string };

const extraerLista = (x: any): any[] => {
  if (Array.isArray(x)) return x;
  if (Array.isArray(x?.data)) return x.data;
  if (Array.isArray(x?.data?.data)) return x.data.data;
  return [];
};

const textoError = (e: any): string => {
  const d = e?.response?.data?.detail ?? e?.response?.data ?? e?.message;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x?.msg ?? String(x)).join(' · ');
  if (d && typeof d === 'object') {
    const s = JSON.stringify(d);
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  }
  return 'Ocurrió un error inesperado.';
};

const formatearPrecio = (v: number): string =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

const textoMesa = (m: any): string =>
  m?.name ?? m?.label ?? (m?.number != null ? `Mesa ${m.number}` : null) ?? m?.code ?? 'Mesa';

const zonaMesa = (m: any): string => {
  const z = m?.zone ?? m?.area ?? m?.zona;
  if (typeof z === 'string' && z.trim()) return z;
  return z?.name ?? z?.nombre ?? 'Sin zona';
};

const capacidadMesa = (m: any): number =>
  Number(m?.capacity ?? m?.seats ?? m?.personas ?? m?.capacity_people ?? 0);

const totalMesa = (m: any): number =>
  Number(m?.total ?? m?.total_amount ?? m?.current_total ?? m?.amount ?? 0);

const estaOcupada = (m: any): boolean => {
  const s = String(m?.status ?? m?.estado ?? '').toLowerCase();
  if (s) {
    return !(
      s.includes('libre') ||
      s.includes('free') ||
      s.includes('available') ||
      s.includes('disponible')
    );
  }
  return totalMesa(m) > 0;
};

const nombreItem = (it: any): string =>
  String(it?.recipe_name ?? it?.nombre ?? it?.name ?? it?.recipe?.name ?? it?.recipe?.nombre ?? 'Ítem');

const precioItem = (it: any): number =>
  Number(it?.unit_price ?? it?.price ?? it?.precio ?? it?.price_at_order ?? 0);

const cantidadItem = (it: any): number => Number(it?.quantity ?? it?.qty ?? 1);

const notaItem = (it: any): string => {
  const n = it?.notes ?? it?.nota ?? it?.note;
  return typeof n === 'string' ? n.trim() : '';
};

const recipeIdDe = (it: any): string | null => {
  const v = it?.recipe_id ?? it?.recipe?.id ?? it?.recipe?.uuid ?? null;
  return v != null && String(v).length > 0 ? String(v) : null;
};

const idFilaDe = (it: any): string | null => {
  const v = it?.id ?? it?.item_id ?? it?.uuid ?? null;
  return v != null && String(v).length > 0 ? String(v) : null;
};

// ---------- Cuenta abierta de la mesa ----------
let rutaCuentaOk: ((id: string) => string) | null = null;
const mesasSinCuenta = new Set<string>();

const RUTAS_CUENTA: ((id: string) => string)[] = [
  (id) => `/pos/tables/${id}/account`,
  (id) => `/pos/tables/${id}/order`,
  (id) => `/pos/tables/${id}/current-order`,
  (id) => `/pos/orders?table_id=${id}`,
];

const normalizarCuenta = (data: any, mesaId: string): CuentaNorm | null => {
  let orden = data?.order ?? data?.account ?? data?.data ?? data;
  if (Array.isArray(orden)) {
    const abiertas = orden.filter((o: any) => {
      const s = String(o?.status ?? o?.estado ?? '').toLowerCase();
      return !s || s.includes('abiert') || s.includes('open') || s.includes('activ') || s.includes('pend');
    });
    orden = abiertas[0] ?? orden[0];
  }
  if (!orden || typeof orden !== 'object') return null;
  const tid = orden.table_id ?? orden.table?.id ?? null;
  if (tid && String(tid) !== String(mesaId)) return null;
  const items: any[] = Array.isArray(orden.items)
    ? orden.items
    : Array.isArray(orden.order_items)
      ? orden.order_items
      : [];
  const orderId = String(orden.id ?? orden.order_id ?? orden.uuid ?? '');
  const total = Number(orden.total ?? orden.total_amount ?? 0);
  if (!orderId && items.length === 0) return null;
  return { orderId, items, total, status: String(orden.status ?? orden.estado ?? '') };
};

const fetchCuenta = async (mesaId: string): Promise<CuentaNorm | null> => {
  if (mesasSinCuenta.has(mesaId)) return null;
  const rutas = rutaCuentaOk
    ? [rutaCuentaOk, ...RUTAS_CUENTA.filter((r) => r !== rutaCuentaOk)]
    : RUTAS_CUENTA;
  for (const ruta of rutas) {
    try {
      const res = await api.get(ruta(mesaId));
      const norm = normalizarCuenta(res?.data, mesaId);
      if (norm) {
        rutaCuentaOk = ruta;
        return norm;
      }
    } catch {
      // probamos la siguiente ruta
    }
  }
  mesasSinCuenta.add(mesaId);
  return null;
};

function EditorNota({ d, onNotas }: { d: ItemBorrador; onNotas: (id: string, n: string) => void }) {
  return (
    <>
      <textarea
        value={d.notes}
        onChange={(e) => onNotas(d.recipe_id, e.target.value)}
        rows={2}
        maxLength={255}
        placeholder="Nota para este ítem: sin cebolla, sin aderezos, agregar tocineta…"
        className="mt-2 w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-amber-400"
      />
      {d.notes.trim() && (
        <span className="mt-1 inline-block rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
          Irá en la comanda
        </span>
      )}
    </>
  );
}

export default function TablesPage() {
  const queryClient = useQueryClient();

  const [mesaSel, setMesaSel] = useState('');
  const [draft, setDraft] = useState<ItemBorrador[]>([]);
  const [pctTip, setPctTip] = useState(10);
  const [metodo, setMetodo] = useState('efectivo');
  const [enviando, setEnviando] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [modalMesa, setModalMesa] = useState(false);
  const [nombreNueva, setNombreNueva] = useState('');
  const [zonaNueva, setZonaNueva] = useState('Salón');
  const [capacidadNueva, setCapacidadNueva] = useState(4);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const respuestaMesas: any = useMesas ? useMesas() : null;
  const respuestaMenu: any = useMenuRecetas ? useMenuRecetas() : null;
  const mutacionEnvio: any = useEnviarNuevaComanda ? useEnviarNuevaComanda() : null;

  const cuenta = useQuery({
    queryKey: ['cuenta-mesa', mesaSel],
    queryFn: () => fetchCuenta(mesaSel),
    enabled: !!mesaSel,
    retry: false,
  });

  const ordenAbierta: CuentaNorm | null = cuenta?.data ?? null;

  const esAdmin = useMemo(() => {
    try {
      const s: any = useAuthStore?.getState?.();
      const roles: string[] = s?.usuario?.roles ?? [];
      if (roles.length === 0) return true;
      return roles.some((r) => String(r).toLowerCase() === 'admin');
    } catch {
      return true;
    }
  }, []);

  const mesas: MesaNorm[] = useMemo(
    () =>
      extraerLista(respuestaMesas)
        .map((m: any) => ({
          id: String(m?.id ?? m?.table_id ?? ''),
          texto: textoMesa(m),
          zona: zonaMesa(m),
          capacidad: capacidadMesa(m),
          total: totalMesa(m),
          ocupada: estaOcupada(m),
        }))
        .filter((m: MesaNorm) => m.id !== ''),
    [respuestaMesas],
  );

  const menu = useMemo(
    () =>
      extraerLista(respuestaMenu).map((r: any, i: number) => ({
        id: String(r?.id ?? r?.recipe_id ?? i),
        nombre: String(r?.name ?? r?.nombre ?? r?.title ?? 'Ítem'),
        precio: Number(r?.price ?? r?.precio ?? r?.sale_price ?? 0),
      })),
    [respuestaMenu],
  );

  const porZona = useMemo(() => {
    const g: Record<string, MesaNorm[]> = {};
    mesas.forEach((m) => {
      if (!g[m.zona]) g[m.zona] = [];
      g[m.zona].push(m);
    });
    return Object.entries(g);
  }, [mesas]);

  const buscarIdMenu = (nombre: string): string | null => {
    const n = nombre.trim().toLowerCase();
    const hit = menu.find((r) => r.nombre.toLowerCase() === n);
    return hit ? hit.id : null;
  };

  // Pedido de la mesa: combina lo ya enviado + lo pendiente del borrador,
  // agrupado por receta para que se vea 3x Hamburguesa y no tres líneas sueltas
  const grupos: GrupoPedido[] = useMemo(() => {
    const mapa = new Map<string, GrupoPedido>();
    (ordenAbierta?.items ?? []).forEach((it: any) => {
      const rid = recipeIdDe(it);
      const nombre = nombreItem(it);
      const key = rid ?? `n:${nombre.toLowerCase()}`;
      const existente = mapa.get(key);
      const g: GrupoPedido =
        existente ??
        {
          key,
          recipeId: rid,
          nombre,
          precio: precioItem(it),
          enviados: 0,
          idsEnviados: [],
          notasEnviadas: [],
          borrador: null,
        };
      g.enviados += cantidadItem(it);
      const fila = idFilaDe(it);
      if (fila) g.idsEnviados.push(fila);
      const n = notaItem(it);
      if (n && !g.notasEnviadas.includes(n)) g.notasEnviadas.push(n);
      mapa.set(key, g);
    });
    draft.forEach((d) => {
      const existente = mapa.get(d.recipe_id);
      if (existente) {
        existente.borrador = d;
        return;
      }
      const porNombre = Array.from(mapa.values()).find(
        (x) => !x.recipeId && x.nombre.toLowerCase() === d.nombre.toLowerCase(),
      );
      if (porNombre) {
        porNombre.borrador = d;
        return;
      }
      mapa.set(d.recipe_id, {
        key: d.recipe_id,
        recipeId: d.recipe_id,
        nombre: d.nombre,
        precio: d.precio,
        enviados: 0,
        idsEnviados: [],
        notasEnviadas: [],
        borrador: d,
      });
    });
    return Array.from(mapa.values());
  }, [ordenAbierta, draft]);

  const totalDe = (g: GrupoPedido): number => g.enviados + (g.borrador?.quantity ?? 0);
  const pendientes = draft.reduce((a, d) => a + d.quantity, 0);

  useEffect(() => {
    setDraft([]);
  }, [mesaSel]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3600);
    return () => clearTimeout(t);
  }, [aviso]);

  const qtyEnDraft = (recipeId: string) => draft.find((d) => d.recipe_id === recipeId)?.quantity ?? 0;

  const agregarAlDraft = (item: { id: string; nombre: string; precio: number }) => {
    setDraft((prev) => {
      const existe = prev.find((d) => d.recipe_id === item.id);
      if (existe) {
        return prev.map((d) => (d.recipe_id === item.id ? { ...d, quantity: d.quantity + 1 } : d));
      }
      return [...prev, { recipe_id: item.id, nombre: item.nombre, precio: item.precio, quantity: 1, notes: '' }];
    });
  };

  const agregarDesdeGrupo = (g: GrupoPedido) => {
    const rid = g.recipeId ?? buscarIdMenu(g.nombre) ?? '';
    if (!rid) {
      setAviso({ tipo: 'error', texto: 'No pude identificar la receta de este ítem para sumarle otra unidad.' });
      return;
    }
    agregarAlDraft({ id: rid, nombre: g.nombre, precio: g.precio });
  };

  const cambiarCantidad = (recipeId: string, delta: number) => {
    setDraft((prev) =>
      prev
        .map((d) => (d.recipe_id === recipeId ? { ...d, quantity: d.quantity + delta } : d))
        .filter((d) => d.quantity > 0),
    );
  };

  const cambiarNotas = (recipeId: string, notas: string) =>
    setDraft((prev) => prev.map((d) => (d.recipe_id === recipeId ? { ...d, notes: notas } : d)));

  const restarDeGrupo = async (g: GrupoPedido) => {
    const d = g.borrador;
    if (d && d.quantity > 0) {
      // Solo descontamos lo pendiente por enviar: no hace falta tocar el backend
      cambiarCantidad(d.recipe_id, -1);
      return;
    }
    // Descontar un ítem ya enviado: requiere quitar o actualizar una fila en el backend
    const orderId = ordenAbierta?.orderId ?? '';
    const filaId = g.idsEnviados[0] ?? '';
    if (!orderId || !filaId) {
      setAviso({
        tipo: 'error',
        texto: 'No encontré la cuenta abierta de esta mesa, así que no puedo descontar lo ya enviado.',
      });
      return;
    }
    const fila = (ordenAbierta?.items ?? []).find((x: any) => idFilaDe(x) === filaId);
    const filaQty = cantidadItem(fila);
    setQuitando(g.key);
    try {
      const intentos: Array<() => Promise<any>> =
        filaQty > 1
          ? [
              () => api.patch(`/pos/orders/${orderId}/items/${filaId}`, { quantity: filaQty - 1 }),
              () => api.put(`/pos/orders/${orderId}/items/${filaId}`, { quantity: filaQty - 1 }),
            ]
          : [
              () => api.delete(`/pos/orders/${orderId}/items/${filaId}`),
              () => api.delete(`/orders/${orderId}/items/${filaId}`),
            ];
      let ok = false;
      let ultimo: any = null;
      for (const intento of intentos) {
        try {
          await intento();
          ok = true;
          break;
        } catch (e: any) {
          ultimo = e;
          const st = e?.response?.status;
          if (st !== 404 && st !== 405) throw e;
        }
      }
      if (!ok) throw ultimo ?? new Error('No se pudo descontar el ítem.');
      await queryClient.invalidateQueries();
      setAviso({ tipo: 'ok', texto: 'Ítem descontado.' });
    } catch (e: any) {
      const st = e?.response?.status;
      if (st === 404 || st === 405) {
        setAviso({
          tipo: 'error',
          texto:
            'El backend todavía no permite descontar ítems ya enviados. Es un endpoint corto: lo agregamos en la próxima tanda.',
        });
      } else {
        setAviso({ tipo: 'error', texto: textoError(e) });
      }
    } finally {
      setQuitando(null);
    }
  };

  const subtotalDraft = draft.reduce((acc, d) => acc + d.precio * d.quantity, 0);

  const baseCuenta = ordenAbierta
    ? Number(
        ordenAbierta.total ||
          ordenAbierta.items.reduce((a: number, it: any) => a + precioItem(it) * cantidadItem(it), 0),
      )
    : 0;
  const propina = Math.round(baseCuenta * (pctTip / 100));
  const totalCobro = baseCuenta + propina;

  const mesaActual = mesas.find((m) => m.id === mesaSel) ?? null;

  const enviarComanda = async () => {
    if (!mesaSel || draft.length === 0 || enviando) return;
    const items = draft.map((d) => ({
      recipe_id: d.recipe_id,
      quantity: d.quantity,
      notes: d.notes.trim() ? d.notes.trim() : undefined,
    }));
    setEnviando(true);
    try {
      let enviado = false;
      const orderId = ordenAbierta?.orderId ?? '';
      if (orderId) {
        // La mesa ya tiene cuenta abierta: le sumamos los ítems
        for (const ruta of [`/pos/orders/${orderId}/items`, `/pos/orders/${orderId}/add-items`]) {
          try {
            await api.post(ruta, { items });
            enviado = true;
            break;
          } catch (e: any) {
            const st = e?.response?.status;
            if (st !== 404 && st !== 405) throw e;
          }
        }
      }
      if (!enviado) {
        // Mesa sin cuenta: creamos la orden
        const enviarFn = mutacionEnvio?.mutateAsync ?? mutacionEnvio?.mutate;
        if (!enviarFn) throw new Error('No se encontró la función de envío del pedido.');
        await enviarFn({ table_id: mesaSel, items });
      }
      mesasSinCuenta.delete(mesaSel);
      setDraft([]);
      await queryClient.invalidateQueries();
      setAviso({ tipo: 'ok', texto: 'Comanda enviada a cocina.' });
    } catch (e: any) {
      setAviso({ tipo: 'error', texto: textoError(e) });
    } finally {
      setEnviando(false);
    }
  };

  const cobrar = async () => {
    const orderId = ordenAbierta?.orderId ?? '';
    if (!orderId || cobrando) return;
    setCobrando(true);
    try {
      const body = {
        tip: propina,
        tip_amount: propina,
        tip_percentage: pctTip,
        payment_method: metodo,
        metodo_pago: metodo,
        payment: metodo,
        amount: totalCobro,
        total: totalCobro,
      };
      const rutas = [
        `/pos/orders/${orderId}/checkout`,
        `/pos/orders/${orderId}/close`,
        `/pos/orders/${orderId}/pay`,
      ];
      let cobrado = false;
      let ultimo: any = null;
      for (const ruta of rutas) {
        try {
          await api.post(ruta, body);
          cobrado = true;
          break;
        } catch (e: any) {
          ultimo = e;
          const st = e?.response?.status;
          if (st !== 404 && st !== 405) throw e;
        }
      }
      if (!cobrado) throw ultimo ?? new Error('No se pudo cobrar la mesa.');
      mesasSinCuenta.delete(mesaSel);
      await queryClient.invalidateQueries();
      setAviso({ tipo: 'ok', texto: 'Mesa cobrada y liberada.' });
    } catch (e: any) {
      setAviso({ tipo: 'error', texto: textoError(e) });
    } finally {
      setCobrando(false);
    }
  };

  const crearDemo = async () => {
    if (procesando) return;
    setProcesando(true);
    try {
      const plan = [
        ...[1, 2, 3, 4, 5, 6].map((n) => ({ name: `M${n}`, zone: 'Salón', capacity: 4, seats: 4 })),
        ...[1, 2, 3, 4].map((n) => ({ name: `T${n}`, zone: 'Terraza', capacity: 8, seats: 8 })),
      ];
      let creadas = 0;
      for (const t of plan) {
        try {
          await api.post('/pos/tables', t);
          creadas += 1;
        } catch {
          // si ya existe, seguimos con la siguiente
        }
      }
      await queryClient.invalidateQueries();
      setAviso({
        tipo: 'ok',
        texto:
          creadas > 0
            ? `Listo: ${creadas} mesas creadas (M1 a M6 en Salón, T1 a T4 en Terraza).`
            : 'No se creó ninguna mesa nueva. Si faltan, pégame el aviso del backend.',
      });
    } catch (e: any) {
      setAviso({ tipo: 'error', texto: textoError(e) });
    } finally {
      setProcesando(false);
    }
  };

  const guardarMesa = async () => {
    if (procesando) return;
    setProcesando(true);
    try {
      const body = {
        name: nombreNueva.trim() || 'Mesa nueva',
        zone: zonaNueva.trim() || 'Salón',
        capacity: Number(capacidadNueva) || 4,
        seats: Number(capacidadNueva) || 4,
      };
      await api.post('/pos/tables', body);
      await queryClient.invalidateQueries();
      setModalMesa(false);
      setNombreNueva('');
      setAviso({ tipo: 'ok', texto: 'Mesa creada.' });
    } catch (e: any) {
      setAviso({ tipo: 'error', texto: textoError(e) });
    } finally {
      setProcesando(false);
    }
  };

  const quitarMesa = async (id: string) => {
    if (procesando) return;
    if (!window.confirm('¿Quitar esta mesa? Esta acción no se deshace.')) return;
    setProcesando(true);
    try {
      const rutas = [`/pos/tables/${id}`, `/tables/${id}`];
      let ok = false;
      let ultimo: any = null;
      for (const ruta of rutas) {
        try {
          await api.delete(ruta);
          ok = true;
          break;
        } catch (e: any) {
          ultimo = e;
          const st = e?.response?.status;
          if (st !== 404 && st !== 405) throw e;
        }
      }
      if (!ok) throw ultimo ?? new Error('No se pudo quitar la mesa.');
      if (mesaSel === id) setMesaSel('');
      await queryClient.invalidateQueries();
      setAviso({ tipo: 'ok', texto: 'Mesa eliminada.' });
    } catch (e: any) {
      setAviso({ tipo: 'error', texto: textoError(e) });
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">POS · Comedor</h1>
            <p className="text-sm text-slate-400">
              Toca una mesa, sube cantidades con + directamente sobre cada ítem y envía a cocina.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModalMesa(true)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:border-amber-400/60 hover:text-amber-300"
            >
              Nueva mesa
            </button>
            <button
              type="button"
              onClick={crearDemo}
              disabled={procesando}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:border-amber-400/60 hover:text-amber-300 disabled:opacity-50"
            >
              {procesando ? 'Procesando…' : 'Crear mesas demo'}
            </button>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_420px]">
          <section className="space-y-6">
            {respuestaMesas?.isLoading && <p className="text-sm text-slate-500">Cargando mesas…</p>}
            {!respuestaMesas?.isLoading && mesas.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-10 text-center">
                <p className="text-sm text-slate-400">No hay mesas todavía.</p>
                <button
                  type="button"
                  onClick={crearDemo}
                  className="mt-3 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300"
                >
                  Crear mesas demo
                </button>
              </div>
            )}
            {porZona.map(([zona, lista]) => (
              <div key={zona}>
                <h2 className="px-1 pb-2 text-xs font-bold uppercase tracking-widest text-slate-500">{zona}</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {lista.map((m) => {
                    const sel = m.id === mesaSel;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setMesaSel(m.id)}
                        className={`relative cursor-pointer rounded-2xl border p-4 transition ${
                          sel
                            ? 'border-amber-400 bg-slate-800/90'
                            : m.ocupada
                              ? 'border-amber-400/30 bg-slate-900 hover:border-amber-400/60'
                              : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                        }`}
                      >
                        {esAdmin && (
                          <button
                            type="button"
                            title="Quitar mesa"
                            onClick={(e) => {
                              e.stopPropagation();
                              quitarMesa(m.id);
                            }}
                            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-400"
                          >
                            ×
                          </button>
                        )}
                        <p className="pr-6 text-sm font-bold text-slate-100">{m.texto}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              m.ocupada ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300'
                            }`}
                          >
                            {m.ocupada ? 'Ocupada' : 'Libre'}
                          </span>
                          {m.capacidad > 0 && <span className="text-xs text-slate-500">{m.capacidad} personas</span>}
                        </div>
                        {m.ocupada && m.total > 0 && (
                          <p className="mt-2 text-sm font-bold text-amber-400">{formatearPrecio(m.total)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 lg:sticky lg:top-6">
            {!mesaActual ? (
              <p className="rounded-xl border border-dashed border-slate-800 px-3 py-10 text-center text-xs text-slate-600">
                Selecciona una mesa para ver su pedido, sumar cantidades y cobrar.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-100">{mesaActual.texto}</h2>
                    <p className="text-xs text-slate-500">
                      {mesaActual.capacidad > 0 ? `${mesaActual.capacidad} personas · ` : ''}
                      {mesaActual.zona}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      mesaActual.ocupada ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300'
                    }`}
                  >
                    {mesaActual.ocupada ? 'Ocupada' : 'Libre'}
                  </span>
                </div>

                {cuenta.isLoading && <p className="text-xs text-slate-500">Buscando cuenta abierta…</p>}

                <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Pedido de la mesa</h3>
                    {pendientes > 0 && (
                      <button
                        type="button"
                        onClick={() => setDraft([])}
                        className="text-[11px] font-medium text-slate-500 hover:text-rose-400"
                      >
                        Deshacer cambios
                      </button>
                    )}
                  </div>

                  {grupos.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-600">
                      Sin ítems todavía. Toca un producto del menú rápido para empezar la comanda.
                    </p>
                  ) : (
                    <ul className="mt-2 max-h-[38vh] space-y-3 overflow-y-auto pr-1">
                      {grupos.map((g) => (
                        <li key={g.key} className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm text-slate-100">
                                <span className="font-bold text-amber-400">{totalDe(g)}×</span> {g.nombre}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {formatearPrecio(g.precio * totalDe(g))}
                                {g.borrador ? ' · incluye cambios por enviar' : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => restarDeGrupo(g)}
                                disabled={quitando === g.key}
                                className="h-7 w-7 rounded-lg border border-slate-700 text-slate-200 transition hover:border-rose-400 hover:text-rose-400 disabled:opacity-40"
                              >
                                −
                              </button>
                              <button
                                type="button"
                                onClick={() => agregarDesdeGrupo(g)}
                                className="h-7 w-7 rounded-lg border border-slate-700 text-slate-200 transition hover:border-amber-400 hover:text-amber-400"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {g.notasEnviadas.map((n) => (
                            <p
                              key={n}
                              className="mt-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200"
                            >
                              Especificación: {n}
                            </p>
                          ))}

                          {g.borrador && <EditorNota d={g.borrador} onNotas={cambiarNotas} />}
                        </li>
                      ))}
                    </ul>
                  )}

                  {pendientes > 0 && (
                    <div className="mt-3 border-t border-slate-800 pt-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Cambios por enviar ({pendientes})</span>
                        <span className="font-bold text-slate-200">{formatearPrecio(subtotalDraft)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={enviarComanda}
                        disabled={enviando}
                        className="mt-2 w-full rounded-xl bg-amber-400 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {enviando ? 'Enviando…' : `Enviar a cocina (${pendientes})`}
                      </button>
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Menú rápido</h3>
                  {menu.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-600">No hay recetas en el menú.</p>
                  ) : (
                    <div className="mt-2 grid max-h-[26vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {menu.map((r) => {
                        const qty = qtyEnDraft(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => agregarAlDraft(r)}
                            className="relative rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-left transition hover:border-amber-400/60 hover:bg-slate-800/80"
                          >
                            {qty > 0 && (
                              <span className="absolute right-2 top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-slate-950">
                                {qty}
                              </span>
                            )}
                            <span className="block text-xs font-semibold text-slate-100">{r.nombre}</span>
                            <span className="block text-xs font-bold text-amber-400">{formatearPrecio(r.precio)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                {ordenAbierta?.orderId && (
                  <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Cobro y liberación</h3>
                    <div className="mt-2 flex items-center gap-2">
                      {[0, 10, 15].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPctTip(p)}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                            pctTip === p
                              ? 'bg-amber-400 text-slate-950'
                              : 'border border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400/50'
                          }`}
                        >
                          {p}%
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Base a cobrar</span>
                        <span className="font-semibold text-slate-300">{formatearPrecio(baseCuenta)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Propina ({pctTip}%)</span>
                        <span className="font-semibold text-slate-300">{formatearPrecio(propina)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Total</span>
                        <span className="text-base font-bold text-amber-400">{formatearPrecio(totalCobro)}</span>
                      </div>
                    </div>
                    <select
                      value={metodo}
                      onChange={(e) => setMetodo(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="nequi">Nequi</option>
                    </select>
                    <button
                      type="button"
                      onClick={cobrar}
                      disabled={cobrando}
                      className="mt-2 w-full rounded-xl bg-emerald-400 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {cobrando ? 'Cobrando…' : 'Cobrar y liberar'}
                    </button>
                  </section>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>

      {modalMesa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="text-base font-bold text-slate-100">Nueva mesa</h3>
            <label className="mt-3 block text-xs font-semibold text-slate-400">
              Nombre
              <input
                value={nombreNueva}
                onChange={(e) => setNombreNueva(e.target.value)}
                placeholder="Ej: M7"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-400"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-slate-400">
              Zona
              <input
                value={zonaNueva}
                onChange={(e) => setZonaNueva(e.target.value)}
                placeholder="Salón, Terraza, Barra…"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-400"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-slate-400">
              Capacidad
              <input
                type="number"
                min={1}
                value={capacidadNueva}
                onChange={(e) => setCapacidadNueva(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setModalMesa(false)}
                className="flex-1 rounded-xl border border-slate-700 py-2.5 text-xs font-semibold text-slate-300 hover:border-slate-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarMesa}
                disabled={procesando}
                className="flex-1 rounded-xl bg-amber-400 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {procesando ? 'Guardando…' : 'Guardar mesa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {aviso && (
        <div
          className={`fixed bottom-5 right-5 z-[60] rounded-xl border px-4 py-3 text-sm font-medium shadow-xl ${
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