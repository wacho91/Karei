// Notificaciones con SweetAlert2 — tema oscuro Kärei
import Swal from 'sweetalert2';

const tema = {
  background: '#18181b',
  color: '#e4e4e7',
  confirmButtonColor: '#f59e0b',
  cancelButtonColor: '#3f3f46',
  confirmButtonText: 'Aceptar',
  cancelButtonText: 'Cancelar',
};

/** Confirmación modal (reemplaza window.confirm). Devuelve true si acepta. */
export async function confirmar(titulo: string, texto = '', botonOk = 'Sí, continuar'): Promise<boolean> {
  const r = await Swal.fire({
    ...tema,
    icon: 'question',
    title: titulo,
    text: texto,
    showCancelButton: true,
    confirmButtonText: botonOk,
    reverseButtons: true,
  });
  return r.isConfirmed;
}

/** Éxito breve: toast arriba a la derecha, se cierra solo. */
export function toastOk(titulo: string) {
  return Swal.fire({
    ...tema,
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: titulo,
    showConfirmButton: false,
    timer: 2200,
    timerProgressBar: true,
  });
}

/** Aviso en modal (amarillo). */
export function alertaAviso(titulo: string, texto = '') {
  return Swal.fire({ ...tema, icon: 'warning', title: titulo, text: texto || undefined });
}

/** Éxito en modal (verde). */
export function alertaOk(titulo: string, texto = '') {
  return Swal.fire({ ...tema, icon: 'success', title: titulo, text: texto || undefined });
}

/** Error en modal (rojo). */
export function alertaError(titulo: string, texto = '') {
  return Swal.fire({ ...tema, icon: 'error', title: titulo, text: texto || undefined });
}

/** Error con detalle técnico en varias líneas (diagnóstico de rutas). */
export function alertaErrorTecnico(titulo: string, lineas: string[]) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Swal.fire({
    ...tema,
    icon: 'error',
    title: titulo,
    html: `<div style="text-align:left;font-family:monospace;font-size:12px;line-height:1.8;max-height:70vh;overflow-y:auto">${lineas.map(esc).join('<br/>')}</div>`,
    confirmButtonText: 'Entendido',
    width: 560,
  });
}