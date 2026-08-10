import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';

const MAX_LOCAL_LOGS = 300;
const listeners = new Set();

export function onLogEntry(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function logSyncOperation({
  direction,
  model,
  resId = 0,
  state,
  attempts = 1,
  errorMessage = null,
}) {
  const entry = {
    user_id: OdooService.uid,
    date: new Date().toISOString(),
    state,
    attempts,
    direction,
    model,
    res_id: resId,
    error_message: errorMessage || false,
  };

  try {
    const logs = (await StorageService.getItem(STORAGE_KEYS.SYNC_LOG)) || [];
    logs.unshift(entry);
    if (logs.length > MAX_LOCAL_LOGS) logs.length = MAX_LOCAL_LOGS;
    await StorageService.setItem(STORAGE_KEYS.SYNC_LOG, logs);
    listeners.forEach(cb => cb(entry));
  } catch (e) {
    console.warn('No se pudo guardar sync.log localmente:', e);
  }

  try {
    await OdooService.create('sync.log', {
      user_id: entry.user_id,
      date: entry.date.replace('T', ' ').split('.')[0],
      state: entry.state,
      attempts: entry.attempts,
      direction: entry.direction,
      model: entry.model,
      res_id: entry.res_id,
      error_message: entry.error_message,
    });
  } catch (e) {
    try {
      const tempId = -Math.floor(Math.random() * 1e6);
      const pending = (await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES)) || [];
      pending.push({ model: 'sync.log', recordId: tempId, updates: { ...entry, date: entry.date.replace('T', ' ').split('.')[0], _is_creation: true }, timestamp: new Date().toISOString() });
      await StorageService.setItem(STORAGE_KEYS.PENDING_CHANGES, pending);
    } catch {}
  }
}

export async function getLocalSyncLogs() {
  try {
    const logs = (await StorageService.getItem(STORAGE_KEYS.SYNC_LOG)) || [];
    return logs.filter(e => e.user_id === OdooService.uid);
  } catch {
    return [];
  }
}

export async function clearLocalSyncLogs() {
  await StorageService.setItem(STORAGE_KEYS.SYNC_LOG, []);
}

export default { logSyncOperation, getLocalSyncLogs, clearLocalSyncLogs, onLogEntry };
