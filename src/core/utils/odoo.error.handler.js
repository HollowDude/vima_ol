/**
 * Manejador genérico de errores de Odoo
 * Detecta errores de autorización y otros errores, proporcionando
 * callbacks para que la app actúe en consecuencia
 */

// Tipos de error que Odoo puede retornar
export const ODOO_ERROR_TYPES = {
  // Errores de autenticación/autorización
  ACCESS_DENIED: 'AccessDenied',        // Credenciales inválidas/expiradas
  ACCESS_ERROR: 'AccessError',           // Permisos insuficientes
  SESSION_EXPIRED: 'SessionExpired',     // Sesión expirada
  
  // Otros errores
  VALIDATION_ERROR: 'ValidationError',
  SERVER_ERROR: 'ServerError',
  UNKNOWN: 'UnknownError',
};

/**
 * Detecta el tipo de error basado en la respuesta de Odoo
 */
export function detectOdooErrorType(error) {
  if (!error) return ODOO_ERROR_TYPES.UNKNOWN;

  const errorMessage = error.message || '';
  const errorName = error.name || '';

  // Errores de autorización
  if (
    errorMessage.includes('Access Denied') ||
    errorName.includes('AccessDenied') ||
    errorMessage.includes('odoo.exceptions.AccessDenied')
  ) {
    return ODOO_ERROR_TYPES.ACCESS_DENIED;
  }

  // Errores de permisos
  if (
    errorMessage.includes('AccessError') ||
    errorName.includes('AccessError') ||
    errorMessage.includes('odoo.exceptions.AccessError') ||
    errorMessage.includes('No puede') || // Mensaje en español de Odoo
    errorMessage.includes('Se permite esta operación') // Hint de permisos
  ) {
    return ODOO_ERROR_TYPES.ACCESS_ERROR;
  }

  // Sesión expirada
  if (
    errorMessage.includes('session') ||
    errorMessage.includes('Session') ||
    errorMessage.includes('token')
  ) {
    return ODOO_ERROR_TYPES.SESSION_EXPIRED;
  }

  return ODOO_ERROR_TYPES.UNKNOWN;
}

/**
 * Genera un mensaje amigable para el usuario basado en el tipo de error
 */
export function getErrorMessage(errorType, context = {}) {
  const messages = {
    [ODOO_ERROR_TYPES.ACCESS_DENIED]: {
      title: 'Sesión no válida',
      message: 'Tu sesión ha expirado o tu contraseña fue cambiada. Por favor, inicia sesión nuevamente.',
      action: 'LOGOUT',
    },
    [ODOO_ERROR_TYPES.ACCESS_ERROR]: {
      title: 'Permiso denegado',
      message: `No tienes permisos para realizar esta acción: "${context.action || 'operación'}".\n\nPonte en contacto con tu administrador para solicitar acceso.`,
      action: 'DISMISS',
    },
    [ODOO_ERROR_TYPES.SESSION_EXPIRED]: {
      title: 'Sesión expirada',
      message: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
      action: 'LOGOUT',
    },
    [ODOO_ERROR_TYPES.VALIDATION_ERROR]: {
      title: 'Error en los datos',
      message: context.details || 'Los datos que intentaste guardar no son válidos.',
      action: 'DISMISS',
    },
    [ODOO_ERROR_TYPES.SERVER_ERROR]: {
      title: 'Error del servidor',
      message: 'El servidor de Odoo no está disponible. Intenta más tarde.',
      action: 'RETRY',
    },
    [ODOO_ERROR_TYPES.UNKNOWN]: {
      title: 'Error inesperado',
      message: context.details || 'Ocurrió un error inesperado. Intenta de nuevo.',
      action: 'RETRY',
    },
  };

  return messages[errorType] || messages[ODOO_ERROR_TYPES.UNKNOWN];
}

/**
 * Manejador principal de errores de Odoo
 * 
 * @param {Error} error - El error capturado
 * @param {Object} callbacks - Funciones callback para ejecutar
 * @param {Function} callbacks.onLogout - Se ejecuta cuando hay error de autorización
 * @param {Function} callbacks.onShowToast - Se ejecuta para mostrar un toast con el mensaje
 * @param {Function} callbacks.onPermissionDenied - Se ejecuta cuando hay error de permisos (opcional)
 * @param {Object} context - Contexto adicional (ej: { action: 'crear tarea' })
 * 
 * @returns {Object} { type, message, action, shouldLogout }
 */
export function handleOdooError(error, callbacks = {}, context = {}) {
  const {
    onLogout = () => {},
    onShowToast = () => {},
    onPermissionDenied = () => {},
  } = callbacks;

  const errorType = detectOdooErrorType(error);
  const errorInfo = getErrorMessage(errorType, context);
  const shouldLogout = errorType === ODOO_ERROR_TYPES.ACCESS_DENIED;

  console.error(`[OdooErrorHandler] ${errorType}:`, error.message);

  // Ejecutar callbacks según el tipo de error
  if (shouldLogout) {
    console.warn('[OdooErrorHandler] Sesión inválida - desconectando usuario');
    onLogout();
    onShowToast(errorInfo.message, 'error', 5000);
  } else if (errorType === ODOO_ERROR_TYPES.ACCESS_ERROR) {
    console.warn('[OdooErrorHandler] Permiso denegado');
    onPermissionDenied(error, context);
    onShowToast(errorInfo.message, 'warning', 6000);
  } else {
    onShowToast(errorInfo.message, 'error', 5000);
  }

  return {
    type: errorType,
    title: errorInfo.title,
    message: errorInfo.message,
    action: errorInfo.action,
    shouldLogout,
  };
}

export default {
  ODOO_ERROR_TYPES,
  detectOdooErrorType,
  getErrorMessage,
  handleOdooError,
};