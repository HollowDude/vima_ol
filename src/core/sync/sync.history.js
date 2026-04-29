import { STORAGE_KEYS } from './sync.constants';
import StorageService from '../storage/storage.service';

const MAX_HISTORY_RECORDS = 50;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export async function addSyncHistoryEntry(entry) {
  try {
    const history = await StorageService.getItem(STORAGE_KEYS.SYNC_HISTORY) || [];
    
    const newEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    
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

export async function getSyncHistory() {
  try {
    return await StorageService.getItem(STORAGE_KEYS.SYNC_HISTORY) || [];
  } catch (error) {
    console.error('❌ Error obteniendo historial de sync:', error);
    return [];
  }
}

export async function clearSyncHistory() {
  try {
    await StorageService.setItem(STORAGE_KEYS.SYNC_HISTORY, []);
  } catch (error) {
    console.error('❌ Error limpiando historial de sync:', error);
  }
}

export default {
  addSyncHistoryEntry,
  getSyncHistory,
  clearSyncHistory,
};