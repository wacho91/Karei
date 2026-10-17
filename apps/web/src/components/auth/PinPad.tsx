import { useEffect, useState } from 'react';

interface PinPadProps {
  onCompleto: (pin: string) => void;
  error: boolean;        // true → tiembla y limpia
  cargando?: boolean;    // true → teclas deshabilitadas
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0', 'entrar'];

export default function PinPad({ onCompleto, error, cargando = false }: PinPadProps) {
  const [pin, setPin] = useState('');

  // si el padre avisa error, limpiamos el pin
  useEffect(() => {
    if (error) setPin('');
  }, [error]);

  const presionar = (tecla: string) => {
    if (cargando) return;
    if (tecla === 'borrar') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (tecla === 'entrar') {
      if (pin.length === 4) onCompleto(pin);
      return;
    }
    if (pin.length < 4) {
      const nuevo = pin + tecla;
      setPin(nuevo);
      if (nuevo.length === 4) onCompleto(nuevo); // auto-envío al 4º dígito
    }
  };

  // soporte de teclado físico (útil en PC, essential en tablets con teclado)
  useEffect(() => {
    const manejar = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) presionar(e.key);
      else if (e.key === 'Backspace') presionar('borrar');
      else if (e.key === 'Enter') presionar('entrar');
    };
    window.addEventListener('keydown', manejar);
    return () => window.removeEventListener('keydown', manejar);
  });

  return (
    <div className={`flex flex-col items-center gap-6 ${error ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
      {/* los 4 puntos */}
      <div className="flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-all duration-150 ${
              i < pin.length ? 'scale-110 border-amber-400 bg-amber-400' : 'border-slate-600'
            }`}
          />
        ))}
      </div>

      {/* teclado */}
      <div className="grid grid-cols-3 gap-3">
        {TECLAS.map((tecla) => (
          <button
            key={tecla}
            type="button"
            onClick={() => presionar(tecla)}
            disabled={cargando}
            className="h-16 w-16 rounded-full bg-slate-800 text-xl font-semibold text-slate-100 transition-all hover:bg-slate-700 active:scale-95 disabled:opacity-50"
          >
            {tecla === 'borrar' ? '⌫' : tecla === 'entrar' ? '✓' : tecla}
          </button>
        ))}
      </div>
    </div>
  );
}