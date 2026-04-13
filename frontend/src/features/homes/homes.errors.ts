import { isApiError } from '@/lib/api/api-client';

type HomesErrorContext = 'create' | 'list';

export function getHomesErrorMessage(error: unknown, context: HomesErrorContext) {
  if (isApiError(error)) {
    if (error.code === 'INVALID_BODY') {
      return 'Revisa los datos del hogar e intenta de nuevo.';
    }

    if (error.code === 'INVALID_QUERY' || error.code === 'INVALID_RANGE') {
      return 'No se pudo calcular el consumo de hoy.';
    }

    if (error.code === 'UNAUTHORIZED') {
      return 'Tu sesion expiro. Inicia sesion de nuevo.';
    }
  }

  if (context === 'create') {
    return 'No se pudo crear el hogar. Intenta de nuevo.';
  }

  return 'No se pudieron cargar tus hogares.';
}
