import { isApiError } from '@/lib/api/api-client';

export function getDashboardErrorMessage(error: unknown) {
  if (isApiError(error)) {
    if (error.code === 'HOME_NOT_FOUND') {
      return 'No encontramos ese hogar. Selecciona otro para continuar.';
    }

    if (error.status >= 500) {
      return 'No pudimos cargar el dashboard. Intenta de nuevo en unos segundos.';
    }
  }

  return 'No pudimos cargar el dashboard. Revisa tu conexion e intenta de nuevo.';
}

export function isDashboardHomeNotFound(error: unknown) {
  return isApiError(error) && error.code === 'HOME_NOT_FOUND';
}
