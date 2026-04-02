import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';
import * as Pending from './sync.pending';


export async function syncClients() {
  try {
    console.log('🔄 Sincronizando clientes...');
    const currentUserId = OdooService.uid;
    if (!currentUserId) {
      throw new Error('Usuario no autenticado');
    }

    const clients = await OdooService.searchRead(
      'res.partner',
      [
        ['user_id', '=', currentUserId],
        ['active', '=', true]
      ],
      [
        'id', 'name', 'contact_person', 'email', 'phone', 'mobile',
        'street', 'street2', 'city', 'state_id', 'municipality',
        'country_id', 'vat', 'active', 'desc_primary_classification',
        'number_contract', 'agent_name', 'client_type', 'user_id',
        'parent_id', 'partner_latitude', 'partner_longitude',
        'write_date', 'date_localization', 'partner_code',
      ],
      1000
    );

    await StorageService.setItem(STORAGE_KEYS.CLIENTS, clients);
    console.log('✅ Clientes sincronizados:', clients.length);
    return clients;
  } catch (error) {
    console.error('❌ Error sincronizando clientes:', error);
    throw error;
  }
}

export async function getLocalClients() {
  try {
    const clients = await StorageService.getItem(STORAGE_KEYS.CLIENTS);
    return clients || [];
  } catch (error) {
    console.error(' Error leyendo clientes locales:', error);
    return [];
  }
}

export async function getLocalMacrotasks() {
  try {
    const macrotasks = await StorageService.getItem(STORAGE_KEYS.MACROTASKS);
    return macrotasks || [];
  } catch (error) {
    console.error(' Error leyendo macrotasks locales:', error);
    return [];
  }
}

export async function getLocalSubtasks() {
  try {
    const subtasks = await StorageService.getItem(STORAGE_KEYS.TASKS);
    return subtasks || [];
  } catch (error) {
    console.error('Error leyendo subtareas locales:', error);
    return [];
  }
}

export async function getLastSyncDate() {
  try {
    const lastSync = await StorageService.getItem(STORAGE_KEYS.LAST_SYNC);
    return lastSync ? new Date(lastSync) : null;
  } catch (error) {
    return null;
  }
}

/**
 * Actualiza un cliente localmente y añade pending (ya implementado antes).
 */
export async function updateClientLocally(clientId, updates = {}, opts = {}) {
  try {
    const clients = (await StorageService.getItem(STORAGE_KEYS.CLIENTS)) || [];
    let found = false;
    const updatedClients = clients.map(c => {
      if (c.id === clientId) {
        found = true;
        return { ...c, ...updates, write_date: new Date().toISOString() };
      }
      return c;
    });

    if (!found) {
      const newClient = {
        id: clientId,
        ...updates,
        create_date: new Date().toISOString(),
        write_date: new Date().toISOString(),
      };
      updatedClients.push(newClient);
    }

    await StorageService.setItem(STORAGE_KEYS.CLIENTS, updatedClients);

    if (!opts.noPending) {
      await Pending.addPendingChange('res.partner', clientId, updates);
    }

    return (await StorageService.getItem(STORAGE_KEYS.CLIENTS)).find(c => c.id === clientId);
  } catch (error) {
    throw error;
  }
}

export default {
  syncClients,
  getLocalClients,
  getLocalMacrotasks,
  getLocalSubtasks,
  getLastSyncDate,
  updateClientLocally
};
