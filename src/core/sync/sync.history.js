import { STORAGE_KEYS } from './sync.constants';
import StorageService from '../storage/storage.service';
import { SYNC_STATUS, SYNC_DIRECTIONS, ODOO_MODELS } from './sync.history.constants';

const MAX_HISTORY_RECORDS = 50;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Estructura mejorada para un entry de historial
 */
function createSyncEntry(overrides = {}) {
  return {
    id: generateId(),
    timestamp: new Date().toISOString(),
    type: 'syncAll',
    direction: 'both',
    status: 'success',
    duration: 0, // ms
    
    // Desglose por dirección
    pull: {
      totalModels: 0,
      totalRecords: 0,
      models: {}, // { 'res.partner': { count: 10, status: 'success' }, ... }
      status: 'idle', // idle, syncing, success, partial, failed
      errors: [], // [ { model, error, count } ]
    },
    
    push: {
      totalModels: 0,
      totalRecords: 0,
      models: {}, // { 'project.task': { created: 2, updated: 3, deleted: 1, errors: 0 }, ... }
      status: 'idle',
      errors: [], // [ { model, operation, count, error } ]
    },
    
    // Metadata
    phaseSequence: [],
    ...overrides,
  };
}

/**
 * Registra un entry de sincronización con detalles granulares
 */
export async function addSyncHistoryEntry(entry) {
  try {
    const history = await StorageService.getItem(STORAGE_KEYS.SYNC_HISTORY) || [];
    
    const newEntry = {
      id: entry.id || generateId(),
      timestamp: entry.timestamp || new Date().toISOString(),
      ...entry,
    };
    
    // Validar estructura mínima
    if (!newEntry.type || !newEntry.direction || !newEntry.status) {
      console.warn('⚠️ Entry de sync incompleto:', newEntry);
    }
    
    history.unshift(newEntry);
    
    if (history.length > MAX_HISTORY_RECORDS) {
      history.length = MAX_HISTORY_RECORDS;
    }
    
    await StorageService.setItem(STORAGE_KEYS.SYNC_HISTORY, history);
    return newEntry;
  } catch (error) {
    console.error('❌ Error guardando historial de sync:', error);
    return null;
  }
}

/**
 * Crea un entry de sync completo iniciado
 * Se usa al principio de syncAll()
 */
export function createSyncAllEntry(startTime = Date.now()) {
  return createSyncEntry({
    type: 'syncAll',
    direction: 'both',
    status: 'syncing',
    startTime,
    phaseSequence: ['MASTER', 'PENDING', 'CLIENTS', 'TASKS', 'LEADS', 'COMMENTS', 'SURVEYS', 'ATTACHMENTS'],
  });
}

/**
 * Actualiza un entry con resultados de una fase PULL
 */
export function recordPullPhase(entry, phaseName, models = {}, errors = []) {
  if (!entry.pull) entry.pull = { totalModels: 0, totalRecords: 0, models: {}, errors: [] };
  
  Object.assign(entry.pull.models, models);
  
  const totalRecords = Object.values(models).reduce((sum, m) => sum + (m.count || 0), 0);
  entry.pull.totalRecords += totalRecords;
  entry.pull.totalModels = Object.keys(entry.pull.models).length;
  
  if (errors.length > 0) {
    entry.pull.errors.push(...errors);
    entry.pull.status = 'partial';
  } else if (entry.pull.status !== 'partial') {
    entry.pull.status = 'success';
  }
  
  return entry;
}

/**
 * Actualiza un entry con resultados de una fase PUSH
 */
export function recordPushPhase(entry, operationsData = {}, errors = []) {
  if (!entry.push) entry.push = { totalModels: 0, totalRecords: 0, models: {}, errors: [] };
  
  Object.assign(entry.push.models, operationsData);
  
  const totalOps = Object.values(operationsData).reduce((sum, m) => {
    return sum + (m.created || 0) + (m.updated || 0) + (m.deleted || 0);
  }, 0);
  entry.push.totalRecords += totalOps;
  entry.push.totalModels = Object.keys(entry.push.models).length;
  
  if (errors.length > 0) {
    entry.push.errors.push(...errors);
    entry.push.status = 'partial';
  } else if (entry.push.status !== 'partial') {
    entry.push.status = 'success';
  }
  
  return entry;
}

/**
 * Finaliza un entry de sync
 */
export function finalizeSyncEntry(entry, finalStatus = 'success') {
  const duration = Date.now() - (entry.startTime || Date.now());
  
  // Determinar estado final basado en fases
  const pullFailed = entry.pull?.status === 'failed';
  const pushFailed = entry.push?.status === 'failed';
  const pullPartial = entry.pull?.status === 'partial';
  const pushPartial = entry.push?.status === 'partial';
  
  let status = finalStatus;
  if (pullFailed || pushFailed) {
    status = 'failed';
  } else if (pullPartial || pushPartial) {
    status = 'partial';
  }
  
  return {
    ...entry,
    status,
    duration,
    finishedAt: new Date().toISOString(),
  };
}

/**
 * Obtiene el historial completo
 */
export async function getSyncHistory() {
  try {
    return await StorageService.getItem(STORAGE_KEYS.SYNC_HISTORY) || [];
  } catch (error) {
    console.error('❌ Error obteniendo historial de sync:', error);
    return [];
  }
}

/**
 * Filtra historial por dirección (PULL, PUSH, BOTH)
 */
export async function getHistoryByDirection(direction) {
  const history = await getSyncHistory();
  return history.filter(h => h.direction === direction || h.direction === 'both');
}

/**
 * Filtra historial por estado
 */
export async function getHistoryByStatus(status) {
  const history = await getSyncHistory();
  return history.filter(h => h.status === status);
}

/**
 * Obtiene estadísticas agregadas del historial
 */
export async function getHistoryStats() {
  const history = await getSyncHistory();
  
  if (history.length === 0) {
    return {
      totalSyncs: 0,
      successful: 0,
      partial: 0,
      failed: 0,
      totalDuration: 0,
      lastSync: null,
      pullStats: { totalRecords: 0, totalModels: 0 },
      pushStats: { totalRecords: 0, totalModels: 0 },
    };
  }
  
  const stats = {
    totalSyncs: history.length,
    successful: 0,
    partial: 0,
    failed: 0,
    totalDuration: 0,
    lastSync: history[0]?.timestamp || null,
    pullStats: { totalRecords: 0, totalModels: 0, errors: 0 },
    pushStats: { totalRecords: 0, totalModels: 0, errors: 0 },
  };
  
  history.forEach(entry => {
    if (entry.status === 'success') stats.successful++;
    if (entry.status === 'partial') stats.partial++;
    if (entry.status === 'failed') stats.failed++;
    
    stats.totalDuration += entry.duration || 0;
    
    if (entry.pull) {
      stats.pullStats.totalRecords += entry.pull.totalRecords || 0;
      stats.pullStats.totalModels += entry.pull.totalModels || 0;
      stats.pullStats.errors += entry.pull.errors?.length || 0;
    }
    
    if (entry.push) {
      stats.pushStats.totalRecords += entry.push.totalRecords || 0;
      stats.pushStats.totalModels += entry.push.totalModels || 0;
      stats.pushStats.errors += entry.push.errors?.length || 0;
    }
  });
  
  return stats;
}

/**
 * Limpia el historial completamente
 */
export async function clearSyncHistory() {
  try {
    await StorageService.setItem(STORAGE_KEYS.SYNC_HISTORY, []);
  } catch (error) {
    console.error('❌ Error limpiando historial de sync:', error);
  }
}

/**
 * Obtiene el último sync
 */
export async function getLastSync() {
  try {
    const history = await getSyncHistory();
    return history.length > 0 ? history[0] : null;
  } catch (error) {
    console.error('❌ Error obteniendo último sync:', error);
    return null;
  }
}

export default {
  createSyncAllEntry,
  createSyncEntry,
  recordPullPhase,
  recordPushPhase,
  finalizeSyncEntry,
  addSyncHistoryEntry,
  getSyncHistory,
  getHistoryByDirection,
  getHistoryByStatus,
  getHistoryStats,
  clearSyncHistory,
  getLastSync,
};