import { isApiError } from '@/lib/api/api-client';

type ShellyErrorContext = 'connect' | 'delete' | 'discover' | 'import' | 'list' | 'refresh';

export function getShellyErrorMessage(error: unknown, context: ShellyErrorContext) {
  if (isApiError(error)) {
    if (error.code === 'SHELLY_INTEGRATION_NOT_FOUND') {
      return 'Todavia no hay una cuenta Shelly conectada.';
    }

    if (
      error.code === 'SHELLY_DISCOVERY_FAILED' ||
      error.code === 'SHELLY_TOKEN_EXCHANGE_FAILED' ||
      error.code === 'INVALID_SHELLY_ACCESS_TOKEN' ||
      error.code === 'SHELLY_HOST_MISMATCH'
    ) {
      return 'Shelly no pudo validar la conexion. Intenta conectar tu cuenta de nuevo.';
    }

    if (error.code === 'HOME_NOT_FOUND') {
      return 'Selecciona un hogar valido antes de importar dispositivos.';
    }

    if (error.code === 'INVALID_BODY') {
      return 'Revisa los dispositivos seleccionados e intenta de nuevo.';
    }

    if (error.code === 'UNAUTHORIZED') {
      return 'Tu sesion expiro. Inicia sesion de nuevo.';
    }
  }

  if (context === 'connect') {
    return 'No se pudo iniciar la conexion con Shelly.';
  }

  if (context === 'delete') {
    return 'No se pudo desconectar Shelly.';
  }

  if (context === 'discover') {
    return 'No se pudieron buscar dispositivos Shelly.';
  }

  if (context === 'import') {
    return 'No se pudieron importar los dispositivos seleccionados.';
  }

  if (context === 'refresh') {
    return 'No se pudo re-sincronizar Shelly.';
  }

  return 'No se pudo cargar la integracion Shelly.';
}
