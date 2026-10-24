// LogoKarei.tsx — E-14z-c
// Marca Kārei vectorial · Propuesta C: tenedor + cuchillo + cuchara formando la K.
// Tenedor = pata vertical | Cuchillo = diagonal superior | Cuchara = diagonal inferior.
//
// Usos:
//   <MarkKarei size={32} variante="dark" />            → sidebar, junto al nombre "Kārei"
//   <LogoKarei variante="light" sizeMark={72} />       → pantalla de login (mark + wordmark)
//   <MarkKarei size={54} variante="print" className="mx-auto block" /> → encabezado de la tirilla
//
// Variantes:
//   dark  → ámbar #F59E0B  (sobre fondos oscuros: sidebar slate, login oscuro)
//   light → slate #1E293B  (sobre fondos claros: papeles, modales blancos)
//   print → negro #000000  (impresora térmica de la tirilla / Informe Z)

type Variante = 'dark' | 'light' | 'print';

const COLOR_VARIANTE: Record<Variante, string> = {
  dark: '#F59E0B',
  light: '#1E293B',
  print: '#000000',
};

interface MarkKareiProps {
  size?: number;
  variante?: Variante;
  className?: string;
}

/** Solo el símbolo (la K de cubiertos), cuadrado 1:1. */
export function MarkKarei({ size = 40, variante = 'dark', className = '' }: MarkKareiProps) {
  const c = COLOR_VARIANTE[variante];
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Kārei"
    >
      <g fill="none" stroke={c} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
        {/* TENEDOR = pata vertical de la K */}
        <path d="M33 16 V31 M42 16 V31 M51 16 V31" />
        <path d="M33 31 H51" />
        <path d="M42 31 V104" />
        {/* CUCHILLO = diagonal superior de la K (lomo recto, filo con barriga) */}
        <g transform="rotate(-45 42 62)">
          <path d="M42 62 H61" />
          <path
            fill={c}
            stroke="none"
            d="M60 56.5 H84 Q91 56.5 94 61 Q93 65.5 87.5 66.8 Q79 67.7 69 67.5 L60 67.5 Z"
          />
        </g>
        {/* CUCHARA = diagonal inferior de la K */}
        <path d="M42 62 L69 89" />
        <circle cx="78" cy="95" r="9" fill={c} stroke="none" />
      </g>
    </svg>
  );
}

interface LogoKareiProps {
  variante?: Variante;
  sizeMark?: number;
  className?: string;
}

/** Logo completo: símbolo + wordmark KÄREI debajo. Para login y presentaciones. */
export function LogoKarei({ variante = 'dark', sizeMark = 64, className = '' }: LogoKareiProps) {
  const color = COLOR_VARIANTE[variante];
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <MarkKarei size={sizeMark} variante={variante} />
      <span
        className="select-none font-semibold leading-none"
        style={{
          color,
          fontSize: Math.round(sizeMark * 0.28),
          letterSpacing: '0.35em',
          marginRight: '-0.35em', // compensa el tracking del último carácter para centrar bien
        }}
      >
        KÄREI
      </span>
    </div>
  );
}

export default LogoKarei;