// TablesPage.tsx v3 — mapa + panel derecho + menú rápido + COBRO CON PROPINA restaurado
import { useState } from 'react';
import * as _hm from '../hooks/useMesas';
import * as _hp from '../hooks/usePedido';
import * as _mapa from '../components/mesas/MapaMesas';
import * as _borrador from '../components/mesas/PanelBorrador';
import * as _cuenta from '../components/mesas/PanelCuenta';
import * as _pago from '../components/mesas/PanelPago';
import * as _menu from '../components/mesas/MenuRapido';
import * as _modal from '../components/mesas/ModalNuevaMesa';

// Acepta el export sea default o nombrado (a prueba de nombres, como http.ts)
function mod(m: any, nombre: string): any {
  return (m as any)?.default ?? (m as any)?.[nombre] ?? null;
}
const useMesas: any = mod(_hm, 'useMesas');
const usePedido: any = mod(_hp, 'usePedido');
const MapaMesas: any = mod(_mapa, 'MapaMesas');
const PanelBorrador: any = mod(_borrador, 'PanelBorrador');
const PanelCuenta: any = mod(_cuenta, 'PanelCuenta');
const PanelPago: any = mod(_pago, 'PanelPago');
const MenuRapido: any = mod(_menu, 'MenuRapido');
const ModalNuevaMesa: any = mod(_modal, 'ModalNuevaMesa');

export default function TablesPage() {
  const base: any = useMesas();
  const pos: any = usePedido(base?.cargar, base?.marcarOcupada, base?.desmarcar);
  const [modal, setModal] = useState(false);
  const [pagando, setPagando] = useState(false);

  const abrirPago = () => setPagando(true);
  const cobrar = (metodo: any, propina: any) => {
    try {
      const r: any = pos?.cobrar?.(metodo, propina);
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch { /* el hook ya avisa si falla */ }
    setPagando(false);
  };
  const borrador: any[] = Array.isArray(pos?.borrador) ? pos.borrador : [];
  const subtotal = borrador.reduce((t, l) =>
    t + (Number(l?.precio ?? 0) || 0) * (Number(l?.cantidad ?? 1) || 1), 0);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-bold text-white">POS · Comedor</h1>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <MapaMesas
          mesas={base?.mesas} lista={base?.mesas} cargando={base?.cargando} loading={base?.cargando}
          ocupadas={base?.ocupadas} mesaId={pos?.mesaId}
          onSeleccionar={pos?.seleccionar} seleccionar={pos?.seleccionar} alSeleccionar={pos?.seleccionar}
          onEliminar={base?.eliminar} eliminar={base?.eliminar} alEliminar={base?.eliminar}
          onCrearDemo={base?.crearDemo} crearDemo={base?.crearDemo} onDemo={base?.crearDemo}
          crearMesasDemo={base?.crearDemo} onNueva={() => setModal(true)} onNuevaMesa={() => setModal(true)}
          nuevaMesa={() => setModal(true)}
        />

        <div className="space-y-4">
          {pagando && pos?.cuenta ? (
            <PanelPago cuenta={pos.cuenta} onCobrar={cobrar}
              onCerrar={() => setPagando(false)} onCancelar={() => setPagando(false)} />
          ) : (
            <>
              {pos?.cuenta && (
                <PanelCuenta cuenta={pos.cuenta} mesaId={pos?.mesaId}
                  onSumar={pos?.sumarItem} sumar={pos?.sumarItem} onMas={pos?.sumarItem} onAumentar={pos?.sumarItem}
                  onRestar={pos?.restarItem} restar={pos?.restarItem} onMenos={pos?.restarItem} onDisminuir={pos?.restarItem}
                  onCobrar={abrirPago} cobrar={abrirPago} onPagar={abrirPago} />
              )}
              {borrador.length > 0 && (
                <PanelBorrador borrador={borrador} lineas={borrador} comanda={borrador} mesaId={pos?.mesaId}
                  total={subtotal} subtotal={subtotal}
                  onAjustar={pos?.ajustar} ajustar={pos?.ajustar} onCambiar={pos?.ajustar} cambiar={pos?.ajustar}
                  onNota={pos?.notaDe} notaDe={pos?.notaDe} onNotaDe={pos?.notaDe} nota={pos?.notaDe}
                  onEnviar={pos?.enviar} enviar={pos?.enviar} alEnviar={pos?.enviar} enviarCocina={pos?.enviar}
                  onLimpiar={pos?.limpiar} limpiar={pos?.limpiar} />
              )}
            </>
          )}
        </div>
      </div>

      <MenuRapido
        recetas={pos?.recetas} menu={pos?.recetas} productos={pos?.recetas} items={pos?.recetas}
        borrador={borrador} cantidades={borrador}
        onAgregar={pos?.alBorrador} alBorrador={pos?.alBorrador} agregar={pos?.alBorrador} onAdd={pos?.alBorrador}
        error={pos?.errorMenu} errorMenu={pos?.errorMenu}
        onRecargar={pos?.recargar} recargar={pos?.recargar} onReintentar={pos?.recargar}
      />

      <ModalNuevaMesa abierto={modal} open={modal} visible={modal} activo={modal}
        onCerrar={() => setModal(false)} onClose={() => setModal(false)} onCancelar={() => setModal(false)}
        onCrear={base?.crear} crear={base?.crear} onGuardar={base?.crear} guardar={base?.crear} />
    </div>
  );
}