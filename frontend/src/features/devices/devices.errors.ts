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

export function getDevicesScreenErrorMessage(error: unknown) {
  if (isApiError(error)) {
    if (error.code === 'HOME_NOT_FOUND') {
      return 'No encontramos este hogar. Selecciona otro para ver sus dispositivos.';
    }

    if (error.status >= 500) {
      return 'No pudimos cargar los dispositivos. Intenta de nuevo en unos segundos.';
    }
  }

  return 'No pudimos cargar los dispositivos. Revisa tu conexion e intenta de nuevo.';
}

export function isDevicesHomeNotFound(error: unknown) {
  return isApiError(error) && error.code === 'HOME_NOT_FOUND';
}
