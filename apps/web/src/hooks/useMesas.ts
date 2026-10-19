// Kārei · hook de mesas: carga, alta, baja y estado ocupado local
import { useCallback, useEffect, useState } from 'react';
import { crearMesa, crearMesasDemo, eliminarMesa, traerMesas } from '../lib/mesasApi';
import type { DatosMesa } from '../lib/mesasApi';
import type { Mesa } from '../lib/tipos';
import { alertaAviso, alertaError, toastOk } from '../lib/alertas';

export function useMesas() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupadas, setOcupadas] = useState<number[]>([]);

  const marcarOcupada = useCallback((id: number) => {
    setOcupadas((o) => (o.includes(id) ? o : [...o, id]));
  }, []);

  const desmarcar = useCallback((id: number) => {
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
      if (n > 0) toastOk(`${n} mesas demo creadas`);
      else alertaAviso('Nada creado', 'El backend rechazó todas las mesas demo.');
      await cargar();
    } catch (e: any) {
      alertaError('No se pudieron crear las demo', e?.message ?? '');
    }
  }, [cargar]);

  const eliminar = useCallback(async (id: number) => {
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