import { useAvanzarComanda } from '@/hooks/usePos';
import { toastError, toastExito } from '@/lib/alertas';
import type { ComandaCocina } from '@/types/pos';

const ESTILOS: Record<string, { borde: string; etiqueta: string; boton: string; texto: string }> = {
  SENT_TO_KITCHEN: {
    borde: 'border-amber-500/60',
    etiqueta: '⏳ Pendiente',
    boton: 'bg-sky-600 hover:bg-sky-500',
    texto: '👨‍🍳 Empezar a preparar',
  },
  IN_PREPARATION: {
    borde: 'border-sky-500/60',
    etiqueta: '🔥 En preparación',
    boton: 'bg-emerald-600 hover:bg-emerald-500',
    texto: '🔔 ¡Pedido listo!',
  },
  READY: {
    borde: 'border-emerald-500/60',
    etiqueta: '✅ ¡Listo para servir!',
    boton: '',
    texto: '',
  },
};

/** SQLite guarda UTC sin sufijo Z: lo agregamos para parsear bien. */
const minutosTranscurridos = (iso: string | null): number => {
  if (!iso) return 0;
  const fecha = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return Math.max(0, Math.floor((Date.now() - fecha.getTime()) / 60_000));
};

export const ComandaCard = ({ comanda }: { comanda: ComandaCocina }) => {
  const avanzar = useAvanzarComanda();
  const estilo = ESTILOS[comanda.status] ?? ESTILOS.SENT_TO_KITCHEN;
  const minutos = minutosTranscurridos(comanda.created_at);
  const urgente = minutos >= 10 && comanda.status !== 'READY';

  const handleAvanzar = () => {
    avanzar.mutate(comanda.id, {
      onSuccess: (res) => {
        if (res.status === 'READY') toastExito(`${res.order_number} listo para servir 🔔`);
      },
      onError: (err) => {
        const detalle = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        toastError(detalle ?? 'Error al avanzar la comanda');
      },
    });
  };

  return (
    <div className={`bg-slate-800/60 border-2 ${urgente ? 'border-rose-500 animate-pulse' : estilo.borde} rounded-2xl p-5 w-80 shrink-0`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xl font-extrabold text-white">{comanda.order_number}</p>
          <p className="text-sm text-amber-400 font-bold">{comanda.table_name}</p>
        </div>
        <div className="text-right">
          <span className={`text-xs font-bold px-2 py-1 rounded-lg ${urgente ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-300'}`}>
            {urgente ? '🚨 ' : '⏱ '}{minutos} min
          </span>
          <p className="text-xs text-slate-400 mt-1">{estilo.etiqueta}</p>
        </div>
      </div>

      <ul className="space-y-2 border-t border-slate-700 pt-3">
        {comanda.items.map((item) => (
          <li key={item.id} className="text-slate-200">
            <span className="font-bold text-amber-400">{item.quantity}×</span> {item.recipe_name}
            {item.notes && (
              <p className="text-xs text-rose-400 ml-6">📝 {item.notes}</p>
            )}
          </li>
        ))}
      </ul>

      {comanda.status !== 'READY' && (
        <button
          onClick={handleAvanzar}
          disabled={avanzar.isPending}
          className={`w-full mt-4 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 ${estilo.boton}`}
        >
          {estilo.texto}
        </button>
      )}
    </div>
  );
};