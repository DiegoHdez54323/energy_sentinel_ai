import { isApiError } from '@/lib/api/api-client';

export function getDeviceDetailErrorMessage(error: unknown) {
  if (isApiError(error)) {
    if (error.code === 'DEVICE_NOT_FOUND') {
      return 'No encontramos este dispositivo. Vuelve al dashboard para elegir otro.';
    }

    if (error.status >= 500) {
      return 'No pudimos cargar el detalle del dispositivo. Intenta de nuevo en unos segundos.';
    }
  }

  return 'No pudimos cargar el detalle del dispositivo. Revisa tu conexion e intenta de nuevo.';
}
