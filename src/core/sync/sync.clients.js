import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';
import * as Pending from './sync.pending';
import { diffAndMerge, applyIncrementalDelta } from './sync.diff';


export async function syncClients() {
  try {
    console.log('🔄 Sincronizando clientes...');

    const syncStartedAt = new Date(Date.now() - 10_000).toISOString();
    const lastSync = await StorageService.getItem(STORAGE_KEYS.LAST_SYNC_CLIENTS);
    const isIncremental = !!lastSync;

    const domain = isIncremental
      ? ['|', ['active', '=', true], ['active', '=', false], ['write_date', '>', lastSync]]
      : [['active', '=', true]];

    const clients = await OdooService.searchRead(
      'res.partner',
      domain,
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

    const previous = (await StorageService.getItem(STORAGE_KEYS.CLIENTS)) || [];
    const pending = (await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES)) || [];
    const protectedIds = new Set(pending.filter(p => p.model === 'res.partner').map(p => p.recordId));

    const { merged, stats } = isIncremental
      ? applyIncrementalDelta(previous, clients, protectedIds)
      : diffAndMerge(previous, clients, protectedIds);

    await StorageService.setItem(STORAGE_KEYS.CLIENTS, merged);
    await StorageService.setItem(STORAGE_KEYS.LAST_SYNC_CLIENTS, syncStartedAt);
    console.log('✅ Clientes sincronizados:', merged.length, `(creados: ${stats.created}, actualizados: ${stats.updated})`);
    return { clients: merged, stats };
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

export async function getClientById(clientId) {
  const clients = await getLocalClients();
  return clients.find(c => c.id === clientId) || null;
}

/**
 * Crea un cliente localmente y encola la creación pendiente.
 */
export async function createClientLocally(clientData = {}) {
  try {
    const tempId = -Math.floor(Math.random() * 1000000);
    const nowIso = new Date().toISOString();
    const client = { id: tempId, ...clientData, active: true, create_date: nowIso, write_date: nowIso };
    const clients = (await StorageService.getItem(STORAGE_KEYS.CLIENTS)) || [];
    clients.push(client);
    await StorageService.setItem(STORAGE_KEYS.CLIENTS, clients);
    await Pending.addPendingChange('res.partner', tempId, { ...clientData, _is_creation: true });
    return client;
  } catch (error) {
    console.error(' Error creando cliente localmente:', error);
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
  getClientById,
  createClientLocally,
};