import Swal from 'sweetalert2';

/** Toasts y confirmaciones de Kārei. Un solo lugar, tema Dark Mode Culinario. */

const toastBase = Swal.mixin({
  toast: true,
  position: 'bottom-end',
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  background: '#1e293b',
  color: '#e2e8f0',
});

export const toastExito = (mensaje: string) =>
  toastBase.fire({ icon: 'success', title: mensaje, iconColor: '#10b981' });

export const toastError = (mensaje: string) =>
  toastBase.fire({ icon: 'error', title: mensaje, iconColor: '#f43f5e' });

export const toastInfo = (mensaje: string) =>
  toastBase.fire({ icon: 'info', title: mensaje, iconColor: '#f59e0b' });

export const confirmarAccion = async (
  titulo: string,
  texto: string,
  textoConfirmar = 'Sí, continuar',
): Promise<boolean> => {
  const res = await Swal.fire({
    title: titulo,
    text: texto,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: textoConfirmar,
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#f59e0b',
    cancelButtonColor: '#334155',
    background: '#1e293b',
    color: '#e2e8f0',
  });
  return res.isConfirmed;
};