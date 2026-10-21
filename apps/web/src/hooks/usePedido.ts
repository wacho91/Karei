// Kārei · hook del pedido: mesa elegida, borrador, cuenta y cobro (ids crudos)
// v2 "A PRUEBA DE BALAS" (E-14m)
// ----------------------------------------------------------------------------
// FIX: los 3 callbacks (recargarMesas, marcarOcupada, desmarcar) se NORMALIZAN
// al entrar al hook. Si la página los conecta mal o no los pasa, el hook NUNCA
// más truena con "marcarOcupada is not a function": usa un reemplazo seguro,
// avisa por consola ([Karei:usePedido]) y el flujo de envío sigue completo.
import { useEffect, useState } from 'react';
import { traerCuenta } from '../lib/cuentaApi';
import { enviarComanda, sumarItemCuenta, restarItemCuenta } from '../lib/comandaApi';
import { cobrarCuenta } from '../lib/pagoApi';
import { traerRecetas } from '../lib/recetasApi';
import type { Cuenta, Id, LineaBorrador, LineaCuenta, Receta } from '../lib/tipos';
import { alertaAviso, alertaError, toastOk } from '../lib/alertas';

export function usePedido(
  recargarMesas?: () => Promise<void>,
  marcarOcupada?: (id: Id) => void,
  desmarcar?: (id: Id) => void,
) {
  // ── FIX E-14m: normalización de callbacks ────────────────────────────────
  // useMesas SÍ define y SÍ retorna marcarOcupada y desmarcar. Si algo llega
  // roto aquí, el problema está en cómo la PÁGINA invoca usePedido(...).
  // Con estos seguros el flujo jamás se cae por un callback ausente.
  const recargarSeguro: () => Promise<void> =
    typeof recargarMesas === 'function' ? recargarMesas : async () => {};
  const marcarSeguro: (id: Id) => void =
    typeof marcarOcupada === 'function' ? marcarOcupada : () => {};
  const desmarcarSeguro: (id: Id) => void =
    typeof desmarcar === 'function' ? desmarcar : () => {};

  if (
    typeof recargarMesas !== 'function' ||
    typeof marcarOcupada !== 'function' ||
    typeof desmarcar !== 'function'
  ) {
    console.warn(
      '[Karei:usePedido] La página NO conectó bien los callbacks del hook ' +
        '(revisa cómo se invoca usePedido(...) en la página de Mesas). ' +
        'El flujo seguirá funcionando, pero el mapa puede no refrescarse solo.',
    );
  }
  // ──────────────────────────────────────────────────────────────────────────

  const [mesaId, setMesaId] = useState<Id | null>(null);
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [borrador, setBorrador] = useState<LineaBorrador[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [errorMenu, setErrorMenu] = useState('');

  async function cargarRecetas(forzar = false) {
    try { setRecetas(await traerRecetas(forzar)); setErrorMenu(''); }
    catch (e: any) { setErrorMenu(e?.message ?? 'No se pudo cargar el menú'); }
  }
  useEffect(() => { cargarRecetas(); }, []);

  async function seleccionar(id: Id | null) {
    if (id === null || id === '') return;
    setMesaId(id); setCuenta(null); setBorrador([]);
    try {
      const c = await traerCuenta(id);
      setCuenta(c);
      if (c.items.length) marcarSeguro(id);
    } catch { /* sin cuenta: se arma pedido nuevo */ }
  }

  function alBorrador(r: Receta) {
    setBorrador((b) => {
      const i = b.findIndex((x) => x.recipe_id === r.id);
      if (i >= 0) {
        const copia = [...b];
        copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 };
        return copia;
      }
      return [...b, { clave: `r${r.id}`, recipe_id: r.id, nombre: r.nombre, precio: r.precio, cantidad: 1, notes: '' }];
    });
  }

  function ajustar(clave: string, delta: number) {
    setBorrador((b) => b
      .map((x) => (x.clave === clave ? { ...x, cantidad: x.cantidad + delta } : x))
      .filter((x) => x.cantidad > 0));
  }

  function notaDe(clave: string, notes: string) {
    setBorrador((b) => b.map((x) => (x.clave === clave ? { ...x, notes } : x)));
  }
  const limpiar = () => setBorrador([]);

  async function enviar() {
    if (mesaId === null || mesaId === '' || !borrador.length) return;
    const enviados = borrador;
    try {
      const id = await enviarComanda(mesaId, cuenta?.orderId ?? null, enviados);
      marcarSeguro(mesaId);
      setBorrador([]);
      toastOk('Comanda enviada a cocina');
      try {
        setCuenta(await traerCuenta(mesaId));
      } catch {
        setCuenta({
          orderId: id, mesaId,
          items: enviados.map((b) => ({ id: 0, recipeId: b.recipe_id, nombre: b.nombre, precio: b.precio, cantidad: b.cantidad, notes: b.notes })),
          estado: 'abierta',
          total: enviados.reduce((s, b) => s + b.precio * b.cantidad, 0),
        });
      }
      recargarSeguro();
    } catch (e: any) {
      alertaError('No se pudo enviar la comanda', e?.message ?? '');
    }
  }

  async function refrescar(id: Id) {
    try { setCuenta(await traerCuenta(id)); } catch { /* conserva estado local */ }
  }

  async function sumarItem(item: LineaCuenta) {
    if (!cuenta || !cuenta.orderId || !item.recipeId) {
      alertaAviso('Sin pedido identificado', 'El backend no devolvió el id del pedido.');
      return;
    }
    try { await sumarItemCuenta(cuenta.orderId, item.recipeId, item.notes); }
    catch (e: any) { alertaAviso('No se sumó en el backend', e?.message ?? ''); }
    refrescar(cuenta.mesaId);
  }

  async function restarItem(item: LineaCuenta) {
    if (!cuenta || !cuenta.orderId || !item.id) {
      alertaAviso('Sin id de ítem', 'El backend no identificó esta línea de la cuenta.');
      return;
    }
    try { await restarItemCuenta(cuenta.orderId, item.id); }
    catch (e: any) { alertaAviso('No se restó en el backend', e?.message ?? ''); }
    refrescar(cuenta.mesaId);
  }

  async function cobrar(metodo: string, pct: number) {
    if (!cuenta) return;
    const propina = Math.round((cuenta.total * pct) / 100);
    try {
      await cobrarCuenta(cuenta.orderId, cuenta.mesaId, { metodo, propina });
      desmarcarSeguro(cuenta.mesaId);
      setCuenta(null);
      setMesaId(null);
      toastOk('Cuenta cobrada');
      recargarSeguro();
    } catch (e: any) {
      alertaError('No se pudo cobrar', e?.message ?? '');
      throw e;
    }
  }

  return { mesaId, cuenta, borrador, recetas, errorMenu, recargar: cargarRecetas, seleccionar, alBorrador, ajustar, notaDe, limpiar, enviar, sumarItem, restarItem, cobrar };
}
