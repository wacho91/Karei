// Kārei · hook del pedido: mesa elegida, borrador, cuenta y cobro
import { useEffect, useState } from 'react';
import { traerCuenta } from '../lib/cuentaApi';
import { enviarComanda, sumarItemCuenta, restarItemCuenta } from '../lib/comandaApi';
import { cobrarCuenta } from '../lib/pagoApi';
import { traerRecetas } from '../lib/recetasApi';
import type { Cuenta, LineaBorrador, LineaCuenta, Receta } from '../lib/tipos';
import { alertaAviso, alertaError, toastOk } from '../lib/alertas';

export function usePedido(
  recargarMesas: () => Promise<void>,
  marcarOcupada: (id: number) => void,
  desmarcar: (id: number) => void,
) {
  const [mesaId, setMesaId] = useState<number | null>(null);
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [borrador, setBorrador] = useState<LineaBorrador[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [errorMenu, setErrorMenu] = useState('');

  async function cargarRecetas(forzar = false) {
    try {
      setRecetas(await traerRecetas(forzar));
      setErrorMenu('');
    } catch (e: any) {
      setErrorMenu(e?.message ?? 'No se pudo cargar el menú');
    }
  }

  useEffect(() => { cargarRecetas(); }, []);

  async function seleccionar(id: number | null) {
    setMesaId(id); setCuenta(null); setBorrador([]);
    if (!id) return;
    try {
      const c = await traerCuenta(id);
      setCuenta(c);
      if (c.items.length) marcarOcupada(id);
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
    if (!mesaId || !borrador.length) return;
    const enviados = borrador;
    try {
      const id = await enviarComanda(mesaId, cuenta?.orderId ?? null, enviados);
      marcarOcupada(mesaId);
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
      recargarMesas();
    } catch (e: any) {
      alertaError('No se pudo enviar la comanda', e?.message ?? '');
    }
  }

  async function refrescar(id: number) {
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
      desmarcar(cuenta.mesaId);
      setCuenta(null);
      setMesaId(null);
      toastOk('Cuenta cobrada');
      recargarMesas();
    } catch (e: any) {
      alertaError('No se pudo cobrar', e?.message ?? '');
      throw e;
    }
  }

  return { mesaId, cuenta, borrador, recetas, errorMenu, recargar: cargarRecetas, seleccionar, alBorrador, ajustar, notaDe, limpiar, enviar, sumarItem, restarItem, cobrar };
}