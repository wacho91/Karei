// src/pages/TablesPage.tsx — v11 · POS Comedor
// E-14x (mapa en vivo): pasa mesaSeleccionada al MapaMesas v2 (resalta la
//   mesa abierta en el panel). El mapa NUEVO (components/mesas/MapaMesas.tsx
//   v2) ya no trae barra propia ni botones fantasma y pinta el estado REAL
//   (OCUPADA/LIBRE) consultando GET /pos/mapa cada 10 s.
// E-14v: al confirmar el COBRO se abre la TIRILLA (comprobante de pago)
//   lista para imprimir en la térmica de 80mm — sale sola, sin clicks extra.
// E-14u: cobrarEnVivo ACEPTA el body del PanelPago ({ method, tip }) y lo
//   manda al backend → el pago queda registrado con su método y propina
//   (karei_payments) y el reporte del dashboard lo desglosa. Si el panel
//   no manda nada, sigue funcionando igual que en v7 (efectivo · 0).
// E-14t3: el botón Cobrar YA COBRA de verdad:
//   1. PanelCuenta (en vivo) pasa la cuenta REAL al pulsar Cobrar → se guarda
//      en estado y se le pasa a PanelPago (antes recibía pos.cuenta del hook
//      viejo → null → "No hay cuenta abierta para cobrar").
//   2. Al confirmar en el modal, se llama POST /pos/tables/{id}/cobrar del
//      add-on: marca PAGADA, cierra sesión, libera la mesa y refresca todo.
//   3. Fix del choque de nombres del v5 (el import nuevo ganaba) se mantiene.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Hm from '../hooks/useMesas';
import * as Hp from '../hooks/usePedido';
import * as Mm from '../components/mesas/MapaMesas';
import * as Pb from '../components/mesas/PanelBorrador';
import * as Mr from '../components/mesas/MenuRapido';
import * as Mn from '../components/mesas/ModalNuevaMesa';
import * as Pp from '../components/mesas/PanelPago';
import CajaSegura from '../components/mesas/CajaSegura';
import PanelCuenta from './PanelCuenta';
import Tirilla from '../components/facturacion/Tirilla';
import * as apiModule from '../lib/api';
import { toastOk, alertaError } from '../lib/alertas';

const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;

const CajaNoDisponible = (n: string) => () => (
  <div className="m-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
    Bloque {n} no disponible: revisa el export de su archivo.
  </div>
);
const mod = (m: any, n: string): any =>
  typeof m?.[n] === 'function' ? m[n]
  : typeof m?.default === 'function' ? m.default
  : CajaNoDisponible(n);
const MapaMesas = mod(Mm, 'MapaMesas');
const PanelBorrador = mod(Pb, 'PanelBorrador');
const MenuRapido = mod(Mr, 'MenuRapido');
const ModalNuevaMesa = mod(Mn, 'ModalNuevaMesa');
const PanelPago = mod(Pp, 'PanelPago');

export default function TablesPage() {
  const mh: any = (Hm as any).useMesas ?? (Hm as any).default;
  const ph: any = (Hp as any).usePedido ?? (Hp as any).default;
  const m: any = typeof mh === 'function' ? mh() : {};
  const pos: any = typeof ph === 'function' ? ph() : {};
  const queryClient = useQueryClient();
  const [modalMesa, setModalMesa] = useState(false); // modal CERRADO por defecto
  const [pagando, setPagando] = useState(false);
  const [cuentaParaPago, setCuentaParaPago] = useState<any>(null);
  const [cobrando, setCobrando] = useState(false);
  const [tirillaPagoId, setTirillaPagoId] = useState<any>(null); // E-14v

  const mesas: any[] = m.mesas ?? m.data ?? [];
  const recargar: () => any = m.recargar ?? m.cargar ?? (() => {});
  const crearMesa: (d: any) => any = m.crearMesa ?? m.crear ?? (async () => {});
  const eliminarMesa = m.eliminarMesa ?? m.borrarMesa;
  const mesaActual = mesas.find((x: any) => String(x?.id) === String(pos.mesaId));

  // Si el mapa manda la MESA completa, extraigo el id antes de guardar en el hook.
  const sel = (x: any) =>
    pos.seleccionar?.(x && typeof x === 'object' ? (x.id ?? x.code ?? x.name ?? x) : x);

  const alCrear = async (datos: any) => {
    try {
      const r: any = await crearMesa(datos);
      if (r === false) return;
      toastOk('Mesa creada'); setModalMesa(false); recargar();
    } catch (e: any) { alertaError(e?.message ?? 'No se pudo crear la mesa'); }
  };

  // COBRAR EN VIVO (E-14t3 + E-14u): POST /pos/tables/{id}/cobrar del add-on.
  // Marca PAGADA, cierra sesión, libera mesa → refresca mapa + cuenta.
  // E-14u: acepta payload { method, tip } que viene del PanelPago.
  const cobrarEnVivo = async (p?: any) => {
    if (!pos.mesaId || cobrando) return;
    setCobrando(true);
    try {
      const cuerpo = (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
      const r: any = await api.post(`/pos/tables/${pos.mesaId}/cobrar`, cuerpo);
      const d = r?.data ?? r;
      const met: string = d?.metodo_etiqueta ?? d?.metodo ?? '';
      toastOk(`Cuenta cobrada · ${d?.cobradas ?? 1} pedido(s) · $${Number(d?.total ?? 0).toLocaleString('es-CO')}${met ? ` · ${met}` : ''}`);
      if (d?.pago_id) setTirillaPagoId(d.pago_id); // E-14v: tirilla al instante
      setPagando(false);
      setCuentaParaPago(null);
      recargar(); // refresca el mapa (mesa libre)
      queryClient.invalidateQueries({ queryKey: ['karei-cuenta-mesa'] }); // cuenta → vacía
      queryClient.invalidateQueries({ queryKey: ['karei-pagos-metodo'] }); // reporte del dashboard al instante
    } catch (e: any) {
      const det = e?.response?.data?.detail ?? e?.message ?? 'No se pudo cobrar la cuenta';
      alertaError(typeof det === 'string' ? det : 'No se pudo cobrar la cuenta');
    } finally {
      setCobrando(false);
    }
  };

  const B: any = {
    borrador: pos.borrador ?? [], items: pos.borrador ?? [],
    ajustar: pos.ajustar, onAjustar: pos.ajustar, notaDe: pos.notaDe, nota: pos.notaDe,
    limpiar: pos.limpiar, vaciar: pos.limpiar,
    enviar: pos.enviar, onEnviar: pos.enviar, alEnviar: pos.enviar,
    alBorrador: pos.alBorrador, agregar: pos.alBorrador,
  };
  const M: any = {
    recetas: pos.recetas ?? [], menu: pos.recetas ?? [],
    error: pos.errorMenu ?? '', errorMenu: pos.errorMenu ?? '',
    onRecargar: pos.recargar, recargar: pos.recargar, reintentar: pos.recargar,
    alBorrador: pos.alBorrador, agregar: pos.alBorrador, onAgregar: pos.alBorrador,
  };
  const abierto = pos.mesaId !== null && pos.mesaId !== undefined && pos.mesaId !== '';
  const llave = String(pos.mesaId);
  const nombreMesa: string | undefined =
    mesaActual?.nombre ?? mesaActual?.name ?? mesaActual?.label ??
    (mesaActual?.code != null ? `Mesa ${mesaActual.code}` : undefined);

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-white mr-auto">POS · Comedor</h1>
        <button onClick={() => setModalMesa(true)} className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-900 text-sm font-semibold hover:bg-amber-400">＋ Nueva mesa</button>
      </div>
      <div className="flex flex-col xl:flex-row gap-4 items-start">
        <div className="flex-1 w-full min-w-0">
          <CajaSegura nombre="Mapa de mesas">
            <MapaMesas mesas={mesas} ocupadas={m.ocupadas ?? []} seleccionar={sel} alSeleccionar={sel}
              onSeleccionar={sel} alClick={sel} onClick={sel}
              mesaSeleccionada={pos.mesaId ?? null}
              eliminarMesa={eliminarMesa} onEliminar={eliminarMesa} eliminar={eliminarMesa} />
          </CajaSegura>
        </div>
        {abierto && (
          <div className="w-full xl:w-[430px] space-y-4">
            <button onClick={() => pos.seleccionar?.(null)}
              className="text-xs font-semibold text-slate-400 hover:text-amber-300">
              ← Volver al mapa de mesas
            </button>
            <CajaSegura nombre="Cuenta en vivo" key={`c-${llave}`}>
              <PanelCuenta
                mesaId={pos.mesaId ?? null}
                mesaNombre={nombreMesa}
                onCobrar={(c: any) => { setCuentaParaPago(c); setPagando(true); }}
              />
            </CajaSegura>
            <CajaSegura nombre="Pedido (borrador)" key={`b-${llave}`}><PanelBorrador {...B} /></CajaSegura>
            <CajaSegura nombre="Menú rápido" key={`m-${llave}`}><MenuRapido {...M} /></CajaSegura>
          </div>
        )}
      </div>
      {modalMesa && (
        <ModalNuevaMesa abierto={true} onCerrar={() => setModalMesa(false)}
          cerrar={() => setModalMesa(false)} onCrear={alCrear} crear={alCrear} />
      )}
      {pagando && (
        <PanelPago mesa={mesaActual} mesaId={pos.mesaId}
          cuenta={cuentaParaPago ?? pos.cuenta ?? null} abierto={true}
          cobrar={cobrarEnVivo} onCobrar={cobrarEnVivo} pagar={cobrarEnVivo} onPagar={cobrarEnVivo}
          cobrando={cobrando}
          onCerrar={() => setPagando(false)} cerrar={() => setPagando(false)}
          onExito={() => { setPagando(false); recargar(); }} trasCobrar={() => { setPagando(false); recargar(); }} />
      )}
      {/* E-14v: TIRILLA del cobro recién hecho (imprime en térmica 80mm) */}
      {tirillaPagoId && (
        <Tirilla pagoId={tirillaPagoId}
          onCerrar={() => setTirillaPagoId(null)} cerrar={() => setTirillaPagoId(null)} />
      )}
    </div>
  );
}