// src/components/mesas/CajaSegura.tsx — v1 (E-10)
// Escudo anti pantalla-blanca: si un bloque falla, se muestra el error en una
// caja roja y el resto de la página sigue viva. Reintentar vuelve a montarlo.
import { Component } from 'react';

type Props = { nombre: string; children: any };
type State = { error: any };

export default class CajaSegura extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: any): State {
    return { error };
  }

  componentDidCatch(error: any, info: any) {
    console.error(`[Karei:${this.props.nombre}]`, error, info?.componentStack);
  }

  render() {
    const e: any = this.state.error;
    if (!e) return this.props.children as any;
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 space-y-2">
        <p className="text-sm font-semibold text-red-300">
          Fallo en {this.props.nombre}
        </p>
        <p className="text-xs text-red-200/90 break-words">
          {String(e?.message ?? e)}
        </p>
        <button
          onClick={() => this.setState({ error: null })}
          className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-xs hover:bg-red-500/30"
        >
          Reintentar
        </button>
      </div>
    );
  }
}