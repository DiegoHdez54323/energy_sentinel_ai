import { isApiError } from '@/lib/api/api-client';

type AuthAction = 'bootstrap' | 'login' | 'logout' | 'register';

const DEFAULT_AUTH_ERROR_MESSAGES: Record<AuthAction, string> = {
  bootstrap: 'No se pudo restaurar la sesion.',
  login: 'No se pudo iniciar sesion.',
  logout: 'No se pudo cerrar sesion.',
  register: 'No se pudo crear la cuenta.',
};

export function getAuthErrorMessage(error: unknown, action: AuthAction) {
  if (!isApiError(error)) {
    return DEFAULT_AUTH_ERROR_MESSAGES[action];
  }

  switch (error.code) {
    case 'EMAIL_ALREADY_IN_USE':
      return 'Este correo ya esta registrado.';
    case 'INVALID_CREDENTIALS':
      return 'Correo o contrasena incorrectos.';
    case 'INVALID_REFRESH_TOKEN':
      return 'La sesion expiro. Vuelve a iniciar sesion.';
    case 'INVALID_BODY':
      return 'Revisa los datos ingresados.';
    case 'INTERNAL_SERVER_ERROR':
      return 'El servidor no pudo completar la solicitud.';
    default:
      return DEFAULT_AUTH_ERROR_MESSAGES[action];
  }
}
