// Kārei · POS Comedor: solo orquestación; la lógica vive en los hooks
import { useState } from 'react';
import MapaMesas from '../components/mesas/MapaMesas';
import MenuRapido from '../components/mesas/MenuRapido';
import ModalNuevaMesa from '../components/mesas/ModalNuevaMesa';
import PanelBorrador from '../components/mesas/PanelBorrador';
import PanelCuenta from '../components/mesas/PanelCuenta';
import PanelPago from '../components/mesas/PanelPago';
import { useMesas } from '../hooks/useMesas';
import { usePedido } from '../hooks/usePedido';
import { diagnosticoPos } from '../lib/diagnosticoPos';
import { alertaErrorTecnico } from '../lib/alertas';

export default function TablesPage() {
  const base = useMesas();
  const pos = usePedido(base.cargar, base.marcarOcupada, base.desmarcar);
  const [modalNueva, setModalNueva] = useState(false);
  const [pago, setPago] = useState(false);
  const mesaActual = base.mesas.find((m) => m.id === pos.mesaId);

  async function diagnostico() {
    alertaErrorTecnico('Diagnóstico POS', await diagnosticoPos());
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">POS · Comedor</h1>
          <p className="text-sm text-zinc-500 mt-1">Selecciona una mesa para ver su cuenta o armar un pedido.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <MapaMesas mesas={base.mesas} ocupadas={base.ocupadas} mesaId={pos.mesaId} cargando={base.cargando}
              onSeleccionar={pos.seleccionar} onEliminar={base.eliminar} onDiagnostico={diagnostico}
              onDemo={base.crearDemo} onNueva={() => setModalNueva(true)} />
          </div>

          <aside className="space-y-4">
            {pos.mesaId && (pos.borrador.length > 0 || !pos.cuenta) && (
              <PanelBorrador mesaNombre={mesaActual?.nombre ?? 'Mesa'} items={pos.borrador}
                onAjustar={pos.ajustar} onNota={pos.notaDe} onLimpiar={pos.limpiar} onEnviar={pos.enviar} />
            )}
            {pos.cuenta && (
              <PanelCuenta cuenta={pos.cuenta} onSumar={pos.sumarItem} onRestar={pos.restarItem} onCobrar={() => setPago(true)} />
            )}
            <MenuRapido recetas={pos.recetas} borrador={pos.borrador} onAgregar={pos.alBorrador} />
          </aside>
        </div>
      </div>

      {modalNueva && <ModalNuevaMesa onCrear={base.crear} onCerrar={() => setModalNueva(false)} />}
      {pago && pos.cuenta && (
        <PanelPago mesaNombre={mesaActual?.nombre ?? 'Mesa'} total={pos.cuenta.total}
          onConfirmar={pos.cobrar} onCerrar={() => setPago(false)} />
      )}
    </div>
  );
}