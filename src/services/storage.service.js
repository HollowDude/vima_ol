// src/services/storage.service.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@GEO_VIMA_CLIENTS_V1';

function normalizeClient(raw) {
  return {
    codigo: String(raw.codigo || '').trim(),
    nombre: String(raw.nombre || '').trim(),
    direccion: raw.direccion ? String(raw.direccion).trim() : '',
    vendedor: raw.vendedor ? String(raw.vendedor).trim() : '',
    lat: raw.lat ?? null,
    lng: raw.lng ?? null,
    registradoEn: raw.registradoEn ?? null,
  };
}

export default {
  async getClients() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return parsed.map(normalizeClient);
    } catch (e) {
      console.warn('Failed to parse clients from storage', e);
      return [];
    }
  },

  async saveClients(clients) {
    const normalized = clients.map(normalizeClient);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  },

  // Adds newClients but ignores those with codigo that already exist (dedupe by codigo)
  async addClientsDedup(newClients) {
    const existing = await this.getClients();
    const existingMap = new Map(existing.map(c => [c.codigo, c]));
    let added = 0;
    for (const raw of newClients) {
      const codigo = String(raw.codigo || '').trim();
      if (!codigo) continue;
      if (!existingMap.has(codigo)) {
        existingMap.set(codigo, normalizeClient(raw));
        added++;
      }
    }
    const merged = Array.from(existingMap.values());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return { added, total: merged.length };
  },

  // Update a client by codigo. Returns updated client or null if not found.
  async updateClient(codigo, patch = {}) {
    if (!codigo) throw new Error('codigo requerido para updateClient');
    const clients = await this.getClients();
    const idx = clients.findIndex(c => c.codigo === String(codigo).trim());
    if (idx === -1) return null;
    const existing = clients[idx];
    const updated = normalizeClient({ ...existing, ...patch });
    clients[idx] = updated;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
    return updated;
  },

  async clearAll() {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
};
