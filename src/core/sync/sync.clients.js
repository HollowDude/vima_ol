import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';
import * as Pending from './sync.pending';


export async function syncClients() {
  try {
    console.log('🔄 Sincronizando clientes...');

    // ✅ Se descargan TODOS los clientes activos (sin filtro por user_id)
    const clients = await OdooService.searchRead(
      'res.partner',
      [
        ['active', '=', true]
      ],
      [
        'id', 'name', 'contact_person', 'email', 'phone', 'mobile',
        'street', 'street2', 'city', 'state_id', 'municipality',
        'country_id', 'vat', 'active', 'desc_primary_classification',
        'number_contract', 'agent_name', 'client_type', 'user_id',
        'parent_id', 'partner_latitude', 'partner_longitude',
        'write_date', 'date_localization', 'partner_code',
        'company_type', 'social_reason', 'customer_route', 'agent',
        'shipping_address', 'delivery_method', 'type_transport',
        'warehouse_area', 'contract', 'shipping_address_number',
        'primary_classification', 'code_partner_parent', 'desc_partner_parent',
        'partner_code',
      ],
      5000
    );

    await StorageService.setItem(STORAGE_KEYS.CLIENTS, clients);
    console.log('✅ Clientes sincronizados:', clients.length);
    return clients;
  } catch (error) {
    console.error('❌ Error sincronizando clientes:', error);
    throw error;
  }
}

/** Devuelve todos los clientes almacenados localmente (propios + ajenos). */
export async function getLocalClients() {
  try {
    const clients = await StorageService.getItem(STORAGE_KEYS.CLIENTS);
    return clients || [];
  } catch (error) {
    console.error(' Error leyendo clientes locales:', error);
    return [];
  }
}

/**
 * Devuelve únicamente los clientes cuyo user_id coincide con el usuario
 * autenticado actualmente. Se usa para asignar clientes en tareas / leads.
 */
export async function getOwnClients() {
  try {
    const clients = await getLocalClients();
    const currentUserId = OdooService.uid;
    if (!currentUserId) return clients;
    return clients.filter(c => {
      const clientUserId = Array.isArray(c.user_id) ? c.user_id[0] : c.user_id;
      return clientUserId === currentUserId;
    });
  } catch (error) {
    console.error(' Error leyendo clientes propios:', error);
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
 * Actualiza un cliente localmente y añade pending.
 * Solo se llama desde la UI para clientes propios (la restricción se aplica
 * en ClientDetailModal antes de llegar aquí).
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
  getOwnClients,
  getLocalMacrotasks,
  getLocalSubtasks,
  getLastSyncDate,
  updateClientLocally,
};