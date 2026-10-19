// src/pages/TablesPage.tsx — v4 · POS Comedor
// FIX E-9: el modal "Nueva mesa" salía solo → ahora SOLO se monta al pulsar el botón.
import { useState } from 'react';
import * as Hm from '../hooks/useMesas';
import * as Hp from '../hooks/usePedido';
import * as Mm from '../components/mesas/MapaMesas';
import * as Pc from '../components/mesas/PanelCuenta';
import * as Pb from '../components/mesas/PanelBorrador';
import * as Mr from '../components/mesas/MenuRapido';
import * as Mn from '../components/mesas/ModalNuevaMesa';
import * as Pp from '../components/mesas/PanelPago';
import { diagnosticoPos } from '../lib/diagnosticoPos';
import { toastOk, alertaError } from '../lib/alertas';

const mod = (m: any, n: string): any => m?.default ?? m?.[n] ?? m;
const MapaMesas = mod(Mm, 'MapaMesas');
const PanelCuenta = mod(Pc, 'PanelCuenta');
const PanelBorrador = mod(Pb, 'PanelBorrador');
const MenuRapido = mod(Mr, 'MenuRapido');
const ModalNuevaMesa = mod(Mn, 'ModalNuevaMesa');
const PanelPago = mod(Pp, 'PanelPago');

export default function TablesPage() {
  const mh: any = (Hm as any).useMesas ?? (Hm as any).default;
  const ph: any = (Hp as any).usePedido ?? (Hp as any).default;
  const m: any = typeof mh === 'function' ? mh() : {};
  const pos: any = typeof ph === 'function' ? ph() : {};
  const [modalMesa, setModalMesa] = useState(false); // ⬅ arranca CERRADO (fix E-9)
  const [pagando, setPagando] = useState(false);

  const mesas: any[] = m.mesas ?? m.data ?? [];
  const recargar: () => any = m.recargar ?? m.cargar ?? (() => {});
  const crearMesa: (d: any) => any = m.crearMesa ?? m.crear ?? (async () => {});
  const crearDemo: () => any = m.crearMesasDemo ?? m.crearDemo ?? m.crearMesas ?? (async () => {});
  const eliminarMesa = m.eliminarMesa ?? m.borrarMesa;
  const mesaActual = mesas.find((x: any) => String(x?.id) === String(pos.mesaId));
  const cerrarMesa = pos.cerrar ?? pos.cerrarMesa ?? (() => pos.seleccionar?.(null));

  const alCrear = async (datos: any) => {
    try {
      const r: any = await crearMesa(datos);
      if (r === false) return; // el hook reportó el fallo, dejo el modal abierto
      toastOk('Mesa creada');
      setModalMesa(false);
      recargar();
    } catch (e: any) { alertaError(e?.message ?? 'No se pudo crear la mesa'); }
  };

  const alDemo = async () => {
    try {
      const r: any = await crearDemo();
      toastOk(`Demo: ${r?.creadas ?? 0} creadas · ${r?.omitidas ?? 0} ya existían`);
      recargar();
    } catch (e: any) { alertaError(e?.message ?? 'No pude crear las mesas demo'); }
  };

  const sel = pos.seleccionar;
  const C: any = {
    mesa: mesaActual, mesaId: pos.mesaId, cuenta: pos.cuenta, pedido: pos.cuenta,
    sumarItem: pos.sumarItem, sumar: pos.sumarItem, restarItem: pos.restarItem, restar: pos.restarItem,
    onCobrar: () => setPagando(true), alCobrar: () => setPagando(true), cobrar: () => setPagando(true),
    iniciarPago: () => setPagando(true),
    onCerrar: cerrarMesa, cerrar: cerrarMesa, alCerrar: cerrarMesa,
  };
  const B: any = {
    borrador: pos.borrador, items: pos.borrador, ajustar: pos.ajustar, onAjustar: pos.ajustar,
    notaDe: pos.notaDe, nota: pos.notaDe, limpiar: pos.limpiar, vaciar: pos.limpiar,
    enviar: pos.enviar, onEnviar: pos.enviar, alEnviar: pos.enviar,
    alBorrador: pos.alBorrador, agregar: pos.alBorrador,
  };
  const M: any = {
    recetas: pos.recetas, menu: pos.recetas, error: pos.errorMenu, errorMenu: pos.errorMenu,
    onRecargar: pos.recargar, recargar: pos.recargar, reintentar: pos.recargar,
    alBorrador: pos.alBorrador, agregar: pos.alBorrador, onAgregar: pos.alBorrador,
  };
  const abierto = pos.mesaId !== null && pos.mesaId !== undefined && pos.mesaId !== '';

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-white mr-auto">POS · Comedor</h1>
        <button onClick={() => setModalMesa(true)} className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-900 text-sm font-semibold hover:bg-amber-400">＋ Nueva mesa</button>
        <button onClick={alDemo} className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-sm hover:bg-slate-600">Mesas demo</button>
        <button onClick={() => { try { (diagnosticoPos as any)(); } catch { /* ignora */ } }} className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800">Diagnóstico</button>
      </div>
      <div className="flex flex-col xl:flex-row gap-4 items-start">
        <div className="flex-1 w-full min-w-0">
          <MapaMesas mesas={mesas} ocupadas={m.ocupadas ?? []} seleccionar={sel} alSeleccionar={sel}
            onSeleccionar={sel} alClick={sel} onClick={sel}
            eliminarMesa={eliminarMesa} onEliminar={eliminarMesa} eliminar={eliminarMesa} />
        </div>
        {abierto && (
          <div className="w-full xl:w-[430px] space-y-4">
            <PanelCuenta {...C} />
            <PanelBorrador {...B} />
            <MenuRapido {...M} />
          </div>
        )}
      </div>
      {modalMesa && (
        <ModalNuevaMesa abierto={true} onCerrar={() => setModalMesa(false)}
          cerrar={() => setModalMesa(false)} onCrear={alCrear} crear={alCrear} />
      )}
      {pagando && (
        <PanelPago mesa={mesaActual} mesaId={pos.mesaId} cuenta={pos.cuenta} abierto={true}
          cobrar={pos.cobrar} onCobrar={pos.cobrar} pagar={pos.cobrar} onPagar={pos.cobrar}
          onCerrar={() => setPagando(false)} cerrar={() => setPagando(false)}
          onExito={() => { setPagando(false); recargar(); }} trasCobrar={() => { setPagando(false); recargar(); }} />
      )}
    </div>
  );
}