import { isApiError } from '@/lib/api/api-client';

export function getConsumptionErrorMessage(error: unknown) {
  if (isConsumptionHomeNotFound(error)) {
    return 'No encontramos este hogar. Selecciona otro para ver su consumo.';
  }

  if (isApiError(error) && error.status >= 500) {
    return 'No pudimos cargar el consumo del hogar. Intenta de nuevo en unos segundos.';
  }

  return 'No pudimos cargar el consumo del hogar. Revisa tu conexion e intenta de nuevo.';
}

export function isConsumptionHomeNotFound(error: unknown) {
  return (
    (isApiError(error) && error.code === 'HOME_NOT_FOUND')
    || (error instanceof Error && error.message === 'HOME_NOT_FOUND')
  );
}
