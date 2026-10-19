// Kārei · hook de mesas: carga, alta, baja y estado ocupado local
import { useCallback, useEffect, useState } from 'react';
import { crearMesa, crearMesasDemo, eliminarMesa, traerMesas } from '../lib/mesasApi';
import type { DatosMesa } from '../lib/mesasApi';
import type { Mesa } from '../lib/tipos';
import { alertaAviso, alertaError, toastOk } from '../lib/alertas';

export function useMesas() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [cargando, setCargando] = useState(true);
  // ids pueden ser texto o número: any[] evita fricción de tipos
  const [ocupadas, setOcupadas] = useState<any[]>([]);

  const marcarOcupada = useCallback((id: any) => {
    setOcupadas((o) => (o.includes(id) ? o : [...o, id]));
  }, []);

  const desmarcar = useCallback((id: any) => {
    setOcupadas((o) => o.filter((x) => x !== id));
  }, []);

  const cargar = useCallback(async () => {
    try {
      setMesas(await traerMesas());
    } catch (e: any) {
      alertaError('No se pudieron cargar las mesas', e?.message ?? '');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = useCallback(async (d: DatosMesa) => {
    try {
      await crearMesa(d);
      toastOk(`Mesa «${d.nombre}» creada`);
      await cargar();
    } catch (e: any) {
      alertaError('No se pudo crear la mesa', e?.message ?? '');
    }
  }, [cargar]);

  const crearDemo = useCallback(async () => {
    try {
      const n = await crearMesasDemo();
      if (n.creadas > 0) {
        toastOk(`${n.creadas} mesas creadas${n.omitidas ? ` · ${n.omitidas} ya existían` : ''}`);
      } else if (n.omitidas > 0) {
        alertaAviso('Nada nuevo', 'Las mesas demo ya existen, no dupliqué nada.');
      } else {
        alertaAviso('Nada creado', 'El backend rechazó todas las mesas demo.');
      }
      await cargar();
    } catch (e: any) {
      alertaError('No se pudieron crear las demo', e?.message ?? '');
    }
  }, [cargar]);

  const eliminar = useCallback(async (id: any) => {
    try {
      await eliminarMesa(id);
      toastOk('Mesa eliminada');
      desmarcar(id);
      await cargar();
    } catch (e: any) {
      alertaError('No se pudo eliminar la mesa', e?.message ?? '');
    }
  }, [cargar, desmarcar]);

  return { mesas, cargando, ocupadas, cargar, crear, crearDemo, eliminar, marcarOcupada, desmarcar };
}