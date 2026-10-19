// POS de mesas: mapa por zonas + comandas + cobro.
// La UI vive en src/components/mesas/ y la API en src/lib/posApi.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import MapaMesas from '../components/mesas/MapaMesas';
import PanelCuenta from '../components/mesas/PanelCuenta';
import PanelBorrador from '../components/mesas/PanelBorrador';
import MenuRapido from '../components/mesas/MenuRapido';
import PanelPago from '../components/mesas/PanelPago';
import ModalNuevaMesa from '../components/mesas/ModalNuevaMesa';
import {
  traerMesas, traerCuenta, traerRecetas, enviarComanda,
  sumarItemCuenta, restarItemCuenta, cobrarCuenta,
  crearMesa, crearMesasDemo, eliminarMesa, diagnosticoPos, textoError,
} from '../lib/posApi';
import { toastOk, alertaOk, alertaError, alertaErrorTecnico } from '../lib/alertas';
import { nombreMesa, precioItem, cantidadItem, type Mesa, type Cuenta, type LineaBorrador } from '../lib/tipos';

export default function TablesPage() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [cargandoMesas, setCargandoMesas] = useState(true);
  const [recetas, setRecetas] = useState<any[]>([]);

  const [mesaId, setMesaId] = useState<number | null>(null);
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [cargandoCuenta, setCargandoCuenta] = useState(false);

  const [borrador, setBorrador] = useState<LineaBorrador[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [procesando, setProcesando] = useState(false);

  const [modalMesa, setModalMesa] = useState(false);
  const [modalPago, setModalPago] = useState(false);

  const mesa = mesas.find(m => m.id === mesaId) ?? null;

  // ─── Carga de datos ───
  const cargarMesas = useCallback(async () => {
    setCargandoMesas(true);
    setMesas(await traerMesas());
    setCargandoMesas(false);
  }, []);

  const cargarCuenta = useCallback(async (id: number) => {
    setCargandoCuenta(true);
    setCuenta(await traerCuenta(id));
    setCargandoCuenta(false);
  }, []);

  useEffect(() => {
    cargarMesas();
    traerRecetas().then(setRecetas);
  }, [cargarMesas]);

  useEffect(() => {
    setBorrador([]);
    if (mesaId) cargarCuenta(mesaId);
    else setCuenta(null);
  }, [mesaId, cargarCuenta]);

  // ─── Borrador de la comanda ───
  const agregarReceta = (r: any) => {
    const id = Number(r?.id ?? 0);
    if (!id) return;
    setBorrador(prev => {
      const clave = String(id);
      const linea = prev.find(l => l.clave === clave);
      if (linea) return prev.map(l => (l.clave === clave ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [...prev, {
        clave,
        recipe_id: id,
        nombre: String(r?.name ?? r?.nombre ?? `Receta ${id}`),
        precio: Number(r?.price ?? r?.precio ?? 0),
        cantidad: 1,
        notes: '',
      }];
    });
  };

  const cambiarCantidad = (clave: string, delta: number) =>
    setBorrador(prev =>
      prev
        .map(l => (l.clave === clave ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter(l => l.cantidad > 0),
    );

  const cambiarNotas = (clave: string, notas: string) =>
    setBorrador(prev => prev.map(l => (l.clave === clave ? { ...l, notes: notas } : l)));

  const cantidadesBorrador = useMemo(() => {
    const acc: Record<number, number> = {};
    for (const l of borrador) acc[l.recipe_id] = (acc[l.recipe_id] ?? 0) + l.cantidad;
    return acc;
  }, [borrador]);

  const totalCuenta = useMemo(
    () => (cuenta?.items ?? []).reduce((s, it) => s + precioItem(it) * cantidadItem(it), 0),
    [cuenta],
  );

  // ─── Enviar a cocina ───
  const enviar = async () => {
    if (!mesaId || borrador.length === 0 || enviando) return;
    setEnviando(true);
    const items = borrador.map(l => ({
      recipe_id: l.recipe_id,
      quantity: l.cantidad,
      notes: l.notes.trim() || null,
    }));
    const res = await enviarComanda(mesaId, items, cuenta?.orderId ?? null);
    setEnviando(false);

    if (res.ok) {
      setBorrador([]);
      await cargarCuenta(mesaId);
      await cargarMesas();
      toastOk('Comanda enviada a cocina');
    } else {
      alertaErrorTecnico('No se pudo enviar la comanda', [
        'Ninguna ruta del backend aceptó el envío. Detalle:',
        '',
        ...(res.detalle ?? []),
        '',
        'Copia esta ventana y pégala en el chat con tu socio.',
      ]);
    }
  };

  // ─── Ítems de la cuenta abierta ───
  const sumar = async (it: any) => {
    if (!cuenta?.orderId || !mesaId) return;
    setProcesando(true);
    try {
      await sumarItemCuenta(cuenta.orderId, it);
      await cargarCuenta(mesaId);
      toastOk('Ítem agregado');
    } catch (e) {
      alertaError('No se pudo sumar el ítem', textoError(e));
    }
    setProcesando(false);
  };

  const restar = async (it: any) => {
    if (!cuenta?.orderId || !mesaId) return;
    setProcesando(true);
    try {
      await restarItemCuenta(cuenta.orderId, it);
      await cargarCuenta(mesaId);
      toastOk('Ítem reducido');
    } catch (e) {
      alertaError('No se pudo reducir el ítem', textoError(e));
    }
    setProcesando(false);
  };

  // ─── Cobro ───
  const confirmarCobro = async (propinaPct: number, metodo: string) => {
    if (!cuenta?.orderId) return;
    setProcesando(true);
    try {
      await cobrarCuenta(cuenta.orderId, propinaPct, metodo);
      setModalPago(false);
      setCuenta(null);
      setMesaId(null);
      await cargarMesas();
      alertaOk('Cuenta cobrada', `Método: ${metodo} · Propina: ${propinaPct}%`);
    } catch (e) {
      alertaError('No se pudo cobrar', textoError(e));
    }
    setProcesando(false);
  };

  // ─── Mesas ───
  const crearMesaNueva = async (datos: { nombre: string; zona: string; capacidad: number }) => {
    try {
      await crearMesa(datos);
      setModalMesa(false);
      await cargarMesas();
      toastOk('Mesa creada');
    } catch (e) {
      alertaError('No se pudo crear la mesa', textoError(e));
    }
  };

  const crearDemo = async () => {
    await crearMesasDemo();
    await cargarMesas();
    toastOk('Mesas demo listas');
  };

  const quitarMesa = async (m: Mesa) => {
    try {
      await eliminarMesa(m.id);
      if (m.id === mesaId) setMesaId(null);
      await cargarMesas();
      toastOk('Mesa eliminada');
    } catch (e) {
      alertaError('No se pudo eliminar la mesa', textoError(e));
    }
  };

  const diagnostico = async () => {
    const lineas = await diagnosticoPos(mesaId);
    alertaErrorTecnico('Diagnóstico de rutas POS', [...lineas, '', 'Copia esta ventana y pégala en el chat.']);
  };

  // ─── Vista ───
  return (
    <div className="flex flex-col gap-4 p-4 lg:flex-row">
      <MapaMesas
        mesas={mesas}
        mesaIdSeleccionada={mesaId}
        cargando={cargandoMesas}
        onSeleccionar={m => setMesaId(prev => (m.id === prev ? null : m.id))}
        onQuitar={quitarMesa}
        onNuevaMesa={() => setModalMesa(true)}
        onCrearDemo={crearDemo}
        onDiagnostico={diagnostico}
      />

      {mesaId && (
        <div className="flex w-full flex-col gap-4 lg:w-96">
          {cuenta && (
            <PanelCuenta
              nombreMesaTxt={mesa ? nombreMesa(mesa) : `Mesa #${mesaId}`}
              orderId={cuenta.orderId ?? 0}
              items={cuenta.items}
              total={totalCuenta}
              cargando={cargandoCuenta}
              procesando={procesando}
              onSumar={sumar}
              onRestar={restar}
              onCobrar={() => setModalPago(true)}
            />
          )}

          {(borrador.length > 0 || !cuenta) && (
            <PanelBorrador
              nombreMesaTxt={mesa ? nombreMesa(mesa) : `Mesa #${mesaId}`}
              lineas={borrador}
              enviando={enviando}
              onCantidad={cambiarCantidad}
              onNotas={cambiarNotas}
              onEnviar={enviar}
              onCancelar={() => setBorrador([])}
            />
          )}

          <MenuRapido recetas={recetas} cantidades={cantidadesBorrador} onAgregar={agregarReceta} />
        </div>
      )}

      {modalMesa && <ModalNuevaMesa onCrear={crearMesaNueva} onCerrar={() => setModalMesa(false)} />}
      {modalPago && cuenta && (
        <PanelPago total={totalCuenta} procesando={procesando} onConfirmar={confirmarCobro} onCerrar={() => setModalPago(false)} />
      )}
    </div>
  );
}