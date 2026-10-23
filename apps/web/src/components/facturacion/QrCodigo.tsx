// src/components/facturacion/QrCodigo.tsx (E-14z) — QR AUTOCONTENIDO · SIN DEPENDENCIAS
// ----------------------------------------------------------------------------
// QUÉ RESUELVE: dibuja el código QR de la FACTURA DE VENTA (verificación DIAN)
// sin instalar ninguna librería. Implementa el estándar ISO/IEC 18004 en su
// núcleo mínimo y probado: modo byte, versiones 1-10 (21×21 a 57×57), niveles
// de corrección L y M, máscara elegida automáticamente por penalidad y
// Reed-Solomon sobre GF(256). El resultado es un SVG nítido (crispEdges) que
// imprime perfecto en papel térmico de 80mm.
//
// USO:
//   <QrCodigo texto="https://..." lado="22mm" />
//
// EXPORT extra: qrMatriz(texto, 'L'|'M') → matriz booleana[][] (para pruebas).
// ----------------------------------------------------------------------------
// FIX E-14z-b: faltaba el import de useMemo (la función render usaba useMemo
// sin importarlo → "ReferenceError: useMemo is not defined" al abrir una
// factura → el QR nunca se veía y el modal se caía). Una línea, cero cambios
// de lógica: el encoder queda EXACTAMENTE igual al que pasó las pruebas con
// decodificador real (12 casos M + 5 L + E2E).
import { useMemo } from 'react';

// ── Aritmética GF(256) para Reed-Solomon (polinomio primitivo 0x11d) ────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mulGf = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!;

/** Resto Reed-Solomon (palabras de corrección) del bloque de datos. */
function rsEcc(datos: number[], nEcc: number): number[] {
  // polinomio generador g(x) = (x - α^0)(x - α^1)…(x - α^(nEcc-1))
  // (orden descendente: gen[0] = coeficiente del grado mayor)
  let gen: number[] = [1];
  for (let i = 0; i < nEcc; i++) {
    const nx = new Array<number>(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      nx[j] ^= gen[j]!;                    // parte x·g
      nx[j + 1] ^= mulGf(gen[j]!, EXP[i]!); // parte α^i·g
    }
    gen = nx;
  }
  const msg = datos.concat(new Array<number>(nEcc).fill(0));
  for (let i = 0; i < datos.length; i++) {
    const f = msg[i]!;
    if (f !== 0) {
      for (let j = 0; j < gen.length; j++) msg[i + j] ^= mulGf(gen[j]!, f);
    }
  }
  return msg.slice(datos.length);
}

// ── Tablas del estándar para versiones 1..10 ────────────────────────────────
const TOTAL_CW = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const ECC_POR_BLOQUE: Record<'L' | 'M', number[]> = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
};
const NUM_BLOQUES: Record<'L' | 'M', number[]> = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
};
const ALINEA: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

const dataCw = (v: number, nivel: 'L' | 'M'): number =>
  TOTAL_CW[v - 1]! - ECC_POR_BLOQUE[nivel][v - 1]! * NUM_BLOQUES[nivel][v - 1]!;

/** Menor versión 1..10 cuyos datos caben (modo byte). null si no caben. */
function elegirVersion(n: number, nivel: 'L' | 'M'): number | null {
  for (let v = 1; v <= 10; v++) {
    const cci = v <= 9 ? 8 : 16; // contador de caracteres
    if (4 + cci + 8 * n <= dataCw(v, nivel) * 8) return v;
  }
  return null;
}

/** Datos + relleno → palabras de código (intercaladas entre bloques). */
function palabrasDatos(bytes: Uint8Array, nivel: 'L' | 'M', v: number): number[] {
  const cci = v <= 9 ? 8 : 16;
  const bits: number[] = [];
  const push = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(4, 4); // modo byte
  push(bytes.length, cci);
  for (const b of bytes) push(b!, 8);

  const total = dataCw(v, nivel);
  // terminador (hasta 4 ceros) + relleno a byte
  const resto = total * 8 - bits.length;
  for (let i = 0; i < Math.min(4, resto); i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]!;
    cw.push(b);
  }
  const pads = [0xEC, 0x11];
  for (let i = 0; cw.length < total; i++) cw.push(pads[i % 2]!);

  // partir en bloques (los cortos primero) + ECC e intercalado.
  // OJO: `total` aquí son las palabras de DATOS (sin ECC); los bloques se
  // parten por datos y el ECC se calcula aparte por bloque.
  const nBloq = NUM_BLOQUES[nivel][v - 1]!;
  const eccLen = ECC_POR_BLOQUE[nivel][v - 1]!;
  const nCortos = nBloq - (total % nBloq);
  const cortoLen = Math.floor(total / nBloq); // datos por bloque corto
  const bloques: { dat: number[]; ecc: number[] }[] = [];
  let k = 0;
  for (let i = 0; i < nBloq; i++) {
    const datLen = cortoLen + (i < nCortos ? 0 : 1);
    const dat = cw.slice(k, k + datLen);
    k += datLen;
    bloques.push({ dat, ecc: rsEcc(dat, eccLen) });
  }
  const out: number[] = [];
  const maxDat = cortoLen + 1;
  for (let i = 0; i < maxDat; i++) {
    for (let j = 0; j < nBloq; j++) {
      if (i < bloques[j]!.dat.length) out.push(bloques[j]!.dat[i]!);
    }
  }
  for (let i = 0; i < eccLen; i++) {
    for (let j = 0; j < nBloq; j++) out.push(bloques[j]!.ecc[i]!);
  }
  return out;
}

/** Lienzo con los patrones fijos (función) reservados. */
function lienzo(v: number): { m: (boolean | null)[][]; fn: boolean[][]; N: number } {
  const N = 17 + 4 * v;
  const m: (boolean | null)[][] = Array.from({ length: N },
    () => new Array<boolean | null>(N).fill(null));
  const fn: boolean[][] = Array.from({ length: N },
    () => new Array<boolean>(N).fill(false));
  const pone = (x: number, y: number, val: boolean) => {
    m[y]![x] = val;
    fn[y]![x] = true;
  };

  // buscadores (finders) + separadores
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        pone(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(N - 4, 3);
  finder(3, N - 4);

  // temporización
  for (let i = 8; i < N - 8; i++) {
    pone(i, 6, i % 2 === 0);
    pone(6, i, i % 2 === 0);
  }

  // patrones de alineación — se saltan SOLO los que caen sobre los 3 finders
  // (los centrados en la línea de temporización SÍ se dibujan y la reemplazan)
  const cen = ALINEA[v - 1]!;
  const ultima = cen[cen.length - 1]!;
  for (const cy of cen) {
    for (const cx of cen) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === ultima) || (cx === ultima && cy === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          pone(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // reservas de formato: columna x=8 (y 0..8) y fila y=8 (x 0..8)
  for (let i = 0; i <= 8; i++) {
    if (!fn[i]![8]) pone(8, i, false);
    if (!fn[8]![i]) pone(i, 8, false);
  }
  // segunda copia del formato: fila derecha y columna izquierda inferior
  for (let i = 0; i < 8; i++) {
    if (!fn[8]![N - 1 - i]) pone(N - 1 - i, 8, false);
  }
  for (let i = 8; i < 15; i++) {
    if (!fn[N - 15 + i]![8]) pone(8, N - 15 + i, false);
  }
  // módulo oscuro permanente
  pone(8, N - 8, true);

  // información de versión (v ≥ 7)
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const vb = (v << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const b = ((vb >>> i) & 1) === 1;
      const a = N - 11 + (i % 3);
      const c = Math.floor(i / 3);
      pone(a, c, b);
      pone(c, a, b);
    }
  }
  return { m, fn, N };
}

/** Coloca los bits de datos en zigzag sobre los módulos libres. */
function colocar(m: (boolean | null)[][], fn: boolean[][], N: number, cw: number[]) {
  const bits: number[] = [];
  for (const b of cw) for (let i = 7; i >= 0; i--) bits.push((b >>> i) & 1);
  let k = 0;
  for (let right = N - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < N; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const sube = ((right + 1) & 2) === 0;
        const y = sube ? N - 1 - vert : vert;
        if (!fn[y]![x] && k < bits.length) m[y]![x] = bits[k++] === 1;
      }
    }
  }
}

const MASCARAS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Dibuja los 15 bits de formato (nivel + máscara) en ambas copias. */
function dibujarFormato(m: (boolean | null)[][], N: number, nivel: 'L' | 'M', mask: number) {
  const eccBits = nivel === 'L' ? 1 : 0; // L=01, M=00
  const data = (eccBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fmt = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((fmt >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) m[i]![8] = bit(i);
  m[7]![8] = bit(6);
  m[8]![8] = bit(7);
  m[8]![7] = bit(8);
  for (let i = 9; i < 15; i++) m[8]![14 - i] = bit(i);
  for (let i = 0; i < 8; i++) m[8]![N - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) m[N - 15 + i]![8] = bit(i);
  m[N - 8]![8] = true; // módulo oscuro
}

/** Penalidad ISO (4 reglas) para elegir la mejor máscara. */
function penalidad(m: boolean[][], N: number): number {
  let p = 0;
  // R1: rachas de 5+ del mismo color (filas y columnas)
  for (let y = 0; y < N; y++) {
    let run = 1;
    for (let x = 1; x <= N; x++) {
      if (x < N && m[y]![x] === m[y]![x - 1]) run++;
      else { if (run >= 5) p += 3 + (run - 5); run = 1; }
    }
  }
  for (let x = 0; x < N; x++) {
    let run = 1;
    for (let y = 1; y <= N; y++) {
      if (y < N && m[y]![x] === m[y - 1]![x]) run++;
      else { if (run >= 5) p += 3 + (run - 5); run = 1; }
    }
  }
  // R2: bloques 2×2 del mismo color
  for (let y = 0; y < N - 1; y++) {
    for (let x = 0; x < N - 1; x++) {
      const c = m[y]![x]!;
      if (m[y]![x + 1] === c && m[y + 1]![x] === c && m[y + 1]![x + 1] === c) p += 3;
    }
  }
  // R3: patrón tipo finder 1:1:3:1:1 con 4 claros a un lado (filas y columnas)
  const PA = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const PB = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const casa = (arr: boolean[]): number => {
    let c = 0;
    for (let i = 0; i + 11 <= arr.length; i++) {
      let a = true;
      let b = true;
      for (let j = 0; j < 11; j++) {
        const v = arr[i + j] ? 1 : 0;
        if (v !== PA[j]) a = false;
        if (v !== PB[j]) b = false;
      }
      if (a || b) c++;
    }
    return c;
  };
  for (let y = 0; y < N; y++) {
    p += 40 * casa(m[y]!.map(Boolean));
    const col: boolean[] = [];
    for (let x = 0; x < N; x++) col.push(m[x]![y]!);
    p += 40 * casa(col);
  }
  // R4: proporción de oscuros cerca del 50%
  let dark = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y]![x]) dark++;
  p += Math.floor(Math.abs((dark * 100) / (N * N) - 50) / 5) * 10;
  return p;
}

/** Genera la matriz final del QR. null si el texto no cabe en v1-10. */
export function qrMatriz(texto: string, nivel: 'L' | 'M' = 'M'): boolean[][] | null {
  if (!texto) return null;
  const bytes = new TextEncoder().encode(texto);
  const v = elegirVersion(bytes.length, nivel);
  if (!v) return null;

  const { m, fn, N } = lienzo(v);
  colocar(m, fn, N, palabrasDatos(bytes, nivel, v));

  // elegir máscara por penalidad (aplicada solo a módulos de datos)
  let mejor: boolean[][] | null = null;
  let mejorP = Infinity;
  let mejorMask = 0;
  for (let mask = 0; mask < 8; mask++) {
    const copia: (boolean | null)[][] = m.map((fila) => fila.slice());
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!fn[y]![x] && copia[y]![x] !== null) {
          copia[y]![x] = (copia[y]![x] as boolean) !== MASCARAS[mask]!(x, y);
        }
      }
    }
    dibujarFormato(copia, N, nivel, mask);
    const solida = copia.map((f) => f.map(Boolean));
    const p = penalidad(solida, N);
    if (p < mejorP) { mejorP = p; mejor = solida; mejorMask = mask; }
  }
  void mejorMask;
  return mejor;
}

// ── Componente React: QR como SVG imprimible ────────────────────────────────
export default function QrCodigo({
  texto, lado = '22mm', className = '',
}: { texto: string; lado?: string; className?: string }) {
  const matriz = useMemo(() => qrMatriz(texto, 'M') ?? qrMatriz(texto, 'L'), [texto]);
  if (!matriz) return null;
  const N = matriz.length;
  const QZ = 4; // zona blanca obligatoria alrededor (quiet zone)
  const dim = N + QZ * 2;
  let d = '';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (matriz[y]![x]) d += `M${x + QZ} ${y + QZ}h1v1h-1z`;
    }
  }
  return (
    <svg
      role="img"
      aria-label="Código QR de verificación de la factura"
      viewBox={`0 0 ${dim} ${dim}`}
      shapeRendering="crispEdges"
      style={{ width: lado, height: lado }}
      className={className}
    >
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}