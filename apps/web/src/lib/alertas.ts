// src/lib/alertas.ts — v2 · E-14t41 — AVISOS CON SWEETALERT2 (tema Kārei)
// ─────────────────────────────────────────────────────────────────────────
// Se acabó el cuadrito gris "localhost:3000 dice: ..." del navegador.
// Esta v2 pinta TODOS los avisos del ERP con SweetAlert2 en la paleta de
// la casa (slate-900 + ámbar), manteniendo la API de la v1 para que NO
// tengas que tocar ningún otro archivo que ya las use:
//
//   toastOk(msg)                     → toast verde (esquina superior derecha)
//   alertaError(titulo, detalle?)    → toast rojo (con detalle gris opcional)
//   alertaAviso(titulo, detalle?)    → toast ámbar
//
// Y añade lo que faltaba para confirmaciones y resúmenes:
//
//   confirmarAccion({...})           → Promise<boolean> · reemplaza window.confirm
//       { titulo, texto?, textoSi?, textoNo?, peligro?, icono? }
//   avisoExito(titulo, texto?)       → ventana de éxito para resúmenes
//
// REQUISITO (una sola vez):  npm install sweetalert2
//   · SweetAlert2 v11 trae los estilos incluidos: NO hay que importar CSS.
//   · Si Vite pregunta por "new dependencies optimized", acepta (o reinicia
//     npm run dev) y listo.
//
// BLINDAJE: si el paquete no estuviera (o el chunk fallara al cargar), el
// archivo NO tumba la app: los toasts degradan a un mini-toast DOM propio
// y las confirmaciones a window.confirm / window.alert. Todo con await.
// ─────────────────────────────────────────────────────────────────────────

let _swalProm: Promise<any> | null = null;

/** Carga sweetalert2 UNA sola vez. Devuelve null si no está disponible. */
function swal(): Promise<any> {
  if (!_swalProm) {
    _swalProm = import('sweetalert2')
      .then((m: any) => m?.default ?? m)
      .catch(() => null);
  }
  return _swalProm;
}

// Paleta Kārei
const FONDO = '#0f172a';      // slate-900
const TEXTO = '#e2e8f0';      // slate-200
const GRIS = '#94a3b8';       // slate-400
const AMBAR = '#f59e0b';      // amber-500
const ROJO = '#ef4444';       // red-500
const VERDE = '#34d399';      // emerald-400
const CANCELAR = '#334155';   // slate-700

const _esc = (s: any) =>
  String(s ?? '').replace(/[&<>"']/g, (c: string) =>
    (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]));

/** Texto multi-línea → bloque html escapado (undefined si viene vacío). */
const _html = (texto?: string, estilo = 'font-size:12.5px;color:#94a3b8;margin-top:6px;line-height:1.5') =>
  texto == null || texto === '' ? undefined
    : `<div style="${estilo}">${_esc(texto).replace(/\n/g, '<br/>')}</div>`;

// ── Fallback DOM (solo si sweetalert2 no está instalado) ────────────────
function _toastDOM(msg: string, color: string, icono: string) {
  try {
    const d = document.createElement('div');
    d.textContent = `${icono} ${msg}`;
    d.style.cssText =
      `position:fixed;top:16px;right:16px;z-index:99999;background:${FONDO};` +
      `color:${TEXTO};border:1px solid ${color}55;border-left:4px solid ${color};` +
      'padding:10px 14px;border-radius:12px;font-size:13px;max-width:340px;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.35);transition:opacity .3s;opacity:0';
    (document.body ?? document.documentElement).appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = '1'; });
    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 350); }, 3600);
  } catch { console.log(icono, msg); }
}

// ── API v1 · compatibilidad total (nada más tiene que cambiar) ──────────
export async function toastOk(msg: string): Promise<any> {
  const S = await swal();
  if (!S) return _toastDOM(msg, VERDE, '✅');
  return S.fire({
    toast: true, position: 'top-end', showConfirmButton: false,
    timer: 3400, timerProgressBar: true,
    background: FONDO, color: TEXTO, padding: '10px 14px',
    icon: 'success', iconColor: VERDE, title: msg,
  });
}

export async function alertaError(titulo: string, detalle?: string): Promise<any> {
  const S = await swal();
  if (!S) return _toastDOM(detalle ? `${titulo}: ${detalle}` : titulo, ROJO, '⛔');
  return S.fire({
    toast: true, position: 'top-end', showConfirmButton: false,
    timer: 5000, timerProgressBar: true,
    background: FONDO, color: TEXTO, padding: '10px 14px',
    icon: 'error', iconColor: '#f87171', title: titulo,
    html: _html(detalle),
  });
}

export async function alertaAviso(titulo: string, detalle?: string): Promise<any> {
  const S = await swal();
  if (!S) return _toastDOM(detalle ? `${titulo}: ${detalle}` : titulo, '#fbbf24', '⚠️');
  return S.fire({
    toast: true, position: 'top-end', showConfirmButton: false,
    timer: 4600, timerProgressBar: true,
    background: FONDO, color: TEXTO, padding: '10px 14px',
    icon: 'warning', iconColor: '#fbbf24', title: titulo,
    html: _html(detalle),
  });
}

// ── NUEVO v2 · confirmación bonita (reemplaza window.confirm) ───────────
export interface ConfirmaOpts {
  titulo: string;
  texto?: string;      // explicación (acepta saltos de línea \n)
  textoSi?: string;    // botón confirmar (def: "Sí, adelante")
  textoNo?: string;    // botón cancelar (def: "Cancelar")
  peligro?: boolean;   // true → botón rojo y el foco queda en Cancelar
  icono?: 'warning' | 'question' | 'info';
}

export async function confirmarAccion(o: ConfirmaOpts | string): Promise<boolean> {
  const opts: ConfirmaOpts =
    typeof o === 'string' ? { titulo: o } : (o ?? { titulo: '¿Seguro?' });
  const S = await swal();
  if (!S) return window.confirm(`${opts.titulo}${opts.texto ? '\n\n' + opts.texto : ''}`);
  const r = await S.fire({
    title: opts.titulo,
    html: _html(opts.texto, 'font-size:13.5px;color:#e2e8f0;margin-top:8px;line-height:1.55'),
    icon: opts.icono ?? (opts.peligro ? 'warning' : 'question'),
    iconColor: opts.peligro ? '#f87171' : '#fbbf24',
    showCancelButton: true,
    confirmButtonText: opts.textoSi ?? 'Sí, adelante',
    cancelButtonText: opts.textoNo ?? 'Cancelar',
    confirmButtonColor: opts.peligro ? ROJO : AMBAR,
    cancelButtonColor: CANCELAR,
    reverseButtons: true,
    focusCancel: !!opts.peligro,
    background: FONDO, color: TEXTO,
    buttonsStyling: true,
  });
  return !!r?.isConfirmed;
}

// ── NUEVO v2 · ventana de éxito (resúmenes tipo "limpieza lista") ───────
export async function avisoExito(titulo: string, texto?: string): Promise<any> {
  const S = await swal();
  if (!S) return window.alert(`${titulo}${texto ? '\n\n' + texto : ''}`);
  return S.fire({
    title: titulo,
    html: _html(texto, 'font-size:13.5px;color:#cbd5e1;line-height:1.6'),
    icon: 'success', iconColor: VERDE,
    confirmButtonText: 'Listo', confirmButtonColor: AMBAR,
    background: FONDO, color: TEXTO,
  });
}

export default { toastOk, alertaError, alertaAviso, avisoExito, confirmarAccion };