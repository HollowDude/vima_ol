/**
 * Constantes para el historial de sincronización mejorado
 * Define tipos de sync, direcciones, estados y detalles granulares
 */

// Direcciones de sincronización
export const SYNC_DIRECTIONS = {
  PULL: 'pull',      // Odoo → APK (descargas)
  PUSH: 'push',      // APK → Odoo (cargas)
  BOTH: 'both',      // Ciclo completo
};

// Estados de sincronización
export const SYNC_STATUS = {
  SUCCESS: 'success',      // Todo OK
  PARTIAL: 'partial',      // Algunos errores
  FAILED: 'failed',        // Falló completamente
  CANCELLED: 'cancelled',  // Cancelado por usuario
};

// Tipos de sincronización
export const SYNC_TYPES = {
  FULL: 'syncAll',              // Sincronización completa
  PENDING_ONLY: 'syncPending',  // Solo cambios pendientes (PUSH)
  MODULE: 'syncModule',         // Un módulo específico
};

// Modelos de Odoo con metadata
export const ODOO_MODELS = {
  'res.country': {
    label: 'Países',
    type: 'master',
    direction: 'pull',
  },
  'res.country.state': {
    label: 'Estados/Provincias',
    type: 'master',
    direction: 'pull',
  },
  'res.municipality': {
    label: 'Municipios',
    type: 'master',
    direction: 'pull',
  },
  'client.type': {
    label: 'Tipos de cliente',
    type: 'master',
    direction: 'pull',
  },
  'project.task.tags': {
    label: 'Etiquetas de tareas',
    type: 'master',
    direction: 'pull',
  },
  'crm.stage': {
    label: 'Etapas CRM',
    type: 'master',
    direction: 'pull',
  },
  'res.partner': {
    label: 'Clientes',
    type: 'data',
    direction: 'both',
  },
  'project.task': {
    label: 'Tareas',
    type: 'data',
    direction: 'both',
  },
  'crm.lead': {
    label: 'Oportunidades',
    type: 'data',
    direction: 'both',
  },
  'mail.message': {
    label: 'Comentarios',
    type: 'data',
    direction: 'pull',
  },
  'survey.survey': {
    label: 'Encuestas',
    type: 'data',
    direction: 'pull',
  },
  'survey.user_input': {
    label: 'Respuestas de encuestas',
    type: 'data',
    direction: 'push',
  },
  'ir.attachment': {
    label: 'Adjuntos',
    type: 'data',
    direction: 'both',
  },
};

// Fases de un sync completo (syncAll)
export const SYNC_PHASES_DETAILED = {
  MASTER: {
    order: 1,
    label: 'Sincronizar maestros',
    direction: 'pull',
    models: ['res.country', 'res.country.state', 'res.municipality', 'client.type', 'project.task.tags', 'crm.stage'],
  },
  PENDING: {
    order: 2,
    label: 'Enviar cambios pendientes',
    direction: 'push',
    models: ['project.task', 'crm.lead', 'res.partner', 'survey.user_input', 'ir.attachment', 'mail.message'],
  },
  CLIENTS: {
    order: 3,
    label: 'Descargar clientes',
    direction: 'pull',
    models: ['res.partner'],
  },
  TASKS: {
    order: 4,
    label: 'Descargar tareas',
    direction: 'pull',
    models: ['project.task'],
  },
  LEADS: {
    order: 5,
    label: 'Descargar oportunidades',
    direction: 'pull',
    models: ['crm.lead'],
  },
  COMMENTS: {
    order: 6,
    label: 'Descargar comentarios',
    direction: 'pull',
    models: ['mail.message'],
  },
  SURVEYS: {
    order: 7,
    label: 'Descargar encuestas',
    direction: 'pull',
    models: ['survey.survey'],
  },
  ATTACHMENTS: {
    order: 8,
    label: 'Descargar adjuntos',
    direction: 'pull',
    models: ['ir.attachment'],
  },
};

// Estadísticas de operación CRUD
export const OPERATION_TYPES = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  ERROR: 'error',
};

// Formato mejorado para entry de historial
export const SYNC_ENTRY_SCHEMA = {
  id: 'unique-id',
  timestamp: 'iso-date',
  type: 'syncAll | syncPending | syncModule',
  direction: 'pull | push | both',
  status: 'success | partial | failed | cancelled',
  
  // Detalles granulares por fase
  phases: [
    {
      name: 'MASTER',
      direction: 'pull',
      status: 'success | partial | failed',
      models: {
        'res.country': { count: 5, created: 0, updated: 5, errors: 0 },
        'res.country.state': { count: 10, created: 2, updated: 8, errors: 0 },
      },
    },
    {
      name: 'PENDING',
      direction: 'push',
      status: 'success | partial | failed',
      models: {
        'project.task': { count: 3, created: 1, updated: 2, deleted: 0, errors: 0 },
        'crm.lead': { count: 1, created: 0, updated: 1, deleted: 0, errors: 0 },
      },
    },
  ],
  
  // Resumen global
  summary: {
    totalOperations: 25,
    successful: 24,
    failed: 1,
    totalDuration: 5432, // ms
  },
  
  // Errores encontrados
  errors: [
    {
      model: 'project.task',
      recordId: -123,
      operation: 'create',
      error: 'Access Denied',
      message: 'No tienes permisos para crear tareas en este proyecto',
    },
  ],
};

export default {
  SYNC_DIRECTIONS,
  SYNC_STATUS,
  SYNC_TYPES,
  ODOO_MODELS,
  SYNC_PHASES_DETAILED,
  OPERATION_TYPES,
  SYNC_ENTRY_SCHEMA,
};